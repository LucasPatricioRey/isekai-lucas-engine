const crypto = require("node:crypto");

const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const KnowledgeRecord = require("../models/KnowledgeRecord");
const JobContract = require("../models/JobContract");
const MagicTechnique = require("../models/MagicTechnique");
const Item = require("../models/Item");
const ShopStock = require("../models/ShopStock");
const { relationshipBand } = require("./socialLedgerService");
const {
  detectSafeMagicPracticePlan,
  routeTurnIntent,
} = require("./turnCapabilityRouterService");
const {
  buildTurnContext,
  hydrateTurnSlotCatalogs,
} = require("./turnContextService");
const {
  buildDestinationAliases,
  resolveSafeMagicPracticeSlot,
  resolveSimpleMealPurchaseSlot,
} = require("./turnSlotResolverService");
const { formatCopper } = require("../utils/mechanicalChangeDisplay");

const DEFAULT_GAME_ID = "isekai_lucas_main";
const SCHEMA_VERSION = "turn_intake_v1";
const COMMON_RESOLVER_UNSUPPORTED_DOMAINS = new Set([
  "magic",
  "economy",
  "inventory_evidence",
  "combat_injury",
]);

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function truncateText(value = "", maxLength = 180) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

function textMatchesAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function isQuestionLike(text) {
  return textMatchesAny(text, [
    /\?/,
    /\b(pregunta|decime|decirme|dime|cuentame|contame|a que hora|cuando|que esta|que hace|que cuenta|que estas)\b/,
  ]);
}

function detectSocialQuestionType(text) {
  if (
    textMatchesAny(text, [
      /\b(a que hora|horario|cuando)\b.*\b(empieza|empiezas|arranca|arrancas|trabaja|trabajas|abre|llega)\b/,
      /\b(si tuvieras que decirme un horario|si tienes que decirme un horario|si tenes que decirme un horario)\b/,
    ])
  ) {
    return "routine_schedule";
  }
  if (textMatchesAny(text, [/\b(si siempre trabaja|trabaja hasta tan tarde|hasta tan tarde)\b/])) {
    return "work_pattern";
  }
  if (
    textMatchesAny(text, [
      /\b(que esta haciendo|que estas haciendo|que hace|que cuenta|que esta contando|que estas contando|que contando)\b/,
      /\b(queda mucho por cerrar|queda mucho|cuanto falta por cerrar)\b/,
    ])
  ) {
    return "current_task";
  }
  return isQuestionLike(text) ? "social_question" : "";
}

function isReadOnlyNpcTaskQuestion(text) {
  return ["routine_schedule", "work_pattern", "current_task"].includes(detectSocialQuestionType(text));
}

function classifyTurn({ text = "", aiClassification = null, destinationAliases = undefined } = {}) {
  return routeTurnIntent({ text, aiClassification, destinationAliases }).route;
}

function actorHintsFromClassification(aiClassification = null) {
  return unique([
    ...asArray(aiClassification?.targetNpcIds),
    aiClassification?.targetNpcId,
    ...asArray(aiClassification?.actors),
    ...asArray(aiClassification?.actorNames),
  ].map((value) => String(value || "").trim()));
}

function normalizeNpcId(value = "") {
  const text = String(value || "").trim();
  return text.startsWith("npc_") ? text : "";
}

function latestSocialLog(logs = []) {
  return logs.find((log) => {
    if (isTechnicalLog(log)) return false;
    const tags = (log.tags || []).map((tag) => String(tag || "").toLowerCase());
    const type = String(log.type || "").toLowerCase();
    const summary = normalizeText(log.summary || "");
    const hasNpc = (log.involvedNpcIds || []).length > 0;
    if (!hasNpc) return false;
    return (
      tags.includes("social") ||
      type.includes("social") ||
      type.includes("talk") ||
      /\b(hablo|habla|converso|conversa|charlo|charla|pregunto|pregunta|saludo|saluda)\b/.test(summary)
    );
  }) || null;
}

function inferContinuityTargetNpcId({ latestLogs = [], lastTargetNpcId = "" } = {}) {
  const direct = normalizeNpcId(lastTargetNpcId);
  if (direct) {
    return {
      npcId: direct,
      source: "request.lastTargetNpcId",
    };
  }

  const log = latestSocialLog(latestLogs);
  const npcId = normalizeNpcId((log?.involvedNpcIds || [])[0]);
  return npcId
    ? {
        npcId,
        source: `latestSocialLog:${log.logId || ""}`,
      }
    : {
        npcId: "",
        source: "",
      };
}

function npcNameMatchesText(npc = {}, text = "", hints = []) {
  const normalizedText = normalizeText(text);
  const normalizedHints = hints.map(normalizeText);
  const id = String(npc.npcId || "");
  const name = String(npc.name || "");
  const normalizedName = normalizeText(name);
  const firstName = normalizeText(name.split(/\s+/)[0] || "");

  if (normalizedHints.includes(normalizeText(id))) return true;
  if (normalizedHints.includes(normalizedName)) return true;
  if (firstName && normalizedHints.includes(firstName)) return true;
  if (normalizedName && normalizedText.includes(normalizedName)) return true;
  return Boolean(firstName && firstName.length >= 3 && normalizedText.includes(firstName));
}

function selectTargetNpc({ npcs = [], text = "", aiClassification = null, continuityTargetNpcId = "" } = {}) {
  const hints = actorHintsFromClassification(aiClassification);
  const explicit = [...npcs]
    .sort((left, right) => String(right.name || "").length - String(left.name || "").length)
    .find((npc) => npcNameMatchesText(npc, text, hints));
  if (explicit) return explicit;

  const continuity = normalizeNpcId(continuityTargetNpcId);
  if (continuity && isQuestionLike(normalizeText(text))) {
    return npcs.find((npc) => npc.npcId === continuity) || null;
  }

  return null;
}

function relationshipSummary(relationship = {}) {
  const fields = ["trust", "familiarity", "affection", "suspicion", "respect", "fear", "jealousy", "socialDebt"];
  return Object.fromEntries(
    fields.map((field) => {
      const value = Number(relationship[field]) || 0;
      return [
        field,
        {
          value,
          band: field === "socialDebt" ? null : relationshipBand(value),
        },
      ];
    })
  );
}

function compactNpcSocialProfile(npc = {}) {
  const socialProfile = npc.socialProfile || {};
  const emotionalProfile = npc.emotionalProfile || {};
  const director = npc.flags?.dialogueDirector || null;

  return {
    npcId: npc.npcId,
    name: npc.name,
    role: npc.role || "",
    currentTask: truncateText(npc.currentTask || "", 120),
    availability: npc.availability || {},
    relationship: relationshipSummary(npc.relationshipWithLucas || {}),
    voice: {
      speechStyle: truncateText(npc.speechStyle || "", 140),
      personality: (npc.personality || []).slice(0, 5),
      values: (npc.values || []).slice(0, 4),
      tolerates: (npc.tolerates || []).slice(0, 3),
      rejects: (npc.rejects || []).slice(0, 3),
      boundaries: (socialProfile.boundaries || []).slice(0, 4),
    },
    emotional: {
      defaultMood: truncateText(emotionalProfile.defaultMood || "", 100),
      coreDrives: (emotionalProfile.coreDrives || []).slice(0, 2),
      coreFears: (emotionalProfile.coreFears || []).slice(0, 2),
      visibleTells: (emotionalProfile.visibleTells || []).slice(0, 3),
      contradiction: truncateText(emotionalProfile.contradiction || "", 140),
      sceneHooks: (emotionalProfile.sceneHooks || []).slice(0, 2),
      rule: "No narrar mente privada; usar gesto, pausa, objeto, tarea o tono.",
    },
    dialogueDirector: director
      ? {
          cadence: truncateText(director.cadence || "", 90),
          emotionalRule: truncateText(director.emotionalRule || "", 110),
          reactFirst: truncateText(director.reactFirst || "", 100),
          sampleBeats: (director.sampleBeats || []).slice(0, 2).map((line) => truncateText(line, 100)),
          avoid: (director.avoid || []).slice(0, 2).map((line) => truncateText(line, 90)),
        }
      : null,
  };
}

