const GameState = require("../models/GameState");
const JobContract = require("../models/JobContract");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const { getShiftScheduleStatus } = require("./jobScheduleService");
const {
  addMinutesToDayTime,
  isValidTime,
  previewTravel,
  roundUpToFive,
  timeToMinutes,
} = require("./travelService");

const DEFAULT_GAME_ID = "isekai_lucas_main";
const DEFAULT_CHARACTER_ID = "char_lucas";
const SUPPORTED_STEP_TYPES = [
  "activity",
  "rest",
  "wait",
  "environment_check",
  "travel",
  "job_attendance",
  "job_late",
  "work_segment",
  "npc_memory",
  "apology",
];
const ACTION_FAMILY_ALIASES = {
  work: "job_shift",
  job: "job_shift",
  other: "general_action",
};

function resolverError(message, details = {}, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function sanitizeIdPart(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36);
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function asArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeStepType(step = {}) {
  const normalized = String(step.type || step.kind || step.action || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");
  if (["partial_work", "work", "work_partial", "trabajo_parcial", "segmento_trabajo"].includes(normalized)) {
    return "work_segment";
  }
  return normalized;
}

function normalizeResolverActionFamily(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  return ACTION_FAMILY_ALIASES[normalized] || normalized;
}

function normalizePace(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

  if (["full_speed", "max_speed", "a_toda_velocidad", "correr_a_toda_velocidad", "sprint"].includes(normalized)) {
    return "full_speed";
  }
  if (["run", "running", "correr", "corriendo"].includes(normalized)) return "run";
  if (["hurry", "fast", "rapido", "apuro", "prisa"].includes(normalized)) return "hurry";
  if (["careful", "cautious", "cuidado", "cauteloso", "lento"].includes(normalized)) return "careful";
  return "walk";
}

function pacePlan(pace) {
  if (pace === "full_speed") {
    return {
      pace,
      label: "correr a toda velocidad",
      durationMultiplier: 2 / 3,
      category: "esfuerzo_fuerte",
      skillAwards: true,
    };
  }
  if (pace === "run") {
    return {
      pace,
      label: "correr",
      durationMultiplier: 0.75,
      category: "esfuerzo_fuerte",
      skillAwards: true,
    };
  }
  if (pace === "hurry") {
    return {
      pace,
      label: "caminar rapido",
      durationMultiplier: 0.85,
      category: "viaje_caminata_suave",
      skillAwards: false,
    };
  }
  if (pace === "careful") {
    return {
      pace,
      label: "avanzar con cuidado",
      durationMultiplier: 1.15,
      category: "viaje_caminata_suave",
      skillAwards: false,
    };
  }

  return {
    pace: "walk",
    label: "caminar",
    durationMultiplier: 1,
    category: "viaje_caminata_suave",
    skillAwards: false,
  };
}

function absoluteMinutes(day, time) {
  return (Number(day || 1) - 1) * 1440 + timeToMinutes(time);
}

function diffMinutes({ fromDay, from, toDay, to }) {
  return absoluteMinutes(toDay, to) - absoluteMinutes(fromDay, from);
}

function addSkillAward(skillPatches, patch) {
  if (!patch?.skillId) return;
  const existing = skillPatches.find(
    (entry) =>
      entry.skillId === patch.skillId &&
      entry.category === patch.category
  );

  if (existing) {
    existing.durationMinutes += patch.durationMinutes || 0;
    existing.reason = `${existing.reason} ${patch.reason || ""}`.trim();
    return;
  }

  skillPatches.push(patch);
}

function routeLooksDifficult(preview) {
  const segments = preview.path?.segments?.length
    ? preview.path.segments.map((entry) => entry.route)
    : [preview.route].filter(Boolean);

  return segments.some((route) => {
    const text = [
      route?.routeType,
      route?.dangerLevel,
      ...(route?.terrain || []),
      ...(route?.tags || []),
      route?.name,
    ]
      .join(" ")
      .toLowerCase();

    return /forest|bosque|wilderness|barro|mud|dirt|sendero|trail|rough|low|medium|high|extreme/.test(text);
  });
}

function createClientTurnId({ gameState, sequence, actionSummary }) {
  const actionPart =
    sanitizeIdPart(actionSummary) ||
    sanitizeIdPart(sequence.map((step) => normalizeStepType(step)).join("_")) ||
    "resolved_turn";
  return `resolve-d${gameState.currentDay}-${String(gameState.time || "0000").replace(":", "")}-${actionPart}-${Date.now()}`;
}

function resolveSequence(body) {
  const sequence = body.sequence || body.intent?.sequence || body.turn?.sequence;
  if (!Array.isArray(sequence) || sequence.length === 0) {
    throw resolverError("resolveTurn requiere sequence[] con pasos estructurados.", {
      supportedTypes: SUPPORTED_STEP_TYPES,
    });
  }
  if (sequence.length > 8) {
    throw resolverError("resolveTurn.sequence acepta hasta 8 pasos por turno.");
  }
  return sequence;
}

function resolveMinutes(step) {
  const minutes = numberOrNull(step.minutes ?? step.durationMinutes);
  if (!Number.isInteger(minutes) || minutes <= 0) {
    throw resolverError("El paso requiere minutes entero mayor a cero.", { step });
  }
  return minutes;
}

function addActivitySegment({ activitySegments, cursor, step, category, reason }) {
  const minutes = resolveMinutes(step);
  activitySegments.push({
    category,
    minutes,
    reason: reason || step.reason || step.summary || "",
  });
  return addMinutesToDayTime(cursor.day, cursor.time, minutes);
}

async function resolveLocationNames(locationIds = []) {
  const locations = await Location.find({ locationId: { $in: unique(locationIds) } })
    .select("locationId name")
    .lean();
  return new Map(locations.map((location) => [location.locationId, location.name || location.locationId]));
}

async function resolveNpcName(npcId) {
  if (!npcId) return "";
  const npc = await Npc.findOne({ npcId }).select("npcId name").lean();
  return npc?.name || npcId;
}

function chooseShiftForAttendance(contract, { day, time, shiftId = "" }) {
  const shifts = contract?.shifts || [];
  if (shiftId) return shifts.find((shift) => shift.shiftId === shiftId) || null;

  const current = absoluteMinutes(day, time);
  const candidates = shifts
    .filter((shift) => shift.status !== "inactive" && shift.status !== "ended")
    .map((shift) => {
      const start = absoluteMinutes(day, shift.startTime);
      const end = absoluteMinutes(day, shift.endTime);
      const normalizedEnd = end <= start ? end + 1440 : end;
      return {
        shift,
        start,
        end: normalizedEnd,
        minutesLate: current - start,
      };
    })
    .filter((entry) => entry.minutesLate >= 0 && current <= entry.end + 60)
    .sort((left, right) => left.minutesLate - right.minutesLate);

  return candidates[0]?.shift || null;
}

async function addJobAttendancePatch({
  body,
  gameState,
  cursor,
  step,
  jobContractPatches,
  warnings,
  resolverSteps,
}) {
  const contractId = step.contractId || body.intent?.jobContractId || "";
  const contract = await JobContract.findOne({
    ...(contractId ? { contractId } : {}),
    characterId: gameState.characterId || DEFAULT_CHARACTER_ID,
    status: "active",
  })
    .sort({ startDay: -1 })
    .lean();

  if (!contract) {
    warnings.push("No se encontro contrato laboral activo para registrar asistencia.");
    return;
  }

  const shift = chooseShiftForAttendance(contract, {
    day: cursor.day,
    time: cursor.time,
    shiftId: step.shiftId || body.intent?.shiftId || "",
  });

  if (!shift) {
    warnings.push("No se encontro turno laboral aplicable para la hora final del resolver.");
    return;
  }

  const minutesLate = Math.max(0, absoluteMinutes(cursor.day, cursor.time) - absoluteMinutes(cursor.day, shift.startTime));
  if (minutesLate <= 0 && normalizeStepType(step) !== "job_absence") {
    resolverSteps.push({
      type: "job_attendance",
      skipped: true,
      reason: "Lucas no llega tarde segun la hora calculada.",
      contractId: contract.contractId,
      shiftId: shift.shiftId,
    });
    return;
  }

  const consequenceLevel = step.consequenceLevel || (minutesLate <= 60 ? "minor" : "moderate");
  const targetNpcId = step.targetNpcId || step.npcId || body.intent?.targetNpcId || contract.employerNpcId || "";
  const targetNpcName = await resolveNpcName(targetNpcId);
  const reason =
    step.reason ||
    body.intent?.summary ||
    `Llegada tarde calculada por resolveTurn: ${minutesLate} min tarde a ${shift.name}.`;

  jobContractPatches.push({
    op: "record_shift_late",
    contractId: contract.contractId,
    shiftId: shift.shiftId,
    day: cursor.day,
    time: cursor.time,
    minutesLate,
    excused: Boolean(step.excused),
    consequenceLevel,
    consequenceApplied: step.consequenceApplied !== undefined ? Boolean(step.consequenceApplied) : true,
    consequenceSummary:
      step.consequenceSummary ||
      `Lucas llega ${minutesLate} min tarde a ${shift.name}${targetNpcName ? ` y se disculpa ante ${targetNpcName}` : ""}.`,
    reason,
  });

  resolverSteps.push({
    type: "job_attendance",
    op: "record_shift_late",
    contractId: contract.contractId,
    shiftId: shift.shiftId,
    shiftName: shift.name,
    minutesLate,
    targetNpcId,
    targetNpcName,
    consequenceLevel,
  });
}

function normalizeWorkIntensity(value = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

  if (["fuerte", "intenso", "heavy", "hard", "alta"].includes(normalized)) return "strong";
  if (["suave", "ligero", "light", "baja"].includes(normalized)) return "light";
  return "normal";
}

function categoryForWorkSegment(step = {}, shift = {}) {
  if (step.category) return step.category;
  const intensity = normalizeWorkIntensity(step.intensity || step.pace || "");
  if (intensity === "strong") return "trabajo_fuerte";
  if (intensity === "light") return "actividad_normal";
  return shift.activityCategory || "trabajo_normal";
}

function shiftWindowForDay(day, shift) {
  const start = absoluteMinutes(day, shift.startTime);
  let end = absoluteMinutes(day, shift.endTime);
  if (end <= start) end += 1440;
  return { start, end };
}

function chooseShiftForWorkSegment(contract, { day, time, shiftId = "" }) {
  const shifts = contract?.shifts || [];
  const current = absoluteMinutes(day, time);
  const candidates = shifts
    .filter((shift) => shift.status !== "inactive" && shift.status !== "ended")
    .filter((shift) => !shiftId || shift.shiftId === shiftId)
    .map((shift) => {
      const window = shiftWindowForDay(day, shift);
      return { shift, ...window };
    })
    .filter((entry) => current >= entry.start && current < entry.end)
    .sort((left, right) => left.end - right.end);

  return candidates[0] || null;
}

async function addWorkSegmentPatch({
  body,
  gameState,
  cursor,
  step,
  activitySegments,
  jobContractPatches,
  warnings,
  resolverSteps,
  actionSummary,
}) {
  const contractId = step.contractId || body.intent?.jobContractId || "";
  const contract = await JobContract.findOne({
    ...(contractId ? { contractId } : {}),
    characterId: gameState.characterId || DEFAULT_CHARACTER_ID,
    status: "active",
  })
    .sort({ startDay: -1 })
    .lean();

  if (!contract) {
    throw resolverError("work_segment requiere un contrato laboral activo.", {
      errorCode: "NO_ACTIVE_JOB_CONTRACT",
      suggestedPayload: {
        actionFamily: "job_shift",
        sequence: [
          {
            type: "activity",
            minutes: resolveMinutes(step),
            category: step.category || "trabajo_normal",
            reason: step.reason || actionSummary,
          },
        ],
      },
    });
  }

  const chosen = chooseShiftForWorkSegment(contract, {
    day: cursor.day,
    time: cursor.time,
    shiftId: step.shiftId || body.intent?.shiftId || "",
  });

  if (!chosen) {
    throw resolverError("work_segment requiere estar dentro de un turno laboral activo.", {
      errorCode: "NO_ACTIVE_JOB_SHIFT_AT_TIME",
      currentDay: cursor.day,
      currentTime: cursor.time,
      contractId: contract.contractId,
      allowedShiftIds: (contract.shifts || []).map((shift) => shift.shiftId),
      suggestedPayload: {
        actionFamily: "job_shift",
        sequence: [
          {
            type: "job_attendance",
            contractId: contract.contractId,
            shiftId: step.shiftId || "",
          },
        ],
      },
    });
  }

  const scheduleStatus = getShiftScheduleStatus(contract, chosen.shift, cursor.day);
  if (!scheduleStatus.active) {
    throw resolverError("work_segment apunta a un turno inactivo.", {
      errorCode: "INACTIVE_JOB_SHIFT",
      contractId: contract.contractId,
      shiftId: chosen.shift.shiftId,
      status: scheduleStatus.status,
      reason: scheduleStatus.reason,
    });
  }

  const minutes = resolveMinutes(step);
  const current = absoluteMinutes(cursor.day, cursor.time);
  const maxMinutes = chosen.end - current;
  if (minutes > maxMinutes && !step.allowTruncate) {
    throw resolverError("work_segment excede el tiempo restante del turno.", {
      errorCode: "WORK_SEGMENT_EXCEEDS_SHIFT",
      requestedMinutes: minutes,
      maxMinutes,
      contractId: contract.contractId,
      shiftId: chosen.shift.shiftId,
      suggestedPayload: {
        actionFamily: "job_shift",
        sequence: [
          {
            type: "work_segment",
            minutes: maxMinutes,
            intensity: step.intensity || "normal",
            contractId: contract.contractId,
            shiftId: chosen.shift.shiftId,
          },
        ],
      },
    });
  }

  const appliedMinutes = Math.min(minutes, maxMinutes);
  const category = categoryForWorkSegment(step, chosen.shift);
  const intensity = normalizeWorkIntensity(step.intensity || "");
  const before = { day: cursor.day, time: cursor.time };
  const after = addActivitySegment({
    activitySegments,
    cursor,
    step: { ...step, minutes: appliedMinutes },
    category,
    reason: step.reason || step.summary || actionSummary,
  });
  cursor.day = after.day;
  cursor.time = after.time;

  jobContractPatches.push({
    op: "record_work_segment",
    contractId: contract.contractId,
    shiftId: chosen.shift.shiftId,
    day: before.day,
    startTime: before.time,
    endTime: after.time,
    minutes: appliedMinutes,
    category,
    intensity,
    reason: step.reason || actionSummary,
    source: "resolveTurn.work_segment",
  });

  resolverSteps.push({
    index: step.index,
    type: "work_segment",
    category,
    intensity,
    minutes: appliedMinutes,
    from: before,
    to: after,
    contractId: contract.contractId,
    shiftId: chosen.shift.shiftId,
    shiftName: chosen.shift.name,
  });

  if (appliedMinutes < minutes) {
    warnings.push(`work_segment truncado a ${appliedMinutes} min por fin de turno.`);
  }
}

function buildNpcMemoryPatch({ body, gameState, cursor, step }) {
  const npcId = step.npcId || step.targetNpcId || body.intent?.targetNpcId || "";
  if (!npcId) {
    throw resolverError("npc_memory requiere npcId o targetNpcId.");
  }

  const fact =
    step.fact ||
    body.intent?.summary ||
    "Lucas interactuo con este NPC durante un turno resuelto automaticamente.";

  return {
    npcId,
    fact,
    summary: step.summary || fact,
    sourceType: step.sourceType || "heard",
    certainty: step.certainty || "confirmed",
    emotionalWeight: step.emotionalWeight || "low",
    privacyLevel: step.privacyLevel || "private",
    canShare: Boolean(step.canShare),
    createdDay: cursor.day || gameState.currentDay,
    createdTime: cursor.time || gameState.time,
    lastReferencedDay: cursor.day || gameState.currentDay,
    importance: step.importance || "normal",
    relatedNpcIds: step.relatedNpcIds || [],
    relatedLocationIds: step.relatedLocationIds || [gameState.locationId],
    tags: unique(["resolve_turn", ...(step.tags || [])]),
  };
}

async function buildResolveTurnPayload(body = {}, { forceDryRun = null } = {}) {
  const gameId = body.gameId || DEFAULT_GAME_ID;
  const gameState = await GameState.findOne({ gameId }).lean();
  if (!gameState) throw resolverError(`No existe GameState para gameId: ${gameId}`, {}, 404);

  const sequence = resolveSequence(body);
  const dryRun = forceDryRun !== null ? Boolean(forceDryRun) : Boolean(body.dryRun);
  const actionSummary =
    body.actionSummary ||
    body.intent?.summary ||
    body.playerText ||
    "Turno compuesto resuelto por resolveTurn.";
  const clientTurnId = body.clientTurnId || createClientTurnId({ gameState, sequence, actionSummary });
  const cursor = {
    day: gameState.currentDay,
    time: gameState.time,
    locationId: gameState.locationId,
  };
  const start = { ...cursor };
  const activitySegments = [];
  const skillPatch = [];
  const npcMemoryPatches = [];
  const warnings = [];
  const resolverSteps = [];
  const routePreviews = [];
  const jobContractPatches = [];

  for (const [index, step] of sequence.entries()) {
    const type = normalizeStepType(step);

    if (["rest", "activity", "wait", "environment_check"].includes(type)) {
      const defaultCategory =
        type === "rest" ? "descanso_sentado" : type === "environment_check" ? "actividad_normal" : "actividad_normal";
      const category = step.category || defaultCategory;
      const before = { day: cursor.day, time: cursor.time };
      const after = addActivitySegment({
        activitySegments,
        cursor,
        step,
        category,
        reason: step.reason || step.summary || actionSummary,
      });
      cursor.day = after.day;
      cursor.time = after.time;
      resolverSteps.push({
        index,
        type,
        category,
        minutes: resolveMinutes(step),
        from: before,
        to: after,
      });
      continue;
    }

    if (type === "travel") {
      const toLocationId = step.toLocationId || step.destinationLocationId || body.intent?.destinationLocationId || "";
      if (!toLocationId) throw resolverError("travel requiere toLocationId.");

      const fromLocationId = step.fromLocationId || cursor.locationId;
      const pace = pacePlan(normalizePace(step.pace || body.intent?.pace || body.intent?.travelPace || ""));
      const preview = await previewTravel({
        gameId,
        routeId: step.routeId || "",
        fromLocationId,
        toLocationId,
        conditions: {
          ...(step.conditions || {}),
          allowMultiSegment: step.allowMultiSegment !== undefined ? Boolean(step.allowMultiSegment) : true,
          maxSegments: Number.isInteger(step.maxSegments) ? step.maxSegments : 4,
          startDay: cursor.day,
          startTime: cursor.time,
          activityCategory: pace.category,
        },
      });

      const normalMinutes = preview.timing.finalMinutes;
      const travelMinutes = roundUpToFive(Math.max(5, normalMinutes * pace.durationMultiplier));
      const before = { day: cursor.day, time: cursor.time, locationId: fromLocationId };
      activitySegments.push({
        category: step.category || pace.category,
        minutes: travelMinutes,
        reason:
          step.reason ||
          `Viaje ${pace.label} desde ${fromLocationId} hasta ${toLocationId}.`,
      });
      const after = addMinutesToDayTime(cursor.day, cursor.time, travelMinutes);
      cursor.day = after.day;
      cursor.time = after.time;
      cursor.locationId = toLocationId;
      routePreviews.push({
        fromLocationId,
        toLocationId,
        normalMinutes,
        resolvedMinutes: travelMinutes,
        pace: pace.pace,
        riskLevel: preview.riskLevel,
        warnings: preview.warnings || [],
        path: preview.path
          ? {
              multiSegment: true,
              segmentCount: preview.path.segmentCount,
              segments: preview.path.segments.map((segment) => ({
                routeId: segment.route?.routeId,
                fromLocationId: segment.route?.fromLocationId,
                toLocationId: segment.route?.toLocationId,
                minutes: segment.timing?.finalMinutes,
                riskLevel: segment.riskLevel,
              })),
            }
          : null,
        routeId: preview.route?.routeId || "",
      });
      warnings.push(...(preview.warnings || []));

      if (pace.skillAwards && step.awardSkills !== false) {
        addSkillAward(skillPatch, {
          skillId: "skill_resistencia",
          expDelta: 2,
          category: "viaje",
          durationMinutes: travelMinutes,
          reason: `Carrera sostenida durante viaje urgente: ${actionSummary}`,
          modifiers: { newContext: true, realRisk: true },
        });

        if (routeLooksDifficult(preview)) {
          addSkillAward(skillPatch, {
            skillId: "skill_agilidad",
            expDelta: 4,
            category: "terreno_dificil",
            durationMinutes: travelMinutes,
            reason: `Carrera por ruta con terreno o riesgo durante viaje urgente: ${actionSummary}`,
            modifiers: { newContext: true, realRisk: true },
          });
        }
      }

      resolverSteps.push({
        index,
        type,
        pace: pace.pace,
        category: step.category || pace.category,
        from: before,
        to: { day: after.day, time: after.time, locationId: toLocationId },
        normalMinutes,
        resolvedMinutes: travelMinutes,
        riskLevel: preview.riskLevel,
      });
      continue;
    }

    if (["job_attendance", "job_late", "work_attendance"].includes(type)) {
      await addJobAttendancePatch({
        body,
        gameState,
        cursor,
        step,
        jobContractPatches,
        warnings,
        resolverSteps,
      });
      continue;
    }

    if (type === "work_segment") {
      await addWorkSegmentPatch({
        body,
        gameState,
        cursor,
        step: { ...step, index },
        activitySegments,
        jobContractPatches,
        warnings,
        resolverSteps,
        actionSummary,
      });
      continue;
    }

    if (["npc_memory", "apology", "apologize"].includes(type)) {
      const memoryPatch = buildNpcMemoryPatch({
        body,
        gameState,
        cursor,
        step: {
          ...step,
          fact:
            step.fact ||
            (type === "apology" || type === "apologize"
              ? `Lucas se disculpo sin excusas durante este turno: ${actionSummary}`
              : ""),
        },
      });
      npcMemoryPatches.push(memoryPatch);
      resolverSteps.push({
        index,
        type,
        npcId: memoryPatch.npcId,
        memoryFact: memoryPatch.fact,
      });
      continue;
    }

    throw resolverError("Tipo de paso no soportado por resolveTurn.", {
      index,
      type,
      supportedTypes: SUPPORTED_STEP_TYPES,
    });
  }

  const elapsedMinutes = diffMinutes({
    fromDay: start.day,
    from: start.time,
    toDay: cursor.day,
    to: cursor.time,
  });
  if (elapsedMinutes <= 0) {
    throw resolverError("resolveTurn no produjo avance de tiempo positivo.");
  }

  const locationNames = await resolveLocationNames([start.locationId, cursor.locationId]);
  const hasJobStep = resolverSteps.some((step) => ["job_attendance", "work_segment"].includes(step.type));
  const actionFamily =
    normalizeResolverActionFamily(body.actionFamily) ||
    (hasJobStep ? "job_shift" : resolverSteps.some((step) => step.type === "travel") ? "travel" : "social");
  const eventType = body.eventLogType || `resolve_${resolverSteps.map((step) => step.type).join("_")}`.slice(0, 80);
  const involvedNpcIds = unique([
    ...(body.involvedNpcIds || []),
    ...npcMemoryPatches.map((patch) => patch.npcId),
    ...jobContractPatches.map((patch) => patch.targetNpcId),
    body.intent?.targetNpcId,
  ]);
  const eventLog = {
    type: eventType,
    summary: actionSummary,
    involvedCharacterIds: [gameState.characterId || DEFAULT_CHARACTER_ID],
    involvedNpcIds,
    visibility: body.visibility || "private",
    source: "player_action",
    tags: unique([
      "resolve_turn",
      ...resolverSteps.map((step) => step.type),
      ...(body.tags || []),
    ]),
  };

  const applyTurnPayload = {
    gameId,
    clientTurnId,
    dryRun,
    responseProfile: body.responseProfile || "compact",
    actionFamily,
    actionSummary,
    timeAdvance: {
      fromDay: start.day,
      from: start.time,
      toDay: cursor.day,
      to: cursor.time,
    },
    activitySegments,
    eventLogs: [eventLog],
  };

  if (cursor.locationId !== start.locationId) {
    applyTurnPayload.gameStatePatch = {
      locationId: cursor.locationId,
    };
  }

  if (skillPatch.length > 0) applyTurnPayload.skillPatch = skillPatch;
  if (jobContractPatches.length > 0) applyTurnPayload.jobContractPatch = jobContractPatches;
  if (npcMemoryPatches.length > 0) applyTurnPayload.npcMemoryPatches = npcMemoryPatches;

  if (body.applyTurnOverrides && typeof body.applyTurnOverrides === "object") {
    Object.assign(applyTurnPayload, body.applyTurnOverrides);
    applyTurnPayload.dryRun = dryRun;
    applyTurnPayload.gameId = gameId;
    applyTurnPayload.clientTurnId = clientTurnId;
  }

  return {
    applyTurnPayload,
    resolverPlan: {
      schemaVersion: "resolve_turn_v1",
      mode: dryRun ? "preview" : "apply",
      gameId,
      clientTurnId,
      actionSummary,
      elapsedMinutes,
      from: {
        day: start.day,
        time: start.time,
        locationId: start.locationId,
        locationName: locationNames.get(start.locationId) || start.locationId,
      },
      to: {
        day: cursor.day,
        time: cursor.time,
        locationId: cursor.locationId,
        locationName: locationNames.get(cursor.locationId) || cursor.locationId,
      },
      steps: resolverSteps,
      routePreviews,
      generated: {
        activitySegments,
        skillPatchCount: skillPatch.length,
        hasJobContractPatch: jobContractPatches.length > 0,
        jobContractPatchCount: jobContractPatches.length,
        npcMemoryPatchCount: npcMemoryPatches.length,
      },
      warnings: unique(warnings),
    },
  };
}

module.exports = {
  buildResolveTurnPayload,
};