function formatDiegeticDate(date = {}) {
  const day = date.day ?? "?";
  const month = date.month || "?";
  const year = date.year ?? "?";
  return `${day} de ${month}, A\u00f1o ${year}`;
}

function timeToMinutes(value = "") {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function routineContainsTime(entry = {}, time = "") {
  const current = timeToMinutes(time);
  const start = timeToMinutes(entry.timeStart);
  const end = timeToMinutes(entry.timeEnd);
  if (current === null || start === null || end === null) return false;
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function isRestRoutineTask(task = "") {
  const normalized = normalizeText(task);
  return /\b(descans|durmi|duerm|suen|libre)\b/.test(normalized);
}

function routineLine(entry = {}) {
  return `${entry.timeStart || "?"}-${entry.timeEnd || "?"}: ${entry.task || "sin tarea"}${
    entry.locationId ? ` (${entry.locationId})` : ""
  }`;
}

function buildRoutineBrief({ npc = {}, gameState = {}, questionType = "" } = {}) {
  const routineBase = Array.isArray(npc.routineBase) ? npc.routineBase : [];
  if (!routineBase.length) {
    return {
      schemaVersion: "npc_routine_brief_v1",
      available: false,
      questionType,
      answerGuidance:
        "No hay rutinaBase compacta para este NPC; responder con incertidumbre y no inventar horario exacto.",
    };
  }

  const currentEntry = routineBase.find((entry) => routineContainsTime(entry, gameState.time)) || null;
  const workEntries = routineBase.filter((entry) => !isRestRoutineTask(entry.task));
  const typicalStart = workEntries[0] || null;
  const relevantEntries =
    questionType === "routine_schedule" || questionType === "work_pattern"
      ? routineBase
      : [
          currentEntry,
          typicalStart,
        ].filter(Boolean);

  return {
    schemaVersion: "npc_routine_brief_v1",
    available: true,
    questionType,
    currentTime: gameState.time || "",
    currentEntry: currentEntry
      ? {
          timeStart: currentEntry.timeStart,
          timeEnd: currentEntry.timeEnd,
          locationId: currentEntry.locationId,
          task: currentEntry.task,
          displayLine: routineLine(currentEntry),
        }
      : null,
    typicalStart: typicalStart
      ? {
          time: typicalStart.timeStart,
          task: typicalStart.task,
          locationId: typicalStart.locationId,
          displayLine: routineLine(typicalStart),
        }
      : null,
    relevantLines: relevantEntries.map(routineLine).slice(0, 6),
    publicEnoughToAnswer: true,
    answerGuidance:
      questionType === "routine_schedule"
        ? "Usar typicalStart.time como dato canonico si el NPC puede contestar; expresarlo natural, no como ficha tecnica."
        : questionType === "work_pattern"
          ? "Usar relevantLines/currentEntry para explicar el patron de trabajo o descanso del NPC sin recitar la tabla."
          : "Usar currentEntry/currentTask para contestar con textura de escena.",
  };
}

function buildQuestionContext({ text = "", targetNpc = null, gameState = {} } = {}) {
  const normalized = normalizeText(text);
  const questionType = detectSocialQuestionType(normalized);
  if (!questionType) return null;
  const routineBrief = ["routine_schedule", "work_pattern", "current_task"].includes(questionType)
    ? buildRoutineBrief({ npc: targetNpc || {}, gameState, questionType })
    : null;

  return {
    schemaVersion: "social_question_context_v1",
    type: questionType,
    playerQuestion: text,
    targetNpcId: targetNpc?.npcId || "",
    targetNpcName: targetNpc?.name || "",
    canAnswerFromPacket: Boolean(routineBrief?.available || questionType === "social_question"),
    routineBrief,
    answerBoundary:
      "Responder como NPC y con conocimiento permitido. No llamar getNpcFull/searchDocs/getCompactContext para esta pregunta si route.supported=true.",
  };
}

function makeResolverClientTurnId({ gameState = {}, text = "" } = {}) {
  const hash = crypto
    .createHash("sha1")
    .update(`${gameState.gameId || DEFAULT_GAME_ID}:${gameState.currentDay || 0}:${gameState.time || ""}:${text}`)
    .digest("hex")
    .slice(0, 12);
  return `intake-d${gameState.currentDay || 0}-${String(gameState.time || "0000").replace(":", "")}-${hash}`;
}

function minutesUntilTargetTime(gameState = {}, targetTime = "") {
  const current = timeToMinutes(gameState.time || "");
  const target = timeToMinutes(targetTime);
  if (current === null || target === null) return null;
  return target > current ? target - current : target + 1440 - current;
}

function addMinutesToStateTime(gameState = {}, minutesToAdd = 0) {
  const current = timeToMinutes(gameState.time || "");
  const minutes = Number(minutesToAdd);
  if (current === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const total = current + Math.round(minutes);
  const dayDelta = Math.floor(total / 1440);
  const normalized = ((total % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const mins = normalized % 60;
  return {
    toDay: Number(gameState.currentDay || 0) + dayDelta,
    to: `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`,
  };
}

function materializeResolverPlan({ route = {}, gameState = {} } = {}) {
  const steps = [];
  const unsupportedReasons = [];
  const plan = route.resolverPlan || {};

  for (const rawStep of plan.steps || []) {
    const step = { ...rawStep };
    delete step.capabilityId;
    delete step.destinationName;

    if (step.targetTime && !step.minutes) {
      const minutes = minutesUntilTargetTime(gameState, step.targetTime);
      if (!Number.isInteger(minutes) || minutes <= 0) {
        unsupportedReasons.push(`${step.type || "step"} con targetTime invalido`);
        continue;
      }
      step.minutes = minutes;
      step.reason = step.reason || `Duracion calculada hasta ${step.targetTime}.`;
    }

    if (step.type === "travel" && (!step.toLocationId || step.toLocationId === gameState.locationId)) {
      unsupportedReasons.push("travel sin destino nuevo claro");
      continue;
    }

    delete step.targetTime;
    steps.push(step);
  }

  return {
    steps,
    unsupportedReasons: unique([
      ...asArray(plan.unsupportedReasons),
      ...unsupportedReasons,
    ]),
  };
}

function resolverPacketFromSteps({ route = {}, text = "", gameState = {}, steps = [], unsupportedReasons = [] } = {}) {
  if (steps.length === 0 || unsupportedReasons.length > 0) return null;
  const hasWork = steps.some((step) => step.type === "work_segment");
  const hasTravel = steps.some((step) => step.type === "travel");
  const hasRest = steps.some((step) => step.type === "rest");
  const actionFamily = hasWork ? "job_shift" : hasTravel ? "travel" : hasRest ? "rest" : "general_action";
  const resolverRequest = {
    gameId: gameState.gameId || DEFAULT_GAME_ID,
    clientTurnId: makeResolverClientTurnId({ gameState, text }),
    actionFamily,
    actionSummary: text,
    intent: {
      summary: text,
      generatedBy: route.resolverPlan ? "turn_capability_router_v1" : "turn_intake_common_resolver_v1",
      capabilityId: route.capabilityId || "",
    },
    sequence: steps,
    responseProfile: "compact",
  };

  return {
    schemaVersion: "turn_intake_resolver_packet_v1",
    supported: true,
    selectedOperation: "resolveTurn",
    confidence: "high",
    resolverRequest,
    unsupportedReasons,
    boundary:
      "Usar resolveTurn con resolverRequest. No llamar getCompactContext/searchDocs/getNpcFull/previews para esta accion comun.",
  };
}

function buildCommonResolverPacket({ route = {}, text = "", gameState = {} } = {}) {
  if (!route.needsMutation) return null;
  if ((route.domains || []).some((domain) => COMMON_RESOLVER_UNSUPPORTED_DOMAINS.has(domain))) return null;
  if ((route.domains || []).includes("mission_event") && /\b(mision|cartelera|evento|recompensa|reporte)\b/.test(normalizeText(text))) {
    return null;
  }

  if (route.resolverPlan?.steps?.length) {
    const materialized = materializeResolverPlan({ route, gameState });
    const packet = resolverPacketFromSteps({
      route,
      text,
      gameState,
      steps: materialized.steps,
      unsupportedReasons: materialized.unsupportedReasons,
    });
    if (packet) return packet;
  }
  return null;
}

function makeActionClientTurnId({ gameState = {}, text = "", operation = "action" } = {}) {
  const hash = crypto
    .createHash("sha1")
    .update(`${operation}:${gameState.gameId || DEFAULT_GAME_ID}:${gameState.currentDay || 0}:${gameState.time || ""}:${text}`)
    .digest("hex")
    .slice(0, 12);
  return `intake-${operation}-d${gameState.currentDay || 0}-${String(gameState.time || "0000").replace(":", "")}-${hash}`;
}

function shiftContainsTime(shift = {}, time = "") {
  const current = timeToMinutes(time);
  const start = timeToMinutes(shift.startTime);
  const end = timeToMinutes(shift.endTime);
  if (current === null || start === null || end === null) return false;
  if (start === end) return true;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function selectActiveShift(contract = {}, gameState = {}) {
  const shifts = (contract.shifts || []).filter((shift) => shift.status !== "inactive");
  return (
    shifts.find((shift) => shiftContainsTime(shift, gameState.time || "")) ||
    shifts.find((shift) => String(shift.status || "") === "active") ||
    shifts[0] ||
    null
  );
}

function shiftMatchesPreferredTime(shift = {}, preferredStartTime = "") {
  return preferredStartTime && shift.startTime === preferredStartTime;
}

function shiftMatchesText(shift = {}, normalizedText = "") {
  const name = normalizeText(`${shift.shiftId || ""} ${shift.name || ""}`);
  if (/\b(turno\s+de\s+la\s+tarde|turno\s+tarde)\b/.test(normalizedText)) {
    return shiftMatchesPreferredTime(shift, "14:00") || /\btarde\b/.test(name);
  }
  if (/\b(turno\s+de\s+la\s+manana|turno\s+manana)\b/.test(normalizedText)) {
    return shiftMatchesPreferredTime(shift, "07:00") || /\bmanana\b/.test(name);
  }
  return false;
}

function selectShiftForCompletion(contract = {}, gameState = {}, { text = "", plan = {} } = {}) {
  const shifts = (contract.shifts || []).filter((shift) => shift.status !== "inactive");
  const normalizedText = normalizeText(text);
  return (
    shifts.find((shift) => shiftMatchesPreferredTime(shift, plan.preferredShiftStartTime || "")) ||
    shifts.find((shift) => shiftMatchesText(shift, normalizedText)) ||
    shifts.find((shift) => shiftContainsTime(shift, plan.effectiveTime || gameState.time || "")) ||
    selectActiveShift(contract, gameState)
  );
}

function contractMealLabelMismatch({ text = "", shift = null, contract = null } = {}) {
  const normalized = normalizeText(text);
  if (!shift || !contract || !/\b(comida|plato|cena)\b.*\b(contrato|incluida|incluido)\b/.test(normalized)) {
    return null;
  }

  const requestedLight = /\b(ligera|ligero|desayuno)\b/.test(normalized);
  const requestedMain = /\b(principal|cena|almuerzo)\b/.test(normalized);
  if (!requestedLight && !requestedMain) return null;

  const mealIds = new Set(shift.includedMealIds || []);
  const mealNames = (contract.mealBenefits || [])
    .filter((meal) => mealIds.has(meal.mealId))
    .map((meal) => normalizeText(`${meal.mealId || ""} ${meal.name || ""}`))
    .join(" ");
  const selectedLooksLight = /\b(light|ligera|ligero|desayuno|breakfast)\b/.test(mealNames);
  const selectedLooksMain = /\b(main|principal|cena|almuerzo)\b/.test(mealNames);

  if ((requestedLight && selectedLooksMain) || (requestedMain && selectedLooksLight)) {
    return {
      slotId: "contract_meal_label_mismatch",
      type: "contract_meal",
      severity: "warning",
      requested: requestedLight ? "light" : "main",
      selectedMealIds: Array.from(mealIds),
      reason:
        "La etiqueta de comida pedida no coincide con la comida incluida por el turno seleccionado; se usa la comida canonica del turno.",
      displayLine:
        "Comida de contrato corregida por turno: se usa la comida incluida canonica del turno seleccionado.",
    };
  }
  return null;
}

function operationActionPolicy(selectedOperation = "") {
  const call = selectedOperation ? [selectedOperation] : [];
  return {
    mutate: true,
    timeAdvance: true,
    gptShouldCall: call,
    gptShouldNotCall: [
      "getCompactContext",
      "searchDocs",
      "searchDatabase",
      "getNpcFull",
      "listMagicTechniques",
      "getMagicTechnique",
      "getShopStock",
      "previewActivityCost",
      "previewSkillProgression",
      "previewMagicPractice",
      "previewResolveTurn",
      "applyTurn_dryRun",
    ],
    narrationInstruction:
      "Llamar solo la operacion indicada con el request preparado por actionPacket; despues narrar la respuesta guardada.",
  };
}

function actionPlanPolicy(operations = []) {
  return {
    mutate: true,
    timeAdvance: true,
    gptShouldCall: ["executeActionPlan"],
    gptShouldNotCall: [
      "getCompactContext",
      "searchDocs",
      "searchDatabase",
      "getNpcFull",
      "listMagicTechniques",
      "getMagicTechnique",
      "getShopStock",
      "previewActivityCost",
      "previewSkillProgression",
      "previewMagicPractice",
      "previewResolveTurn",
      "completeJobShift",
      "applyTurn",
      "applyTurn_dryRun",
    ],
    narrationInstruction:
      "Llamar executeActionPlan con actionPlanPacket.request; narrar con aggregateDisplayBundle/displayBundle de esa respuesta.",
  };
}

async function buildCompleteJobShiftActionPacket({ route = {}, text = "", gameState = {} } = {}) {
  const characterId = gameState.characterId || "char_lucas";
  const contract = await JobContract.findOne({ characterId, status: "active" }).lean();
  if (!contract) return null;
  const plan = route.slots?.completeJobShiftPlan || {};
  const shift = selectShiftForCompletion(contract, gameState, { text, plan });
  if (!shift?.shiftId) return null;

  const currentMinutes = timeToMinutes(gameState.time || "");
  const shiftStartMinutes = timeToMinutes(shift.startTime);
  const needsLateCompletionFlag =
    currentMinutes !== null &&
    shiftStartMinutes !== null &&
    currentMinutes > shiftStartMinutes;
  const consumeIncludedMealIds = plan.consumeContractMeal ? [...(shift.includedMealIds || [])] : [];
  const requestBody = {
    gameId: gameState.gameId || DEFAULT_GAME_ID,
    characterId,
    contractId: contract.contractId,
    completionSummary: text,
    allowLateCompletion: Boolean(plan.allowLateCompletion || needsLateCompletionFlag),
    consumeIncludedMealIds,
    mealTiming: plan.contractMealTiming || "before_work_cost",
  };

  return {
    schemaVersion: "turn_intake_action_packet_v1",
    selectedOperation: "completeJobShift",
    operationId: "completeJobShift",
    supported: true,
    endpoint: {
      method: "POST",
      path: `/api/jobs/shifts/${shift.shiftId}/complete`,
    },
    request: {
      pathParams: {
        shiftId: shift.shiftId,
      },
      body: requestBody,
    },
    summary: {
      capabilityId: route.capabilityId,
      contractId: contract.contractId,
      shiftId: shift.shiftId,
      shiftName: shift.name || shift.shiftId,
      shiftStartTime: shift.startTime || "",
      shiftEndTime: shift.endTime || "",
      characterId,
      consumeIncludedMealIds,
      contractMealBenefits: (contract.mealBenefits || [])
        .filter((meal) => consumeIncludedMealIds.includes(meal.mealId))
        .map((meal) => ({
          mealId: meal.mealId,
          name: meal.name || meal.mealId,
          satietyBonus: meal.satietyBonus || 0,
          energyBonus: meal.energyBonus || 0,
        })),
    },
    actionPolicy: operationActionPolicy("completeJobShift"),
    boundary:
      "Usar completeJobShift directamente. No llamar previewJobShift/getActiveJobContract/getCompactContext antes para este cierre laboral simple.",
  };
}

async function buildSafeMagicPracticeActionPacket({ route = {}, text = "", gameState = {}, turnContext = null } = {}) {
  const rawPlan = route.slots?.safeMagicPracticePlan || {};
  const resolvedSlot = turnContext
    ? resolveSafeMagicPracticeSlot({ text, plan: rawPlan, context: turnContext })
    : { plan: rawPlan, technique: null };
  const plan = resolvedSlot.plan || rawPlan;
  if (!plan.techniqueId) return null;
  const technique =
    resolvedSlot.technique ||
    await MagicTechnique.findOne({ techniqueId: plan.techniqueId }).lean();
  if (!technique || technique.status !== "available") return null;

  const minutes = Number(plan.minutes || technique.defaultMinutes || 0);
  if (!Number.isInteger(minutes) || minutes < Number(technique.minMinutes || 1) || minutes > Number(technique.maxMinutes || minutes)) {
    return null;
  }
  const precedingRestMinutes = Number(plan.precedingRestMinutes || 0);
  const totalMinutes = minutes + (Number.isInteger(precedingRestMinutes) && precedingRestMinutes > 0 ? precedingRestMinutes : 0);
  const target = addMinutesToStateTime(gameState, totalMinutes);
  if (!target) return null;

  const activitySegments = [];
  if (precedingRestMinutes > 0) {
    activitySegments.push({
      category: "descanso_sentado",
      minutes: precedingRestMinutes,
      reason: "Descanso previo indicado por el jugador antes de practicar magia segura.",
    });
  }
  activitySegments.push({
    category: technique.activityCategory || "descanso_sentado",
    minutes,
    reason: `Practica segura de ${technique.name || technique.techniqueId}.`,
  });

  const applyTurnRequest = {
    gameId: gameState.gameId || DEFAULT_GAME_ID,
    clientTurnId: makeActionClientTurnId({ gameState, text, operation: "magic" }),
    responseProfile: "compact",
    actionFamily: "magic_practice",
    actionSummary: text,
    timeAdvance: {
      fromDay: gameState.currentDay,
      from: gameState.time,
      toDay: target.toDay,
      to: target.to,
    },
    activitySegments,
    magicPractice: [
      {
        techniqueId: technique.techniqueId,
        minutes,
        reason: `Lucas practica ${technique.name || technique.techniqueId} de forma segura y sin efecto externo forzado.`,
        modifiers: {
          newTechnique: true,
        },
      },
    ],
    eventLogs: [
      {
        type: "magic_practice",
        summary: text,
        visibility: "private",
        source: "player_action",
        tags: ["turn_intake_action", "magic_practice", "safe_magic_practice"],
      },
    ],
  };

  return {
    schemaVersion: "turn_intake_action_packet_v1",
    selectedOperation: "applyTurn",
    operationId: "applyTurn",
    supported: true,
    request: applyTurnRequest,
    summary: {
      capabilityId: route.capabilityId,
      techniqueId: technique.techniqueId,
      techniqueName: technique.name || technique.techniqueId,
      minutes,
      totalMinutes,
      canProduceVisibleEffect: false,
    },
    actionPolicy: operationActionPolicy("applyTurn"),
    boundary:
      "Usar applyTurn directamente con este request. No buscar tecnicas ni hacer preview para practica magica segura.",
  };
}

async function buildSimpleMealPurchaseActionPacket({ route = {}, text = "", gameState = {}, turnContext = null } = {}) {
  const rawPlan = route.slots?.simpleMealPurchasePlan || {};
  const resolvedSlot = turnContext
    ? resolveSimpleMealPurchaseSlot({ text, plan: rawPlan, gameState, context: turnContext })
    : { plan: rawPlan, stock: null, item: null };
  const plan = resolvedSlot.plan || rawPlan;
  if (!plan.shopId || !plan.itemId) return null;
  const [stock, item] = resolvedSlot.stock && resolvedSlot.item
    ? [resolvedSlot.stock, resolvedSlot.item]
    : await Promise.all([
        ShopStock.findOne({ shopId: plan.shopId, itemId: plan.itemId }).lean(),
        Item.findOne({ itemId: plan.itemId }).lean(),
      ]);
  if (!stock || !item || stock.quantity <= 0) return null;
  const price = Number(stock.currentPriceCopper ?? stock.basePriceCopper ?? item.basePriceCopper ?? 0);
  if (!Number.isFinite(price) || price < 0) return null;
  if (Number(gameState.moneyCopper || 0) < price) return null;
  const minutes = Number(plan.minutes || 20);
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 120) return null;
  const target = addMinutesToStateTime(gameState, minutes);
  if (!target) return null;

  const applyTurnRequest = {
    gameId: gameState.gameId || DEFAULT_GAME_ID,
    clientTurnId: makeActionClientTurnId({ gameState, text, operation: "meal" }),
    responseProfile: "compact",
    actionFamily: "meal",
    actionSummary: text,
    timeAdvance: {
      fromDay: gameState.currentDay,
      from: gameState.time,
      toDay: target.toDay,
      to: target.to,
    },
    activitySegments: [
      {
        category: "comer_tranquilo",
        minutes,
        reason: `Comer ${item.name || item.itemId} sentado con calma.`,
      },
    ],
    lucasPatch: {
      satietyDelta: Number(item.satietyBonus || 0),
      energyDelta: Number(item.energyBonus || 0),
      mpDelta: Number(item.mpBonus || 0),
    },
    moneyPatch: {
      deltaCopper: -price,
      reason: `Pago de ${item.name || item.itemId}.`,
    },
    shopStockPatches: [
      {
        shopId: stock.shopId,
        itemId: stock.itemId,
        deltaQuantity: -1,
        reason: `Compra/consumo de ${item.name || item.itemId}.`,
      },
    ],
    eventLogs: [
      {
        type: "meal",
        summary: text,
        visibility: "private",
        source: "player_action",
        tags: ["turn_intake_action", "meal", "shop_purchase"],
        metadata: {
          shopId: stock.shopId,
          itemId: stock.itemId,
          priceCopper: price,
        },
      },
    ],
  };

  return {
    schemaVersion: "turn_intake_action_packet_v1",
    selectedOperation: "applyTurn",
    operationId: "applyTurn",
    supported: true,
    request: applyTurnRequest,
    summary: {
      capabilityId: route.capabilityId,
      shopId: stock.shopId,
      itemId: item.itemId,
      itemName: item.name || item.itemId,
      priceCopper: price,
      minutes,
    },
    actionPolicy: operationActionPolicy("applyTurn"),
    boundary:
      "Usar applyTurn directamente con este request. No llamar getShopStock/searchDatabase/previews para esta comida simple.",
  };
}

async function buildSpecializedActionPacket({ route = {}, text = "", gameState = {}, turnContext = null } = {}) {
  if (!route.needsMutation) return null;
  if (route.capabilityId === "complete_job_shift") {
    return buildCompleteJobShiftActionPacket({ route, text, gameState });
  }
  if (route.capabilityId === "safe_magic_practice") {
    return buildSafeMagicPracticeActionPacket({ route, text, gameState, turnContext });
  }
  if (route.capabilityId === "simple_meal_purchase") {
    return buildSimpleMealPurchaseActionPacket({ route, text, gameState, turnContext });
  }
  return null;
}

function operationFromActionPacket(packet = {}, { order = 1, dependsOnPrevious = false, expectedStateBefore = null } = {}) {
  return {
    order,
    selectedOperation: packet.selectedOperation,
    operationId: packet.operationId || packet.selectedOperation,
    endpoint: packet.endpoint || null,
    request: packet.request || null,
    summary: packet.summary || {},
    boundary: packet.boundary || "",
    dependsOnPrevious,
    ...(expectedStateBefore ? { expectedStateBefore } : {}),
  };
}

function detectActionPlanUnresolvedSlots(text = "") {
  const normalized = normalizeText(text);
  const slots = [];
  if (/\b(almuerzo|desayuno)\b/.test(normalized) && !/\b(almuerzo|desayuno)\b.{0,40}\b(contrato|incluid[ao]|racion|mochila)\b/.test(normalized)) {
    slots.push({
      slotId: "meal_source_unresolved",
      type: "meal",
      severity: "warning",
      reason: "El texto menciona una comida sin indicar origen mecanico claro.",
      displayLine:
        "Comida no resuelta automaticamente: se menciono almuerzo/desayuno sin origen claro; no se aplico stock, racion ni beneficio.",
    });
  }
  return slots;
}

async function buildShiftThenSafeMagicActionPlanPacket({ route = {}, text = "", gameState = {}, turnContext = null } = {}) {
  if (route.capabilityId !== "complete_job_shift") return null;

  const safeMagicPlan = detectSafeMagicPracticePlan(normalizeText(text));
  if (!safeMagicPlan?.techniqueId) return null;

  const completePlan = route.slots?.completeJobShiftPlan || {};
  const operations = [];
  let effectiveGameState = { ...gameState };

  if (completePlan.waitUntilTime) {
    const waitMinutes = minutesUntilTargetTime(gameState, completePlan.waitUntilTime);
    const target = Number.isInteger(waitMinutes) && waitMinutes > 0
      ? addMinutesToStateTime(gameState, waitMinutes)
      : null;
    if (target) {
      operations.push({
        order: operations.length + 1,
        selectedOperation: "resolveTurn",
        operationId: "resolveTurn",
        endpoint: {
          method: "POST",
          path: "/api/turn/resolve",
        },
        request: {
          gameId: gameState.gameId || DEFAULT_GAME_ID,
          clientTurnId: makeActionClientTurnId({ gameState, text, operation: "wait" }),
          responseProfile: "compact",
          actionFamily: "rest",
          actionSummary: `Lucas espera de forma tranquila hasta las ${completePlan.waitUntilTime}.`,
          visibility: "private",
          sequence: [
            {
              type: "wait",
              minutes: waitMinutes,
              category: "descanso_sentado",
              reason: "Espera tranquila indicada por el jugador antes del turno laboral.",
            },
          ],
        },
        summary: {
          capabilityId: "wait_until_shift_start",
          fromDay: gameState.currentDay,
          fromTime: gameState.time || "",
          toDay: target.toDay,
          toTime: target.to,
          minutes: waitMinutes,
        },
        boundary:
          "Operacion interna del plan: esperar/descansar hasta la hora indicada antes del turno. No ejecutar fuera de executeActionPlan.",
      });
      effectiveGameState = {
        ...effectiveGameState,
        currentDay: target.toDay,
        time: target.to,
      };
    }
  }

  const completeRoute = {
    ...route,
    slots: {
      ...(route.slots || {}),
      completeJobShiftPlan: {
        ...completePlan,
        effectiveTime: effectiveGameState.time,
      },
    },
  };
  const completePacket = await buildCompleteJobShiftActionPacket({
    route: completeRoute,
    text,
    gameState: effectiveGameState,
  });
  if (!completePacket?.supported) return null;
  const shiftEndTime = completePacket.summary?.shiftEndTime;
  if (!shiftEndTime) return null;

  const virtualGameState = {
    ...effectiveGameState,
    time: shiftEndTime,
  };
  const magicRoute = {
    ...route,
    capabilityId: "safe_magic_practice",
    slots: {
      safeMagicPracticePlan: safeMagicPlan,
    },
  };
  const magicPacket = await buildSafeMagicPracticeActionPacket({
    route: magicRoute,
    text,
    gameState: virtualGameState,
    turnContext,
  });
  if (!magicPacket?.supported) return null;

  const completeOrder = operations.length + 1;
  operations.push(operationFromActionPacket(completePacket, {
    order: completeOrder,
    dependsOnPrevious: completeOrder > 1,
    expectedStateBefore: completeOrder > 1
      ? {
          gameId: gameState.gameId || DEFAULT_GAME_ID,
          day: effectiveGameState.currentDay,
          time: effectiveGameState.time,
          reason: "La espera previa debe dejar el reloj en el inicio previsto del turno antes de completar el turno.",
        }
      : null,
  }));
  operations.push(operationFromActionPacket(magicPacket, {
    order: operations.length + 1,
    dependsOnPrevious: true,
    expectedStateBefore: {
      gameId: gameState.gameId || DEFAULT_GAME_ID,
      day: effectiveGameState.currentDay,
      time: shiftEndTime,
      reason: "completeJobShift debe dejar el reloj en el cierre del turno antes de aplicar la practica magica.",
    },
  }));
  const unresolvedSlots = detectActionPlanUnresolvedSlots(text);
  const mealMismatch = contractMealLabelMismatch({
    text,
    shift: {
      includedMealIds: completePacket.summary?.consumeIncludedMealIds || [],
    },
    contract: {
      mealBenefits: completePacket.summary?.contractMealBenefits || [],
    },
  });
  if (mealMismatch) unresolvedSlots.push(mealMismatch);
  const clientPlanId = makeActionClientTurnId({ gameState, text, operation: "plan" });
  const summary = {
    capabilityId: "composite_shift_then_safe_magic",
    sourceCapabilityId: route.capabilityId,
    actionSummary: text,
    operationCount: operations.length,
    startsAt: {
      day: gameState.currentDay,
      time: gameState.time || "",
    },
    effectiveShiftStart: {
      day: effectiveGameState.currentDay,
      time: effectiveGameState.time || "",
    },
    expectedFinal: {
      day: magicPacket.request?.timeAdvance?.toDay,
      time: magicPacket.request?.timeAdvance?.to,
    },
    includedMealIds: completePacket.summary?.consumeIncludedMealIds || [],
    magicTechniqueId: magicPacket.summary?.techniqueId || "",
  };

  return {
    schemaVersion: "turn_intake_action_plan_packet_v1",
    selectedOperation: "executeActionPlan",
    operationId: "executeActionPlan",
    supported: true,
    executionMode: "sequential",
    endpoint: {
      method: "POST",
      path: "/api/turn/action-plan/execute",
    },
    operations,
    unresolvedSlots,
    summary,
    request: {
      gameId: gameState.gameId || DEFAULT_GAME_ID,
      clientPlanId,
      responseProfile: "compact",
      actionSummary: text,
      operations,
      unresolvedSlots,
      summary,
    },
    actionPolicy: actionPlanPolicy(operations),
    boundary:
      "Plan compuesto materializado por backend. Llamar executeActionPlan con request; no ejecutar operaciones individuales ni intercalar busquedas/previews.",
  };
}

async function buildSpecializedActionPlanPacket({ route = {}, text = "", gameState = {}, turnContext = null } = {}) {
  if (!route.needsMutation) return null;
  return buildShiftThenSafeMagicActionPlanPacket({ route, text, gameState, turnContext });
}

function statLine(label, stat = {}) {
  const current = Number.isFinite(Number(stat.current)) ? Math.round(Number(stat.current)) : "?";
  const max = Number.isFinite(Number(stat.max)) ? Math.round(Number(stat.max)) : "?";
  const suffix = stat.label ? `\u2014${stat.label}` : "";
  return `${label}: ${current}/${max}${suffix}`;
}

function isTechnicalLog(log = {}) {
  const source = String(log.source || "").toLowerCase();
  const tags = (log.tags || []).map((tag) => String(tag || "").toLowerCase());
  if (["admin", "admin_fix", "backend_validation", "mechanical_audit", "system_correction"].includes(source)) {
    return true;
  }
  return tags.some(
    (tag) =>
      tag.includes("test") ||
      tag.includes("debug") ||
      tag.includes("repair") ||
      tag.includes("audit")
  );
}

function eventVisibleToLucas(event = {}, { locationIds = [] } = {}) {
  if (!event || !["active", "scheduled"].includes(event.status)) return false;
  if (event.visibility === "public") return true;
  if (event.visibility !== "local") return false;
  const affected = event.affectedLocationIds || [];
  return affected.some((locationId) => locationIds.includes(locationId));
}

function latestLogTouchesCurrentMoment(latestLog = null, gameState = null) {
  if (!latestLog || !gameState) return false;
  if (Number(latestLog.day) !== Number(gameState.currentDay)) return false;
  const currentTime = String(gameState.time || "");
  return Boolean(currentTime && (latestLog.timeEnd === currentTime || latestLog.timeStart === currentTime));
}

function inferNarrativeLocation({ location = null, parentLocation = null, latestLog = null, gameState = null } = {}) {
  const locationName = location?.name || location?.locationId || "?";
  const summary = normalizeText(latestLog?.summary || "");
  const locationText = normalizeText(
    `${location?.name || ""} ${location?.type || ""} ${(location?.tags || []).join(" ")} ${location?.locationId || ""}`
  );
  const isInn = /grulla|posada|inn|tavern/.test(locationText);
  const roomMention = /\b(cuarto|habitacion|cama|sube a su cuarto|en su cuarto)\b/.test(summary);
  const movedOutOfRoom = /\b(baja desde su cuarto|bajo desde su cuarto|baja de su cuarto|bajo de su cuarto|sale de su cuarto|salio de su cuarto|sale del cuarto|salio del cuarto|baja a la sala|bajo a la sala|baja al comedor|bajo al comedor|baja a la cocina|bajo a la cocina|vuelve a la sala|volvio a la sala|vuelve al comedor|volvio al comedor)\b/.test(summary);
  const logIsCurrent = latestLogTouchesCurrentMoment(latestLog, gameState);

  if (isInn && roomMention && logIsCurrent && !movedOutOfRoom) {
    return {
      locationId: location?.locationId || "",
      canonicalName: locationName,
      displayName: `${locationName} - cuarto de Lucas`,
      subLocationName: "cuarto de Lucas",
      inferredFromLatestLog: true,
      parentLocationName: parentLocation?.name || "",
      privacy: "private_room_inferred",
    };
  }

  return {
    locationId: location?.locationId || "",
    canonicalName: locationName,
    displayName: locationName,
    subLocationName: "",
    inferredFromLatestLog: false,
    parentLocationName: parentLocation?.name || "",
    privacy: "location_scope",
  };
}

function composePresenceLine(visible = [], nearby = []) {
  const visibleNames = visible.map((npc) => npc.name || npc.npcId);
  const nearbyNames = nearby.map((npc) => npc.name || npc.npcId);
  return visibleNames.length && nearbyNames.length
    ? `${visibleNames.join(", ")}; cerca/probables: ${nearbyNames.join(", ")}`
    : visibleNames.length
      ? visibleNames.join(", ")
      : nearbyNames.length
        ? `cerca/probables: ${nearbyNames.join(", ")}`
        : "ninguno visible";
}

function summarizeNpcPresence(npcs = [], location = null, narrativeLocation = null) {
  if (narrativeLocation?.privacy === "private_room_inferred") {
    return {
      visible: [],
      nearby: [],
      line: "ninguno visible en el cuarto",
      offscreenHint: "puede haber sonidos apagados de la posada abajo, pero no NPCs visibles sin nueva accion.",
    };
  }

  const directVisible = new Set(location?.visibleNpcIds || []);
  const probable = new Set(location?.probableNpcIds || []);
  const visible = [];
  const nearby = [];

  for (const npc of npcs) {
    const summary = {
      npcId: npc.npcId,
      name: npc.name,
      role: npc.role || "",
      currentTask: npc.currentTask || "",
      availability: npc.availability || {},
    };
    if (directVisible.has(npc.npcId) && (!npc.currentLocationId || npc.currentLocationId === location?.locationId)) {
      visible.push(summary);
    } else if (probable.has(npc.npcId) || npc.currentLocationId === location?.parentLocationId) {
      nearby.push(summary);
    }
  }

  return {
    visible,
    nearby,
    line: composePresenceLine(visible, nearby),
    offscreenHint: "",
  };
}

function includeSocialTargetInPresence(npcPresence = {}, socialPacket = null) {
  const target = socialPacket?.targetNpc;
  if (!target?.npcId) return npcPresence;
  const visible = [...(npcPresence.visible || [])];
  const nearby = [...(npcPresence.nearby || [])];
  const alreadyListed = [...visible, ...nearby].some((npc) => npc.npcId === target.npcId);
  if (!alreadyListed) {
    visible.push({
      npcId: target.npcId,
      name: target.name,
      role: target.role || "",
      currentTask: target.currentTask || "",
      availability: target.availability || {},
    });
  }
  return {
    ...npcPresence,
    visible,
    nearby,
    line: composePresenceLine(visible, nearby),
  };
}

function socialPresenceForTarget(targetNpc = null, npcPresence = {}, location = null, narrativeLocation = null) {
  if (!targetNpc) return { scope: "none", canNarrateDirectly: false, reason: "No se detecto NPC objetivo." };
  if (narrativeLocation?.privacy === "private_room_inferred") {
    return {
      scope: "not_visible_private_room",
      canNarrateDirectly: false,
      reason: "Lucas esta en un cuarto privado inferido; hablar con este NPC requiere nueva accion/traslado.",
    };
  }

  if ((npcPresence.visible || []).some((npc) => npc.npcId === targetNpc.npcId)) {
    return { scope: "visible", canNarrateDirectly: true, reason: "NPC visible en la escena." };
  }
  if (targetNpc.currentLocationId && targetNpc.currentLocationId === location?.locationId) {
    return { scope: "same_location", canNarrateDirectly: true, reason: "NPC ubicado en la misma localizacion." };
  }
  if ((npcPresence.nearby || []).some((npc) => npc.npcId === targetNpc.npcId)) {
    const availabilityStatus = String(targetNpc.availability?.status || "").toLowerCase();
    if (!["absent", "traveling", "unknown"].includes(availabilityStatus)) {
      return {
        scope: "nearby_probable",
        canNarrateDirectly: true,
        reason: "NPC cercano/probable dentro del alcance de la escena; microcharla read-only permitida.",
      };
    }
    return {
      scope: "nearby_probable",
      canNarrateDirectly: false,
      reason: "NPC cercano/probable, pero no confirmado como interlocutor directo.",
    };
  }

  return {
    scope: "not_present",
    canNarrateDirectly: false,
    reason: "NPC no confirmado como presente en la escena.",
  };
}

function memoryImportanceRank(memory = {}) {
  const ranks = {
    critical: 4,
    important: 3,
    normal: 2,
    minor: 1,
  };
  return ranks[memory.importance] || 0;
}

function sortMemories(left = {}, right = {}) {
  const importanceDiff = memoryImportanceRank(right) - memoryImportanceRank(left);
  if (importanceDiff !== 0) return importanceDiff;
  const dayDiff = (Number(right.createdDay) || 0) - (Number(left.createdDay) || 0);
  if (dayDiff !== 0) return dayDiff;
  return String(right.createdTime || "").localeCompare(String(left.createdTime || ""));
}

async function buildSocialPacket({ gameId, text, targetNpc, targetPresence, questionContext = null }) {
  if (!targetNpc || !targetPresence.canNarrateDirectly) return null;

  const [memories, knowledgeRecords] = await Promise.all([
    NpcMemory.find({ npcId: targetNpc.npcId })
      .select("memoryId npcId fact summary sourceType certainty emotionalWeight privacyLevel canShare createdDay createdTime importance tags")
      .sort({ createdDay: -1, createdTime: -1 })
      .limit(8)
      .lean(),
    KnowledgeRecord.find({
      gameId,
      holderNpcIds: targetNpc.npcId,
      status: "active",
      visibility: { $ne: "mechanical_only" },
    })
      .select("knowledgeId subjectType subjectId factKey fact summary sourceType certainty visibility canShare createdDay createdTime tags")
      .sort({ createdDay: -1, createdTime: -1 })
      .limit(6)
      .lean(),
  ]);

  return {
    schemaVersion: "social_packet_v1",
    mode: "read_only_simple_social",
    playerText: text,
    targetNpc: compactNpcSocialProfile(targetNpc),
    targetPresence,
    ...(questionContext ? { questionContext } : {}),
    relevantMemories: memories.sort(sortMemories).slice(0, 3).map((memory) => ({
      memoryId: memory.memoryId,
      summary: truncateText(memory.summary || memory.fact || "", 180),
      sourceType: memory.sourceType,
      certainty: memory.certainty,
      emotionalWeight: memory.emotionalWeight,
      privacyLevel: memory.privacyLevel,
      canShare: Boolean(memory.canShare),
      importance: memory.importance,
    })),
    knowledgeContext: {
      shareable: knowledgeRecords
        .filter((record) => record.canShare)
        .slice(0, 3)
        .map((record) => ({
          knowledgeId: record.knowledgeId,
          factKey: record.factKey,
          summary: truncateText(record.summary || record.fact || "", 160),
          certainty: record.certainty,
          visibility: record.visibility,
        })),
      nonShareableCount: knowledgeRecords.filter((record) => !record.canShare).length,
      rule: "No revelar knowledge/memories con canShare=false; usarlas solo como limite de tono si corresponde.",
    },
    sceneGuidance: [
      "Resolver como charla breve sin deltas numericos ni memoria nueva.",
      "NPC responde primero al tono visible de Lucas y despues al contenido.",
      "Usar tarea actual, objeto, pausa, gesto o cansancio; no respuesta generica.",
      questionContext?.answerBoundary || "",
      "Si la charla busca permiso, promesa, secreto, informacion sensible o cambio social, este packet no alcanza.",
    ].filter(Boolean),
    mutationBoundary:
      "No modificar confianza, memoria, compromisos, trabajo, dinero, inventario ni tiempo desde social_packet.",
  };
}

function buildDirectorPacket({
  route,
  text = "",
  socialPacket = null,
  questionContext = null,
  resolverPacket = null,
  actionPacket = null,
  actionPlanPacket = null,
  capabilityPacket = null,
  continuityTarget = null,
  narrativeLocation = null,
  visibleEvents = [],
} = {}) {
  const narrateOnly = route?.supported === true && route?.suggestedOperation === "narrateOnly";
  const resolverReady = route?.supported === true && route?.suggestedOperation === "resolveTurn" && resolverPacket;
  const actionPlanReady =
    route?.supported === true &&
    route?.suggestedOperation === "executeActionPlan" &&
    actionPlanPacket?.supported === true;
  const actionReady =
    route?.supported === true &&
    actionPacket?.supported === true &&
    ["applyTurn", "completeJobShift"].includes(actionPacket.selectedOperation);
  return {
    schemaVersion: "turn_director_readonly_v1",
    mode: narrateOnly
      ? "read_only_narration"
      : resolverReady
        ? "resolver_ready"
        : actionPlanReady
          ? "action_plan_ready"
          : actionReady
            ? "action_ready"
            : "fallback_required",
    playerText: text,
    selectedOperation: route?.suggestedOperation || "getCompactContext",
    backendResolved: {
      routeSupported: Boolean(route?.supported),
      socialTargetResolved: Boolean(socialPacket?.targetNpc?.npcId),
      questionResolved: Boolean(questionContext?.canAnswerFromPacket),
      resolverReady: Boolean(resolverReady),
      actionPlanReady: Boolean(actionPlanReady),
      actionReady: Boolean(actionReady),
      continuityTargetNpcId: continuityTarget?.npcId || "",
      continuitySource: continuityTarget?.source || "",
      narrativeLocation: narrativeLocation?.displayName || "",
      visibleEventCount: visibleEvents.length,
      capabilityId: capabilityPacket?.capabilityId || route?.capabilityId || "",
      capabilityDecision: capabilityPacket?.decision || route?.capabilityDecision || "",
      capabilityExecutor: capabilityPacket?.executor || route?.capabilityExecutor || "",
    },
    capabilityPacket: capabilityPacket || null,
    actionPacket: actionPacket || null,
    actionPlanPacket: actionPlanPacket || null,
    socialTarget: socialPacket
      ? {
          npcId: socialPacket.targetNpc.npcId,
          name: socialPacket.targetNpc.name,
          presenceScope: socialPacket.targetPresence.scope,
          availability: socialPacket.targetNpc.availability || {},
        }
      : null,
    questionContext: questionContext || null,
    resolverRequest: resolverPacket?.resolverRequest || null,
    resolverPacket: resolverPacket || null,
    actionRequest: actionPacket?.request || null,
    actionPlan: actionPlanPacket?.operations || null,
    actionPolicy: resolverReady
      ? {
          mutate: true,
          timeAdvance: true,
          gptShouldCall: ["resolveTurn"],
          gptShouldNotCall: [
            "getCompactContext",
            "searchDocs",
            "getNpcFull",
            "previewActivityCost",
            "previewResolveTurn",
            "applyTurn",
          ],
          narrationInstruction:
            "Llamar resolveTurn con resolverRequest y narrar la respuesta guardada. No buscar mas contexto antes.",
        }
      : actionPlanReady
      ? actionPlanPacket.actionPolicy
      : actionReady
      ? actionPacket.actionPolicy
      : narrateOnly
      ? {
          mutate: false,
          timeAdvance: false,
          gptShouldNotCall: [
            "getCompactContext",
            "searchDocs",
            "getNpcFull",
            "previewSocialImpact",
            "applyTurn",
            "resolveTurn",
          ],
          narrationInstruction:
            "Narrar con narratorPacket/socialPacket/displayBundle. No buscar mas contexto para este turno.",
        }
      : {
          mutate: false,
          fallback: route?.suggestedOperation || "getCompactContext",
          reason: route?.fallbackReason || "Ruta read-only no soportada.",
        },
  };
}

function buildNarrationBoundaries({ route, narrativeLocation, visibleEvents = [], latestLog = null, socialPacket = null } = {}) {
  const boundaries = [
    "No mutar estado, no avanzar tiempo y no aplicar costes/EXP/dinero.",
    "No llamar searchDocs para narrateOnly si este paquete trae displayBundle.",
    "Usar escena primero y HUD final; copiar displayBundle.renderLines si el GPT necesita formato exacto.",
    "No revelar eventos no visibles para Lucas aunque existan en Mongo.",
  ];

  if (narrativeLocation?.inferredFromLatestLog) {
    boundaries.push("La sububicacion es inferida por el ultimo log; narrar como cuarto privado sin mover locationId.");
  }
  if (visibleEvents.length === 0) {
    boundaries.push("Evento activo para HUD: ninguno visible para Lucas ahora.");
  }
  if (latestLog?.summary) {
    boundaries.push("Continuar desde latestVisibleLog.summary; no repetirlo como resumen plano.");
  }
  if (!route.supported) {
    boundaries.push("Este paquete no cubre la accion; usar fallback recomendado.");
  }
  if (socialPacket) {
    boundaries.push("Charla social simple: no aplicar deltas, promesas, permisos ni memoria persistente.");
    boundaries.push("Usar socialPacket.targetNpc voz/relacion/conocimiento; no inventar secretos ni informacion no compartible.");
  }

  return boundaries;
}

function buildNoMutationDisplayBundle({ gameState, narrativeLocation, npcPresence, visibleEvents, latestLog }) {
  const headerLines = [
    `## D\u00eda ${gameState.currentDay ?? "?"}\u2014${gameState.time || "?"}`,
    `**Ubicaci\u00f3n:** ${narrativeLocation.displayName}`,
  ];
  const status = gameState.lucasStatus || {};
  const eventNames = visibleEvents.map((event) => event.title || event.eventId).filter(Boolean);
  const situation = latestLog?.summary
    ? latestLog.summary.replace(/\s+/g, " ").trim().replace(/\.+$/g, ".")
    : "sin cambios mecanicos nuevos; describir la situacion visible sin inventar cambios.";
  const stateLines = [
    `D\u00eda: ${gameState.currentDay ?? "?"}\u2014${formatDiegeticDate(gameState.diegeticDate || {})}`,
    `Bloque: ${gameState.block || "?"}`,
    `Hora: ${gameState.time || "?"}`,
    `Ubicaci\u00f3n: ${narrativeLocation.displayName}`,
    statLine("Vida", status.life),
    statLine("Saciedad", status.satiety),
    statLine("Energ\u00eda", status.energy),
    statLine("MP", status.mp),
    `Dinero: ${formatCopper(gameState.moneyCopper || 0)}`,
    `Evento activo: ${eventNames.length ? eventNames.join(", ") : "ninguno visible para Lucas ahora"}`,
    `Situaci\u00f3n: ${situation}`,
    `NPCs visibles/cerca: ${npcPresence.line}.`,
  ];
  const changeLines = ["Sin cambios mecanicos nuevos. No avanzo el tiempo."];
  const renderLines = [
    ...headerLines,
    "",
    "### Cambios relevantes",
    ...changeLines,
    "",
    "## Estado actual",
    ...stateLines,
  ];

  return {
    schemaVersion: "narrator_display_bundle_v1",
    source: "turn/intake",
    noMutation: true,
    copyInstruction:
      "Para narrateOnly, escribir escena breve primero y copiar estas lineas de HUD final; no reconstruir numeros ni evento/NPCs.",
    headerLines,
    changeGroups: [
      {
        id: "no_changes",
        title: "Cambios relevantes",
        lines: changeLines,
      },
    ],
    changeLines,
    stateLines,
    alertLines: [],
    renderLines,
  };
}

async function buildNarratorPacket({
  text = "",
  aiClassification = null,
  gameId = DEFAULT_GAME_ID,
  lastTargetNpcId = "",
} = {}) {
  const turnContext = await buildTurnContext({ gameId, lastTargetNpcId });
  const { gameState, location, parentLocation, latestLogs, activeEvents } = turnContext;
  const destinationAliases = buildDestinationAliases(turnContext.locationCatalog || []);
  const routedIntent = routeTurnIntent({
    text,
    aiClassification,
    destinationAliases: destinationAliases.length ? destinationAliases : undefined,
  });
  let route = routedIntent.route;
  const capabilityPacket = routedIntent.capabilityPacket;
  const locationIds = unique(turnContext.locationScopeIds?.length ? turnContext.locationScopeIds : [gameState.locationId]);

  const latestLog = latestLogs.find((log) => !isTechnicalLog(log)) || null;
  const continuityTarget = inferContinuityTargetNpcId({ latestLogs, lastTargetNpcId });
  const narrativeLocation = inferNarrativeLocation({ location, parentLocation, latestLog, gameState });
  const npcIds = unique([
    ...(location?.visibleNpcIds || []),
    ...(location?.probableNpcIds || []),
    continuityTarget.npcId,
  ]);
  const npcQuery = location
    ? {
        $or: [
          { npcId: { $in: npcIds } },
          { currentLocationId: { $in: locationIds } },
        ],
      }
    : { npcId: { $in: npcIds } };
  const npcs = npcIds.length || location
    ? await Npc.find(npcQuery)
        .select(
          "npcId name role homeLocationId currentLocationId currentTask availability personality speechStyle values tolerates rejects routineBase knownPublicFacts relationshipWithLucas socialProfile emotionalProfile flags.dialogueDirector"
        )
        .limit(16)
        .lean()
    : [];
  let npcPresence = summarizeNpcPresence(npcs, location, narrativeLocation);
  const visibleEvents = activeEvents.filter((event) => eventVisibleToLucas(event, { locationIds }));
  let resolverPacket = null;
  let actionPacket = null;
  let actionPlanPacket = null;
  if (route.needsMutation) {
    await hydrateTurnSlotCatalogs(turnContext);
    actionPlanPacket = await buildSpecializedActionPlanPacket({ route, text, gameState, turnContext });
    if (actionPlanPacket) {
      route = {
        ...route,
        supported: true,
        suggestedOperation: "executeActionPlan",
        fallbackReason: "",
        confidence: "high",
      };
    } else {
      actionPacket = await buildSpecializedActionPacket({ route, text, gameState, turnContext });
    }
    if (!actionPlanPacket && actionPacket) {
      route = {
        ...route,
        supported: true,
        suggestedOperation: actionPacket.selectedOperation,
        fallbackReason: "",
        confidence: "high",
      };
    } else if (!actionPlanPacket) {
      resolverPacket = buildCommonResolverPacket({ route, text, gameState });
    }
    if (!actionPlanPacket && !actionPacket && resolverPacket) {
      route = {
        ...route,
        supported: true,
        suggestedOperation: "resolveTurn",
        fallbackReason: "",
        confidence: resolverPacket.confidence,
      };
    }
  }
  let socialPacket = null;
  let questionContext = null;
  if (route.intent === "social_scene") {
    const targetNpc = selectTargetNpc({
      npcs,
      text,
      aiClassification,
      continuityTargetNpcId: continuityTarget.npcId,
    });
    const targetPresence = socialPresenceForTarget(targetNpc, npcPresence, location, narrativeLocation);
    questionContext = buildQuestionContext({ text, targetNpc, gameState });
    socialPacket = await buildSocialPacket({ gameId, text, targetNpc, targetPresence, questionContext });
    if (!socialPacket) {
      route = {
        ...route,
        supported: false,
        suggestedOperation: "getCompactContext",
        fallbackReason: targetPresence.reason || "No se pudo construir socialPacket seguro.",
      };
    }
  }
  npcPresence = includeSocialTargetInPresence(npcPresence, socialPacket);
  const displayBundle = buildNoMutationDisplayBundle({
    gameState,
    narrativeLocation,
    npcPresence,
    visibleEvents,
    latestLog,
  });
  const directorPacket = buildDirectorPacket({
    route,
    text,
    socialPacket,
    questionContext,
    resolverPacket,
    actionPacket,
    actionPlanPacket,
    capabilityPacket,
    continuityTarget,
    narrativeLocation,
    visibleEvents,
  });

  return {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    readOnly: true,
    route,
    directorPacket,
    capabilityPacket,
    ...(resolverPacket ? { resolverPacket } : {}),
    ...(actionPacket ? { actionPacket } : {}),
    ...(actionPlanPacket ? { actionPlanPacket } : {}),
    narratorPacket: {
      schemaVersion: "narrator_packet_minimal_v1",
      packetProfile: socialPacket ? "social_scene" : "minimal_scene",
      gameId,
      playerText: text,
      state: {
        currentDay: gameState.currentDay,
        diegeticDate: gameState.diegeticDate || {},
        block: gameState.block,
        time: gameState.time,
        locationId: gameState.locationId,
        locationName: location?.name || gameState.locationId,
        narrativeLocation,
        lucasStatus: gameState.lucasStatus || {},
        moneyCopper: gameState.moneyCopper || 0,
      },
      latestVisibleLog: latestLog
        ? {
            logId: latestLog.logId,
            day: latestLog.day,
            timeStart: latestLog.timeStart,
            timeEnd: latestLog.timeEnd || "",
            locationId: latestLog.locationId || "",
            type: latestLog.type,
            summary: latestLog.summary,
          }
        : null,
      npcPresence,
      visibleEvents: visibleEvents.map((event) => ({
        eventId: event.eventId,
        title: event.title,
        status: event.status,
        visibility: event.visibility,
      })),
      hiddenEventCount: Math.max(0, activeEvents.length - visibleEvents.length),
      capabilityPacket,
      ...(actionPacket ? { actionPacket } : {}),
      ...(actionPlanPacket ? { actionPlanPacket } : {}),
      immediateTensions: [
        Number(gameState.lucasStatus?.energy?.current) <= 25 ? "cansancio serio: debe sentirse en ritmo, postura y decision" : "",
        Number(gameState.lucasStatus?.satiety?.current) <= 45 ? "hambre relevante: no ignorar si la escena se alarga" : "",
        npcPresence.offscreenHint,
      ].filter(Boolean),
      narrationBoundaries: buildNarrationBoundaries({
        route,
        narrativeLocation,
        visibleEvents,
        latestLog,
        socialPacket,
      }),
      directorPacket,
      ...(resolverPacket ? { resolverPacket } : {}),
      ...(actionPacket ? { actionPacket } : {}),
      ...(actionPlanPacket ? { actionPlanPacket } : {}),
      ...(socialPacket ? { socialPacket } : {}),
      displayBundle,
    },
  };
}

module.exports = {
  SCHEMA_VERSION,
  buildNarratorPacket,
  classifyTurn,
};
