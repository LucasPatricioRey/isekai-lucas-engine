const mongoose = require("mongoose");

const GameState = require("../models/GameState");
const EventLog = require("../models/EventLog");
const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const Rumor = require("../models/Rumor");
const WorldEvent = require("../models/WorldEvent");
const Location = require("../models/Location");
const ShopStock = require("../models/ShopStock");
const Item = require("../models/Item");
const Mission = require("../models/Mission");
const { syncNpcRoutines } = require("../services/routineService");
const { calculateActivityCost, normalizeCategory } = require("../services/biologicalClockService");
const { reconcileDailyEventsForGameState } = require("../services/dailyEventSchedulerService");
const { buildWorldEventSocialConsequencePlan } = require("../services/dailyEventSocialService");
const { expireAvailableMissionsForGameState } = require("../services/missionService");
const { previewSkillProgression } = require("../services/skillProgressionService");
const { ensureCurrentWeatherForGameState } = require("../services/weatherService");
const { createAutomaticCheckpoint } = require("../services/checkpointService");
const {
  attachNarrativeTrackingToLogDrafts,
  buildNarrativeHints,
} = require("../services/narrativeVariationService");
const { applyJobContractPatches } = require("../services/jobScheduleService");
const {
  SOCIAL_FIELD_RANGES,
  SOCIAL_RELATIONSHIP_FIELDS,
  applyDailySocialCaps,
  createSocialLedgerEntry,
  getDailySocialUsage,
  hasNonZeroDelta,
  normalizeActionType,
  normalizeDeltas,
  normalizeRelationship,
  relationshipBand,
} = require("../services/socialLedgerService");
const { socialDebtBand } = require("../services/socialRelationshipStateService");

const VALID_EVENT_LOG_SOURCES = new Set([
  "player_action",
  "system",
  "npc_action",
  "world_event",
  "admin",
  "system_correction",
  "mechanical_audit",
  "backend_validation",
  "admin_fix",
]);

const VALID_EVENT_LOG_VISIBILITIES = new Set(["hidden", "private", "local", "public"]);
const CLOSED_WORLD_EVENT_STATUSES = new Set(["resolved", "expired", "consequences_applied", "cancelled"]);

function validationError(message, details = {}) {
  const error = new Error(message);
  error.statusCode = 400;
  error.details = details;
  return error;
}

function isValidTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function getBlockFromTime(time) {
  const hour = Number(time.split(":")[0]);

  if (hour >= 0 && hour < 6) return "Madrugada";
  if (hour >= 6 && hour < 12) return "Mañana";
  if (hour >= 12 && hour < 14) return "Mediodía";
  if (hour >= 14 && hour < 18) return "Tarde";
  return "Noche";
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function diffTimeMinutes(from, to) {
  return timeToMinutes(to) - timeToMinutes(from);
}

function toAbsoluteMinutes(day, time) {
  return (Number(day) - 1) * 1440 + timeToMinutes(time);
}

function dayFromAbsoluteMinutes(totalMinutes) {
  return Math.floor(totalMinutes / 1440) + 1;
}

function diffAdvanceMinutes({ fromDay, from, toDay, to }) {
  return toAbsoluteMinutes(toDay, to) - toAbsoluteMinutes(fromDay, from);
}

function minutesToTime(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getHourBlockStart(time) {
  return minutesToTime(Math.floor(timeToMinutes(time) / 60) * 60);
}

function getHourBlockEnd(blockStart) {
  return minutesToTime(timeToMinutes(blockStart) + 60);
}

function getHourBlockForTime(time) {
  const blockStart = getHourBlockStart(time);
  return `${blockStart}-${getHourBlockEnd(blockStart)}`;
}

function advanceDiegeticDate(diegeticDate, dayDelta) {
  if (!diegeticDate || dayDelta <= 0) return diegeticDate;

  diegeticDate.day = Number(diegeticDate.day || 0) + dayDelta;
  return diegeticDate;
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createLogId() {
  return createId("log");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

const SOCIAL_FIELD_LABELS = {
  trust: "Confianza",
  familiarity: "Familiaridad",
  affection: "Afecto",
  suspicion: "Sospecha",
  respect: "Respeto",
  fear: "Miedo",
  jealousy: "Celos",
  socialDebt: "Deuda social",
};

function formatSignedDelta(delta = 0) {
  return delta > 0 ? `+${delta}` : String(delta);
}

function buildSocialFieldChanges({ before = {}, after = {}, requestedDeltas = {}, appliedDeltas = {} } = {}) {
  return SOCIAL_RELATIONSHIP_FIELDS
    .filter((field) => (requestedDeltas[field] || 0) !== 0 || (appliedDeltas[field] || 0) !== 0)
    .map((field) => {
      const beforeValue = Number(before[field]) || 0;
      const afterValue = Number(after[field]) || 0;
      const requestedDelta = Number(requestedDeltas[field]) || 0;
      const appliedDelta = Number(appliedDeltas[field]) || 0;
      const beforeBand = field === "socialDebt" ? socialDebtBand(beforeValue) : relationshipBand(beforeValue);
      const afterBand = field === "socialDebt" ? socialDebtBand(afterValue) : relationshipBand(afterValue);
      const label = SOCIAL_FIELD_LABELS[field] || field;
      const bandChanged = beforeBand.key !== afterBand.key;

      return {
        field,
        label,
        before: beforeValue,
        after: afterValue,
        requestedDelta,
        appliedDelta,
        beforeBand: beforeBand.label,
        beforeBandKey: beforeBand.key,
        afterBand: afterBand.label,
        afterBandKey: afterBand.key,
        bandChanged,
        milestone: bandChanged
          ? {
              field,
              label,
              beforeBand: beforeBand.label,
              beforeBandKey: beforeBand.key,
              afterBand: afterBand.label,
              afterBandKey: afterBand.key,
              value: afterValue,
            }
          : null,
        display: `${label}: ${beforeValue}->${afterValue} (${formatSignedDelta(appliedDelta)})`,
      };
    });
}

function buildSocialMilestoneLines(npcName, fieldChanges = []) {
  return fieldChanges
    .filter((entry) => entry.bandChanged && entry.milestone)
    .map((entry) => {
      const direction = entry.after > entry.before ? "subio" : "cambio";
      return `Hito de vínculo — ${npcName}: ${entry.label} ${direction} de ${entry.beforeBand} a ${entry.afterBand}.`;
    });
}

function buildSocialMilestoneSceneCues(npcName, fieldChanges = []) {
  return fieldChanges
    .filter((entry) => entry.bandChanged && entry.milestone)
    .map((entry) => {
      const wentUp = entry.after > entry.before;
      const axis = entry.field;
      let cue = "Mostrar un cambio sutil de trato en la proxima escena.";

      if (axis === "trust" && wentUp) {
        cue = "El NPC puede mostrarse un poco mas relajado, delegar algo simple o responder con menos defensa.";
      } else if (axis === "familiarity" && wentUp) {
        cue = "El NPC puede tratar a Lucas como presencia mas cotidiana, sin volver cada gesto una sorpresa.";
      } else if (axis === "respect" && wentUp) {
        cue = "El NPC puede reconocer competencia con menos explicacion y corregirlo de forma mas directa.";
      } else if (axis === "affection" && wentUp) {
        cue = "Puede aparecer calidez leve, pero no convertirlo en romance ni avance intenso.";
      } else if (["suspicion", "fear", "jealousy"].includes(axis) && wentUp) {
        cue = "El NPC debe mostrar mas cautela, distancia o lectura tensa de la escena.";
      } else if (axis === "socialDebt" && wentUp) {
        cue = "El NPC puede sentir que Lucas hizo algo que merece devolverse, sin crear recompensa automatica.";
      }

      return {
        npcName,
        field: axis,
        label: entry.label,
        beforeBand: entry.beforeBand,
        afterBand: entry.afterBand,
        cue,
      };
    });
}

function numericDeltaMagnitude(value) {
  return Math.abs(Number(value) || 0);
}

function relationshipDeltaMagnitude(npcRelationships = []) {
  return npcRelationships.reduce((total, entry) => {
    const applied = entry?.appliedDeltas || {};
    return (
      total +
      SOCIAL_RELATIONSHIP_FIELDS.reduce((fieldTotal, field) => fieldTotal + numericDeltaMagnitude(applied[field]), 0)
    );
  }, 0);
}

function addAutoCheckpointTrigger(triggers, key, label) {
  if (!triggers.some((trigger) => trigger.key === key)) {
    triggers.push({ key, label });
  }
}

function buildApplyTurnAutoCheckpointPlan(changes = {}) {
  const triggers = [];
  const elapsedMinutes = Number(changes.time?.elapsedMinutes) || 0;
  const moneyDelta = numericDeltaMagnitude(changes.money?.delta);
  const socialDelta = relationshipDeltaMagnitude(changes.npcRelationships || []);
  const injuryCount =
    (Array.isArray(changes.lucasStatus?.addInjuries) ? changes.lucasStatus.addInjuries.length : 0) +
    (Array.isArray(changes.lucasStatus?.addConditions) ? changes.lucasStatus.addConditions.length : 0);
  const lifeDelta = Number(changes.lucasStatus?.life?.delta) || 0;

  if (changes.time?.crossesMidnight) {
    addAutoCheckpointTrigger(triggers, "day_change", "cambio de día");
  }

  if (injuryCount > 0 || lifeDelta < 0) {
    addAutoCheckpointTrigger(triggers, "injury", "herida o condición física importante");
  }

  if (Array.isArray(changes.missions) && changes.missions.length > 0) {
    addAutoCheckpointTrigger(triggers, "mission", "cambio formal de misión");
  }

  if (
    (Array.isArray(changes.worldEvents) && changes.worldEvents.length > 0) ||
    (Array.isArray(changes.worldEventSocialConsequences) && changes.worldEventSocialConsequences.length > 0) ||
    (Array.isArray(changes.dailyEvents?.expired) && changes.dailyEvents.expired.length > 0)
  ) {
    addAutoCheckpointTrigger(triggers, "world_event", "evento de mundo modificado");
  }

  if (socialDelta >= 5) {
    addAutoCheckpointTrigger(triggers, "major_social", "avance social significativo");
  }

  if (Array.isArray(changes.jobContracts) && changes.jobContracts.length > 0) {
    addAutoCheckpointTrigger(triggers, "job_contract", "cambio formal de contrato laboral");
  }

  if (elapsedMinutes >= 120) {
    addAutoCheckpointTrigger(triggers, "long_scene", "escena larga");
  }

  if (Array.isArray(changes.skills) && changes.skills.length > 0) {
    addAutoCheckpointTrigger(triggers, "progression", "progreso de habilidades");
  }

  if (moneyDelta >= 100 || changes.inventory || changes.shopStocks) {
    addAutoCheckpointTrigger(triggers, "economy", "cambio económico o de inventario");
  }

  if (changes.location && elapsedMinutes >= 30) {
    addAutoCheckpointTrigger(triggers, "major_travel", "viaje o cambio de ubicación importante");
  }

  if (triggers.length === 0) return null;

  const priority = [
    "injury",
    "day_change",
    "mission",
    "world_event",
    "major_social",
    "long_scene",
    "progression",
    "economy",
    "major_travel",
  ];
  const primary = triggers
    .slice()
    .sort((left, right) => priority.indexOf(left.key) - priority.indexOf(right.key))[0];

  return {
    triggerKey: `apply_turn:${primary.key}`,
    title: `Auto checkpoint - ${primary.label}`,
    reason: `Checkpoint automático tras ${triggers.map((trigger) => trigger.label).join(", ")}.`,
    metadata: {
      source: "applyTurn",
      triggers: triggers.map((trigger) => trigger.key),
      elapsedMinutes,
      moneyDelta,
      socialDelta,
    },
  };
}

function toPlain(value) {
  if (!value) return value;
  if (typeof value.toObject === "function") return value.toObject();
  return JSON.parse(JSON.stringify(value));
}

async function getContextualLocationIds(locationId, session = null) {
  const currentLocation = await Location.findOne({ locationId }).session(session).lean();
  if (!currentLocation) return new Set([locationId]);

  const parentLocation = currentLocation.parentLocationId
    ? await Location.findOne({ locationId: currentLocation.parentLocationId }).session(session).lean()
    : null;

  const siblingLocationIds = currentLocation.parentLocationId
    ? await Location.find({ parentLocationId: currentLocation.parentLocationId })
        .select("locationId")
        .session(session)
        .lean()
    : [];

  const childLocationIds = await Location.find({ parentLocationId: locationId })
    .select("locationId")
    .session(session)
    .lean();

  return new Set(unique([
    locationId,
    currentLocation.parentLocationId,
    parentLocation?.parentLocationId,
    ...siblingLocationIds.map((location) => location.locationId),
    ...childLocationIds.map((location) => location.locationId),
  ]));
}

async function validateNpcRelationshipPatchContext({ gameState, npc, patch, session = null }) {
  const gameId = gameState.gameId || "isekai_lucas_main";

  if (patch.sourceEventId) {
    const event = await WorldEvent.findOne({
      eventId: patch.sourceEventId,
      gameId,
    })
      .session(session)
      .lean();

    if (!event) {
      throw validationError("npcRelationshipPatch.sourceEventId no existe para este gameId.", {
        npcId: patch.npcId,
        sourceEventId: patch.sourceEventId,
        gameId,
      });
    }

    if (!(event.affectedNpcIds || []).includes(patch.npcId)) {
      throw validationError("npcRelationshipPatch.sourceEventId no afecta al NPC indicado.", {
        npcId: patch.npcId,
        sourceEventId: patch.sourceEventId,
        affectedNpcIds: event.affectedNpcIds || [],
      });
    }

    return {
      type: "sourceEventId",
      sourceEventId: patch.sourceEventId,
    };
  }

  if (patch.sourceEventLogId) {
    const eventLog = await EventLog.findOne({
      logId: patch.sourceEventLogId,
      gameId,
    })
      .session(session)
      .lean();

    if (!eventLog) {
      throw validationError("npcRelationshipPatch.sourceEventLogId no existe para este gameId.", {
        npcId: patch.npcId,
        sourceEventLogId: patch.sourceEventLogId,
        gameId,
      });
    }

    if (!(eventLog.involvedNpcIds || []).includes(patch.npcId)) {
      throw validationError("npcRelationshipPatch.sourceEventLogId no involucra al NPC indicado.", {
        npcId: patch.npcId,
        sourceEventLogId: patch.sourceEventLogId,
        involvedNpcIds: eventLog.involvedNpcIds || [],
      });
    }

    return {
      type: "sourceEventLogId",
      sourceEventLogId: patch.sourceEventLogId,
    };
  }

  if (patch.sourceMissionId) {
    const mission = await Mission.findOne({ missionId: patch.sourceMissionId }).session(session).lean();

    if (!mission) {
      throw validationError("npcRelationshipPatch.sourceMissionId no existe.", {
        npcId: patch.npcId,
        sourceMissionId: patch.sourceMissionId,
      });
    }

    if (mission.clientNpcId !== patch.npcId) {
      throw validationError("npcRelationshipPatch.sourceMissionId no corresponde al NPC indicado.", {
        npcId: patch.npcId,
        sourceMissionId: patch.sourceMissionId,
        clientNpcId: mission.clientNpcId,
      });
    }

    return {
      type: "sourceMissionId",
      sourceMissionId: patch.sourceMissionId,
    };
  }

  const contextualLocationIds = await getContextualLocationIds(gameState.locationId, session);

  if (npc.currentLocationId && contextualLocationIds.has(npc.currentLocationId)) {
    return {
      type: npc.currentLocationId === gameState.locationId ? "sameRoom" : "locationScope",
      locationId: npc.currentLocationId,
    };
  }

  throw validationError(
    "npcRelationshipPatch requiere NPC presente/cercano o una fuente valida (sourceEventId, sourceEventLogId o sourceMissionId).",
    {
      npcId: patch.npcId,
      npcCurrentLocationId: npc.currentLocationId || "",
      currentLocationId: gameState.locationId,
      allowedLocationIds: Array.from(contextualLocationIds),
    }
  );
}

function normalizePendingAccumulationIdentities(gameState) {
  const pending = gameState.biologicalClock?.pendingAccumulations || [];
  let changed = false;

  for (const entry of pending) {
    if (!entry) continue;
    if (!entry.gameId) {
      entry.gameId = gameState.gameId || "isekai_lucas_main";
      changed = true;
    }
    if (!entry.characterId) {
      entry.characterId = gameState.characterId || "char_lucas";
      changed = true;
    }
  }

  if (changed && typeof gameState.markModified === "function") {
    gameState.markModified("biologicalClock");
  }

  return changed;
}

function getStatusLabel(statKey, current) {
  if (statKey === "satiety") {
    if (current >= 71) return "satisfecho";
    if (current >= 51) return "hambre leve";
    if (current >= 21) return "hambre fuerte";
    if (current >= 1) return "debilidad/mareos";
    return "inanicion/riesgo de vida";
  }

  if (statKey === "energy") {
    if (current >= 70) return "rendimiento normal";
    if (current >= 40) return "cansancio leve/energia media";
    if (current >= 20) return "cansancio serio";
    if (current >= 1) return "agotamiento peligroso";
    return "colapso";
  }

  return "";
}

function applyStatDelta(stat, delta, statKey) {
  const before = stat.current;
  const after = clamp(before + delta, 0, stat.max);
  stat.current = after;

  const label = getStatusLabel(statKey, after);
  if (label) {
    stat.label = label;
  }

  return {
    before,
    delta,
    after,
    labelAfter: stat.label || "",
  };
}

const ALLOWED_SKILL_PATCH_MODIFIERS = new Set(["aquaBlessing", "hasMaster"]);

function normalizeSkillPatchInput(patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    throw validationError("skillPatch debe contener objetos de progreso validables.");
  }

  const reason = String(patch.reason || "").trim();
  if (reason.length < 8) {
    throw validationError("skillPatch.reason es obligatorio y debe explicar la fuente de EXP.");
  }

  const category = String(patch.category || "").trim();
  if (!category) {
    throw validationError("skillPatch.category es obligatorio para validar el rango de EXP.");
  }

  const modifiers = patch.modifiers || {};
  if (!modifiers || typeof modifiers !== "object" || Array.isArray(modifiers)) {
    throw validationError("skillPatch.modifiers debe ser un objeto si se envia.");
  }

  const unknownModifiers = Object.keys(modifiers).filter((key) => !ALLOWED_SKILL_PATCH_MODIFIERS.has(key));
  if (unknownModifiers.length > 0) {
    throw validationError("skillPatch.modifiers contiene claves no permitidas.", {
      allowed: Array.from(ALLOWED_SKILL_PATCH_MODIFIERS),
      received: unknownModifiers,
    });
  }

  for (const [key, value] of Object.entries(modifiers)) {
    if (typeof value !== "boolean") {
      throw validationError("skillPatch.modifiers solo acepta valores booleanos.", { key });
    }
  }

  return {
    reason,
    category,
    modifiers,
  };
}

function applyValidatedSkillPatch({ gameState, skill, patch }) {
  const input = normalizeSkillPatchInput(patch);
  const preview = previewSkillProgression({
    skill: toPlain(skill),
    expDelta: patch.expDelta,
    reason: input.reason,
    category: input.category,
    modifiers: input.modifiers,
    currentEnergy: gameState.lucasStatus?.energy?.current ?? null,
  });

  if (!preview.validation.recommendedRange) {
    throw validationError("skillPatch.category no corresponde a un rango conocido para esta habilidad.", {
      skillId: patch.skillId,
      category: input.category,
      categoryId: preview.validation.categoryId,
    });
  }

  const { before, after, levelUps } = preview.progression;

  skill.phase = after.phase;
  skill.level = after.level;
  skill.exp = after.exp;
  skill.expToNext = after.expToNext;

  return {
    skillId: patch.skillId,
    name: skill.name,
    reason: input.reason,
    category: preview.validation.categoryId,
    recommendedRange: preview.validation.recommendedRange,
    baseExpDelta: preview.validation.baseExpDelta,
    effectiveExpDelta: preview.validation.effectiveExpDelta,
    expDelta: preview.validation.effectiveExpDelta,
    multiplier: preview.validation.multiplier,
    multiplierParts: preview.validation.multiplierParts,
    antiFarming: preview.validation.antiFarming,
    before,
    after,
    levelUps,
  };
}

async function applyInventoryPatch(inventory, patch, session = null) {
  const { op, itemId, quantity = 1, condition = "normal", equipped = false, notes = "" } = patch;

  if (!["add", "remove", "set_quantity"].includes(op)) {
    throw validationError(`Operación de inventario inválida: ${op}`);
  }

  if (!itemId) {
    throw validationError("inventoryPatch.itemId es obligatorio.");
  }

  if (op === "add" || op === "set_quantity") {
    const itemExists = await Item.exists({ itemId }).session(session);

    if (!itemExists) {
      throw validationError("No se puede agregar item inexistente al inventario.", {
        itemId,
      });
    }
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw validationError("inventoryPatch.quantity debe ser entero mayor o igual a 1.");
  }

  const index = inventory.findIndex((item) => item.itemId === itemId);
  const beforeItem = index >= 0 ? toPlain(inventory[index]) : null;

  if (op === "add") {
    if (index >= 0) {
      inventory[index].quantity += quantity;
    } else {
      inventory.push({
        itemId,
        quantity,
        condition,
        equipped,
        notes,
      });
    }
  }

  if (op === "remove") {
    if (index < 0) {
      throw validationError(`No se puede remover ${itemId}: no existe en inventario.`);
    }

    if (inventory[index].quantity < quantity) {
      throw validationError(`No se puede remover ${quantity} de ${itemId}: cantidad insuficiente.`);
    }

    inventory[index].quantity -= quantity;

    if (inventory[index].quantity === 0) {
      inventory.splice(index, 1);
    }
  }

  if (op === "set_quantity") {
    if (index < 0) {
      inventory.push({
        itemId,
        quantity,
        condition,
        equipped,
        notes,
      });
    } else {
      inventory[index].quantity = quantity;
      inventory[index].condition = condition || inventory[index].condition;
      inventory[index].equipped = equipped;
      inventory[index].notes = notes || inventory[index].notes;
    }
  }

  const afterIndex = inventory.findIndex((item) => item.itemId === itemId);
  const afterItem = afterIndex >= 0 ? toPlain(inventory[afterIndex]) : null;

  return {
    op,
    itemId,
    quantity,
    before: beforeItem,
    after: afterItem,
  };
}

async function applyNpcRelationshipPatches(gameState, patches, session = null) {
  const results = [];

  for (const patch of patches) {
    if (!patch.npcId) {
      throw validationError("npcRelationshipPatch.npcId es obligatorio.");
    }

    if (typeof patch.reason !== "string" || !patch.reason.trim()) {
      throw validationError("npcRelationshipPatch.reason es obligatorio.");
    }

    if (patch.overrideDailyCap && (typeof patch.overrideReason !== "string" || !patch.overrideReason.trim())) {
      throw validationError("npcRelationshipPatch.overrideReason es obligatorio si overrideDailyCap=true.");
    }

    const npc = await Npc.findOne({ npcId: patch.npcId }).session(session);

    if (!npc) {
      throw validationError(`No existe NPC persistente con id: ${patch.npcId}`);
    }

    const validationContext = await validateNpcRelationshipPatchContext({
      gameState,
      npc,
      patch,
      session,
    });

    const relationship = npc.relationshipWithLucas;
    const before = normalizeRelationship(toPlain(relationship));
    const requestedDeltas = {};

    for (const key of SOCIAL_RELATIONSHIP_FIELDS) {
      const deltaKey = `${key}Delta`;

      if (patch[deltaKey] !== undefined) {
        if (!Number.isInteger(patch[deltaKey])) {
          throw validationError(`${deltaKey} debe ser un número entero.`);
        }

        if (patch[deltaKey] < -3 || patch[deltaKey] > 3) {
          throw validationError(`${deltaKey} debe estar entre -3 y 3.`);
        }

        requestedDeltas[key] = patch[deltaKey];
      }
    }

    const normalizedRequestedDeltas = normalizeDeltas(requestedDeltas);
    const dailyUsage = await getDailySocialUsage({
      gameId: gameState.gameId,
      npcId: patch.npcId,
      day: gameState.currentDay,
      session,
    });
    const capped = applyDailySocialCaps({
      requestedDeltas: normalizedRequestedDeltas,
      currentUsage: dailyUsage,
      actionType: patch.actionType || "general",
      overrideDailyCap: Boolean(patch.overrideDailyCap),
      overrideReason: patch.overrideReason || "",
    });

    for (const key of SOCIAL_RELATIONSHIP_FIELDS) {
      const delta = capped.appliedDeltas[key] || 0;
      if (delta !== 0) {
        const range = SOCIAL_FIELD_RANGES[key] || { min: 0, max: 100 };
        relationship[key] = clamp((relationship[key] || 0) + delta, range.min, range.max);
      } else if (relationship[key] === undefined || relationship[key] === null) {
        relationship[key] = before[key] || 0;
      }
    }

    if (typeof patch.notes === "string" && patch.notes.trim()) {
      relationship.notes = patch.notes.trim();
    }

    await npc.save({ session });
    const after = normalizeRelationship(toPlain(npc.relationshipWithLucas));
    const fieldChanges = buildSocialFieldChanges({
      before,
      after,
      requestedDeltas: capped.requestedDeltas,
      appliedDeltas: capped.appliedDeltas,
    });
    const milestoneLines = buildSocialMilestoneLines(npc.name, fieldChanges);
    const milestoneSceneCues = buildSocialMilestoneSceneCues(npc.name, fieldChanges);
    const ledgerEntry = await createSocialLedgerEntry({
      gameId: gameState.gameId,
      characterId: gameState.characterId,
      npcId: npc.npcId,
      day: gameState.currentDay,
      time: gameState.time,
      actionType: normalizeActionType(patch.actionType || "general"),
      reason: patch.reason.trim(),
      requestedDeltas: capped.requestedDeltas,
      appliedDeltas: capped.appliedDeltas,
      before,
      after,
      caps: capped.caps,
      sourceEventId: patch.sourceEventId || "",
      sourceMissionId: patch.sourceMissionId || "",
      sourceEventLogId: patch.sourceEventLogId || "",
      tags: patch.tags || [],
      session,
    });

    results.push({
      npcId: npc.npcId,
      name: npc.name,
      before,
      after,
      requestedDeltas: capped.requestedDeltas,
      appliedDeltas: capped.appliedDeltas,
      fieldChanges,
      displayLines: fieldChanges.map((entry) => entry.display),
      milestoneLines,
      milestoneSceneCues,
      caps: capped.caps,
      ledgerId: ledgerEntry?.ledgerId || "",
      skippedByDailyCap: hasNonZeroDelta(capped.requestedDeltas) && !hasNonZeroDelta(capped.appliedDeltas),
      reason: patch.reason || "",
      validationContext,
    });
  }

  return results;
}

async function applyNpcMemoryPatches(gameState, patches, session = null) {
  const results = [];

  for (const patch of patches) {
    if (!patch.npcId) {
      throw validationError("npcMemoryPatch.npcId es obligatorio.");
    }

    if (!patch.fact) {
      throw validationError("npcMemoryPatch.fact es obligatorio.");
    }

    const npcExists = await Npc.exists({ npcId: patch.npcId }).session(session);

    if (!npcExists) {
      throw validationError(`No se puede guardar memoria: no existe NPC persistente ${patch.npcId}`);
    }

    const [memory] = await NpcMemory.create([{
      memoryId: patch.memoryId || createId("memory"),
      npcId: patch.npcId,
      fact: patch.fact,
      summary: patch.summary || "",
      sourceType: patch.sourceType || "told_by_lucas",
      sourceId: patch.sourceId || "",
      certainty: patch.certainty || "confirmed",
      emotionalWeight: patch.emotionalWeight || "low",
      privacyLevel: patch.privacyLevel || "private",
      canShare: Boolean(patch.canShare),
      shareConditions: patch.shareConditions || [],
      createdDay: patch.createdDay || gameState.currentDay,
      createdTime: patch.createdTime || gameState.time,
      lastReferencedDay: patch.lastReferencedDay || gameState.currentDay,
      importance: patch.importance || "normal",
      decayType: patch.decayType || "none",
      relatedNpcIds: patch.relatedNpcIds || [],
      relatedLocationIds: patch.relatedLocationIds || [],
      tags: patch.tags || [],
    }], { session });

    results.push(toPlain(memory));
  }

  return results;
}

async function applyRumorPatches(gameState, patches, session = null) {
  const results = [];

  for (const patch of patches) {
    if (!patch.content) {
      throw validationError("rumorPatch.content es obligatorio.");
    }

    const rumorId = patch.rumorId || createId("rumor");

    const rumorPayload = {
      rumorId,
      content: patch.content,
      originalContent: patch.originalContent || patch.content,
      origin: patch.origin || "",
      sourceType: patch.sourceType || "anonymous",
      certainty: patch.certainty || "rumor",
      distortionLevel: patch.distortionLevel ?? 0,
      knownByNpcIds: patch.knownByNpcIds || [],
      knownByFactionIds: patch.knownByFactionIds || [],
      locationIds: patch.locationIds || [gameState.locationId],
      relatedEventIds: patch.relatedEventIds || [],
      createdDay: patch.createdDay || gameState.currentDay,
      createdTime: patch.createdTime || gameState.time,
      expiresDay: patch.expiresDay || null,
      status: patch.status || "active",
      tags: patch.tags || [],
    };

    const rumor = await Rumor.findOneAndUpdate(
      { rumorId },
      { $set: rumorPayload },
      { upsert: true, new: true, runValidators: true, session }
    ).lean();

    results.push(rumor);
  }

  return results;
}

function inferWorldEventOutcome(status, patch = {}) {
  if (patch.socialOutcome && patch.socialOutcome !== "none") return patch.socialOutcome;
  if (status === "resolved") return "resolved";
  if (status === "consequences_applied") return "ignored";
  if (status === "expired") return "ignored";
  if (status === "cancelled") return "cancelled";
  return "none";
}

function buildWorldEventResolution({ existingEvent = null, eventPayload, patch = {}, gameState }) {
  if (!CLOSED_WORLD_EVENT_STATUSES.has(eventPayload.status)) return null;

  const outcome = inferWorldEventOutcome(eventPayload.status, patch);
  const summary =
    patch.resolutionSummary ||
    patch.consequenceSummary ||
    patch.reason ||
    existingEvent?.resolution?.summary ||
    "";
  const consequenceSummary =
    patch.consequenceSummary ||
    existingEvent?.resolution?.consequenceSummary ||
    "";
  const isMain =
    eventPayload.countsAsMainEvent ||
    eventPayload.eventLayer === "main_event" ||
    (eventPayload.tags || []).includes("daily_event");
  const nextMainEventEligibleDay = isMain ? Number(gameState.currentDay || 1) + 1 : null;
  const statusLabel = {
    resolved: "resuelto",
    expired: "vencido",
    consequences_applied: "con consecuencias aplicadas",
    cancelled: "cancelado",
  }[eventPayload.status] || eventPayload.status;
  const displayLines = [
    `Evento ${eventPayload.title}: ${statusLabel}.`,
  ];

  if (summary) displayLines.push(`Resultado: ${summary}`);
  if (consequenceSummary) displayLines.push(`Consecuencia: ${consequenceSummary}`);
  if (nextMainEventEligibleDay) {
    displayLines.push(`Proximo evento principal elegible: Dia ${nextMainEventEligibleDay} desde las 06:00.`);
  }

  return {
    status: eventPayload.status,
    outcome,
    day: gameState.currentDay,
    time: gameState.time,
    summary,
    consequenceSummary,
    nextMainEventEligibleDay,
    resolvedByCharacterId: patch.resolvedByCharacterId || gameState.characterId || "char_lucas",
    displayLines,
  };
}

async function applyWorldEventPatches(gameState, patches, session = null) {
  const results = {
    events: [],
    npcRelationships: [],
    socialConsequences: [],
  };

  for (const patch of patches) {
    let existingEvent = null;
    if (patch.eventId) {
      existingEvent = await WorldEvent.findOne({
        eventId: patch.eventId,
        gameId: patch.gameId || gameState.gameId || "isekai_lucas_main",
      })
        .session(session)
        .lean();
    }

    if (!patch.title && !existingEvent) {
      throw validationError("worldEventPatch.title es obligatorio al crear un evento nuevo.");
    }

    const eventId = patch.eventId || createId("event");
    const baseEffects = Array.isArray(existingEvent?.effects) ? existingEvent.effects : [];
    const patchEffects = Array.isArray(patch.effects) ? patch.effects : [];
    const eventEffects = existingEvent ? [...baseEffects, ...patchEffects] : patchEffects;
    const existingTags = existingEvent?.tags || [];
    const existingCountsAsMainEvent =
      existingEvent &&
      existingEvent.countsAsMainEvent !== false &&
      (!existingEvent.eventLayer || existingEvent.eventLayer === "main_event") &&
      existingTags.includes("daily_event");

    const eventPayload = {
      eventId,
      gameId: patch.gameId || existingEvent?.gameId || gameState.gameId || "isekai_lucas_main",
      title: patch.title || existingEvent.title,
      type: patch.type || existingEvent?.type || "general",
      scope: patch.scope || existingEvent?.scope || "local",
      status: patch.status || existingEvent?.status || "active",
      eventLayer: patch.eventLayer || existingEvent?.eventLayer || (existingCountsAsMainEvent ? "main_event" : "background"),
      countsAsMainEvent: patch.countsAsMainEvent ?? existingEvent?.countsAsMainEvent ?? Boolean(existingCountsAsMainEvent),
      blocksMainEventGeneration:
        patch.blocksMainEventGeneration ?? existingEvent?.blocksMainEventGeneration ?? Boolean(existingCountsAsMainEvent),
      startDay: patch.startDay || existingEvent?.startDay || gameState.currentDay,
      startTime: patch.startTime || existingEvent?.startTime || gameState.time,
      endDay: patch.endDay ?? existingEvent?.endDay ?? null,
      endTime: patch.endTime || existingEvent?.endTime || "",
      affectedLocationIds: patch.affectedLocationIds || existingEvent?.affectedLocationIds || [gameState.locationId],
      affectedNpcIds: patch.affectedNpcIds || existingEvent?.affectedNpcIds || [],
      affectedFactionIds: patch.affectedFactionIds || existingEvent?.affectedFactionIds || [],
      effects: eventEffects,
      visibility: patch.visibility || existingEvent?.visibility || "local",
      cause: patch.cause || existingEvent?.cause || "",
      severity: patch.severity || existingEvent?.severity || "minor",
      createdBy: patch.createdBy || existingEvent?.createdBy || "system",
      tags: unique([...(existingEvent?.tags || []), ...(patch.tags || [])]),
      resolution: existingEvent?.resolution || {},
    };

    const resolution = buildWorldEventResolution({
      existingEvent,
      eventPayload,
      patch,
      gameState,
    });

    if (resolution) {
      eventPayload.resolution = resolution;
      eventPayload.blocksMainEventGeneration = false;
      eventPayload.tags = unique([
        ...(eventPayload.tags || []),
        `event_${eventPayload.status}`,
        `event_outcome_${resolution.outcome}`,
      ]);
      eventPayload.effects = [
        ...(eventPayload.effects || []),
        {
          type: "event_resolution",
          target: "world_event",
          value: resolution,
          reason: "Cierre formal de evento de mundo.",
        },
      ];
    }

    const socialPlan = buildWorldEventSocialConsequencePlan({
      before: existingEvent,
      event: eventPayload,
      patch,
    });

    if (socialPlan.shouldApply) {
      eventPayload.tags = unique([...(eventPayload.tags || []), ...socialPlan.tags]);
      eventPayload.effects = [...(eventPayload.effects || []), ...socialPlan.effects];
    }

    const worldEvent = await WorldEvent.findOneAndUpdate(
      { eventId },
      { $set: eventPayload },
      { upsert: true, returnDocument: "after", runValidators: true, session }
    ).lean();

    if (resolution && eventPayload.countsAsMainEvent) {
      gameState.activeEventIds = (gameState.activeEventIds || []).filter((id) => id !== worldEvent.eventId);
    }

    results.events.push(worldEvent);

    if (socialPlan.shouldApply) {
      const npcRelationships = await applyNpcRelationshipPatches(
        gameState,
        socialPlan.npcRelationshipPatches,
        session
      );
      results.npcRelationships.push(...npcRelationships);
      results.socialConsequences.push({
        eventId: worldEvent.eventId,
        title: worldEvent.title,
        outcome: socialPlan.outcome,
        affectedNpcIds: worldEvent.affectedNpcIds || [],
        relationshipChangeCount: npcRelationships.length,
      });
    }
  }

  return results;
}

async function applyExpiredWorldEventSocialConsequences(gameState, events = [], session = null) {
  const results = {
    events: [],
    npcRelationships: [],
    socialConsequences: [],
  };

  for (const event of events || []) {
    const socialPlan = buildWorldEventSocialConsequencePlan({
      event,
      forcedOutcome: "ignored",
    });

    if (!socialPlan.shouldApply) continue;

    const updated = await WorldEvent.findOneAndUpdate(
      { eventId: event.eventId },
      {
        $addToSet: {
          tags: {
            $each: socialPlan.tags,
          },
        },
        $push: {
          effects: {
            $each: socialPlan.effects,
          },
        },
      },
      { returnDocument: "after", runValidators: true, session }
    ).lean();

    const npcRelationships = await applyNpcRelationshipPatches(
      gameState,
      socialPlan.npcRelationshipPatches,
      session
    );

    results.events.push(updated);
    results.npcRelationships.push(...npcRelationships);
    results.socialConsequences.push({
      eventId: updated.eventId,
      title: updated.title,
      outcome: socialPlan.outcome,
      affectedNpcIds: updated.affectedNpcIds || [],
      relationshipChangeCount: npcRelationships.length,
    });
  }

  return results;
}

async function applyLocationPatches(patches, session = null) {
  const results = [];

  for (const patch of patches) {
    if (!patch.locationId) {
      throw validationError("locationPatch.locationId es obligatorio.");
    }

    const location = await Location.findOne({ locationId: patch.locationId }).session(session);

    if (!location) {
      throw validationError(`No existe ubicación con id: ${patch.locationId}`);
    }

    const before = toPlain(location);

    if (patch.currentStatus !== undefined) {
      location.currentStatus = patch.currentStatus;
    }

    if (patch.dangerLevel !== undefined) {
      location.dangerLevel = patch.dangerLevel;
    }

    if (patch.services !== undefined) {
      location.services = {
        ...(toPlain(location.services) || {}),
        ...patch.services,
      };
    }

    if (Array.isArray(patch.setVisibleNpcIds)) {
      location.visibleNpcIds = patch.setVisibleNpcIds;
    }

    if (Array.isArray(patch.setProbableNpcIds)) {
      location.probableNpcIds = patch.setProbableNpcIds;
    }

    if (Array.isArray(patch.addActiveEffects)) {
      for (const effect of patch.addActiveEffects) {
        location.activeEffects.push(effect);
      }
    }

    if (Array.isArray(patch.tags)) {
      location.tags = Array.from(new Set([...(location.tags || []), ...patch.tags]));
    }

    await location.save({ session });

    results.push({
      locationId: location.locationId,
      name: location.name,
      before: {
        currentStatus: before.currentStatus,
        dangerLevel: before.dangerLevel,
        services: before.services,
      },
      after: {
        currentStatus: location.currentStatus,
        dangerLevel: location.dangerLevel,
        services: toPlain(location.services),
      },
      reason: patch.reason || "",
    });
  }

  return results;
}

async function applyShopStockPatches(patches, session = null) {
  const results = [];

  for (const patch of patches) {
    if (!patch.shopId) {
      throw validationError("shopStockPatch.shopId es obligatorio.");
    }

    if (!patch.itemId) {
      throw validationError("shopStockPatch.itemId es obligatorio.");
    }

    if (!Number.isInteger(patch.deltaQuantity) || patch.deltaQuantity === 0) {
      throw validationError("shopStockPatch.deltaQuantity debe ser un entero distinto de cero.");
    }

    const stock = await ShopStock.findOne({
      shopId: patch.shopId,
      itemId: patch.itemId,
    }).session(session);

    if (!stock) {
      throw validationError("No existe stock para ese shopId/itemId.", {
        shopId: patch.shopId,
        itemId: patch.itemId,
      });
    }

    const before = toPlain(stock);
    const afterQuantity = stock.quantity + patch.deltaQuantity;

    if (afterQuantity < 0) {
      throw validationError("Stock insuficiente.", {
        shopId: patch.shopId,
        itemId: patch.itemId,
        currentQuantity: stock.quantity,
        attemptedDelta: patch.deltaQuantity,
      });
    }

    stock.quantity = afterQuantity;

    if (patch.currentPriceCopper !== undefined) {
      if (!Number.isInteger(patch.currentPriceCopper) || patch.currentPriceCopper < 0) {
        throw validationError("shopStockPatch.currentPriceCopper debe ser entero >= 0.");
      }

      stock.currentPriceCopper = patch.currentPriceCopper;
    }

    if (Array.isArray(patch.addScarcityFlags)) {
      stock.scarcityFlags = Array.from(
        new Set([...(stock.scarcityFlags || []), ...patch.addScarcityFlags])
      );
    }

    if (Array.isArray(patch.removeScarcityFlags)) {
      stock.scarcityFlags = (stock.scarcityFlags || []).filter(
        (flag) => !patch.removeScarcityFlags.includes(flag)
      );
    }

    await stock.save({ session });

    results.push({
      shopId: stock.shopId,
      itemId: stock.itemId,
      before: {
        quantity: before.quantity,
        currentPriceCopper: before.currentPriceCopper,
        scarcityFlags: before.scarcityFlags,
      },
      deltaQuantity: patch.deltaQuantity,
      after: {
        quantity: stock.quantity,
        currentPriceCopper: stock.currentPriceCopper,
        scarcityFlags: stock.scarcityFlags,
      },
      reason: patch.reason || "",
    });
  }

  return results;
}

function isMissionExpired(mission, gameState) {
  if (!mission.expiresDay) return false;

  if (mission.expiresDay < gameState.currentDay) return true;
  if (mission.expiresDay > gameState.currentDay) return false;
  if (!mission.expiresTime) return false;

  return timeToMinutes(mission.expiresTime) <= timeToMinutes(gameState.time);
}

const GUILD_RANKS_REQUIRING_FORMAL_REGISTRATION = new Set([
  "Cobre",
  "Bronce",
  "Hierro",
  "Plata",
  "Oro",
  "Platino",
  "Mithril",
  "Oricalco",
  "Adamantita",
]);

function validateGuildRegistrationForMissionAccept({ gameState, mission, patch }) {
  if (!gameState.flags?.formalGuildRegistrationPending) return null;

  const flags = getMissionFlags(mission);
  const requiresFormalRegistration =
    flags.requiresFormalRegistration === true ||
    GUILD_RANKS_REQUIRING_FORMAL_REGISTRATION.has(mission.rank);

  if (!requiresFormalRegistration) return null;

  const overrideReason = String(patch.overrideReason || patch.registrationOverrideReason || "").trim();
  if (patch.registrationOverride === true && overrideReason.length >= 8) {
    return {
      allowedWithOverride: true,
      overrideReason,
    };
  }

  throw validationError("La misión requiere registro formal del gremio antes de aceptarla.", {
    missionId: mission.missionId,
    rank: mission.rank,
    formalGuildRegistrationPending: true,
    allowedOverride: "registrationOverride=true con overrideReason explícito de 8+ caracteres.",
  });
}

function normalizeMissionPatches(missionPatch) {
  if (!missionPatch) return [];
  return Array.isArray(missionPatch) ? missionPatch : [missionPatch];
}

function removeActiveMissionId(gameState, missionId) {
  gameState.activeMissionIds = (gameState.activeMissionIds || []).filter((id) => id !== missionId);
}

function getMissionFlags(mission) {
  return mission.flags && typeof mission.flags === "object" && !Array.isArray(mission.flags)
    ? toPlain(mission.flags)
    : {};
}

function missionRewardAlreadyPaid(flags) {
  return Boolean(
    flags.rewardPaid ||
      flags.rewardAlreadyPaid ||
      flags.canonRepair?.rewardAlreadyPaid
  );
}

function setMissionFlags(mission, flags) {
  mission.flags = flags;
  if (typeof mission.markModified === "function") {
    mission.markModified("flags");
  }
}

function updateGuildMg(gameState, mgDelta) {
  if (!Number.isInteger(mgDelta) || mgDelta <= 0) return null;

  const flags = gameState.flags && typeof gameState.flags === "object" ? toPlain(gameState.flags) : {};
  const guild = flags.guild && typeof flags.guild === "object" ? { ...flags.guild } : {};
  const before = Number.isInteger(guild.mg) ? guild.mg : 0;
  guild.mg = before + mgDelta;
  flags.guild = guild;
  gameState.flags = flags;

  if (typeof gameState.markModified === "function") {
    gameState.markModified("flags");
  }

  return {
    before,
    delta: mgDelta,
    after: guild.mg,
  };
}

async function applyMissionReward({ gameState, mission, session = null }) {
  const flags = getMissionFlags(mission);

  if (missionRewardAlreadyPaid(flags)) {
    return {
      alreadyPaid: true,
      reason: "mission_reward_already_paid",
    };
  }

  const reward = mission.reward || {};
  const moneyCopper = reward.moneyCopper || 0;

  if (!Number.isInteger(moneyCopper) || moneyCopper < 0) {
    throw validationError("mission.reward.moneyCopper debe ser un entero mayor o igual a 0.", {
      missionId: mission.missionId,
      moneyCopper,
    });
  }

  const beforeMoney = gameState.moneyCopper;
  gameState.moneyCopper += moneyCopper;

  const itemChanges = [];
  for (const itemId of reward.items || []) {
    itemChanges.push(
      await applyInventoryPatch(
        gameState.inventory,
        {
          op: "add",
          itemId,
          quantity: 1,
          notes: `Recompensa de mision ${mission.missionId}.`,
        },
        session
      )
    );
  }

  const mgReward = mission.mgReward || 0;
  if (!Number.isInteger(mgReward) || mgReward < 0) {
    throw validationError("mission.mgReward debe ser un entero mayor o igual a 0.", {
      missionId: mission.missionId,
      mgReward,
    });
  }

  const mg = updateGuildMg(gameState, mgReward);

  flags.rewardPaid = true;
  flags.rewardPaidDay = gameState.currentDay;
  flags.rewardPaidTime = gameState.time;
  flags.rewardPaidSource = "applyTurn.missionPatch.complete";
  setMissionFlags(mission, flags);

  return {
    alreadyPaid: false,
    money: {
      before: beforeMoney,
      delta: moneyCopper,
      after: gameState.moneyCopper,
    },
    items: itemChanges,
    mg,
    other: reward.other || "",
  };
}

function formatCopper(moneyCopper = 0) {
  const total = Math.max(0, Number(moneyCopper) || 0);
  const gold = Math.floor(total / 10000);
  const silver = Math.floor((total % 10000) / 100);
  const copper = total % 100;
  return `${gold} oro, ${silver} plata, ${copper} cobre`;
}

function buildMissionOutcome({ op, mission, before, reward = null, patch = {} } = {}) {
  const statusChanged = before.status !== mission.status;
  const proofChanged = before.proofStatus !== mission.proofStatus;
  const displayLines = [];
  const nextSteps = [];
  const rewardLines = [];
  const consequenceLines = [];

  if (statusChanged) {
    displayLines.push(`Mision ${mission.title}: ${before.status}->${mission.status}.`);
  }

  if (proofChanged) {
    displayLines.push(`Prueba de mision: ${before.proofStatus}->${mission.proofStatus}.`);
  }

  if (op === "accept") {
    nextSteps.push(mission.proofRequired ? "Conseguir prueba y reportar al cliente/gremio." : "Completar el objetivo y reportar.");
  } else if (op === "report") {
    nextSteps.push("Esperar verificacion formal antes de cobrar recompensa.");
  } else if (op === "verify" && mission.proofStatus === "verified") {
    nextSteps.push("La prueba esta verificada; la mision ya puede completarse y pagarse.");
  } else if (op === "verify" && mission.proofStatus === "rejected") {
    consequenceLines.push("La prueba fue rechazada; no se puede completar hasta corregir el problema.");
  } else if (op === "complete") {
    nextSteps.push("Mision cerrada; no pagar de nuevo si se reintenta.");
  } else if (op === "fail") {
    consequenceLines.push(patch.failureReason || patch.reason || "La mision fallo y sale de misiones activas.");
  } else if (op === "expire") {
    consequenceLines.push(patch.overrideReason || "La mision expiro y sale de opciones vigentes.");
  }

  if (reward?.money && !reward.alreadyPaid) {
    rewardLines.push(`Recompensa pagada: ${formatCopper(reward.money.delta)}.`);
  }
  if (reward?.mg && !reward.alreadyPaid) {
    rewardLines.push(`MG: ${reward.mg.before}->${reward.mg.after} (+${reward.mg.delta}).`);
  }
  if (reward?.alreadyPaid) {
    rewardLines.push("Recompensa no duplicada: ya estaba pagada o la mision ya estaba cerrada.");
  }

  return {
    op,
    statusChanged,
    proofChanged,
    outcome:
      mission.status === "completed"
        ? "completed"
        : mission.status === "failed"
          ? "failed"
          : mission.status === "expired"
            ? "expired"
            : mission.proofStatus === "verified"
              ? "ready_to_complete"
              : mission.proofStatus === "submitted"
                ? "awaiting_verification"
                : mission.status,
    displayLines,
    rewardLines,
    consequenceLines,
    nextSteps,
  };
}

async function applyMissionPatches(gameState, missionPatch, session = null) {
  const patches = normalizeMissionPatches(missionPatch);
  const results = [];

  for (const patch of patches) {
    const op = patch.op || patch.operation;
    const missionId = patch.missionId;
    const characterId = patch.characterId || "char_lucas";

    if (!["accept", "report", "verify", "complete", "fail", "expire"].includes(op)) {
      throw validationError("missionPatch.op debe ser accept, report, verify, complete, fail o expire.", { op });
    }

    if (!missionId) {
      throw validationError("missionPatch.missionId es obligatorio.");
    }

    const mission = await Mission.findOne({ missionId }).session(session);

    if (!mission) {
      throw validationError(`No existe misión con id: ${missionId}`);
    }

    const before = {
      status: mission.status,
      acceptedByCharacterId: mission.acceptedByCharacterId,
      acceptedDay: mission.acceptedDay,
      proofStatus: mission.proofStatus,
      completedDay: mission.completedDay,
      flags: getMissionFlags(mission),
      activeMissionIds: [...(gameState.activeMissionIds || [])],
      moneyCopper: gameState.moneyCopper,
    };

    let reward = null;

    if (op === "accept") {
      if (mission.status !== "available") {
        throw validationError(`La misión no está disponible. Estado actual: ${mission.status}`, {
          missionId,
          status: mission.status,
        });
      }

      if (isMissionExpired(mission, gameState)) {
        throw validationError("La misión ya expiró por tiempo de partida.", {
          missionId,
          expiresDay: mission.expiresDay,
          expiresTime: mission.expiresTime,
        });
      }

      const guildRegistrationValidation = validateGuildRegistrationForMissionAccept({
        gameState,
        mission,
        patch,
      });

      mission.status = "accepted";
      mission.acceptedByCharacterId = characterId;
      mission.acceptedDay = gameState.currentDay;

      if (!gameState.activeMissionIds.includes(mission.missionId)) {
        gameState.activeMissionIds.push(mission.missionId);
      }

      if (guildRegistrationValidation?.allowedWithOverride) {
        const flags = getMissionFlags(mission);
        flags.acceptedWithRegistrationOverride = {
          day: gameState.currentDay,
          time: gameState.time,
          reason: guildRegistrationValidation.overrideReason,
        };
        setMissionFlags(mission, flags);
      }
    }

    if (op === "report") {
      if (mission.status !== "accepted") {
        throw validationError(`Solo se puede reportar una misión aceptada. Estado actual: ${mission.status}`, {
          missionId,
          status: mission.status,
        });
      }

      if (mission.acceptedByCharacterId && mission.acceptedByCharacterId !== characterId) {
        throw validationError("La misión fue aceptada por otro personaje.", {
          missionId,
          acceptedByCharacterId: mission.acceptedByCharacterId,
          characterId,
        });
      }

      mission.proofStatus = patch.proofStatus || "submitted";
    }

    if (op === "verify") {
      const nextProofStatus = patch.proofStatus || "verified";

      if (!["verified", "rejected"].includes(nextProofStatus)) {
        throw validationError("missionPatch.proofStatus para verify debe ser verified o rejected.", {
          missionId,
          proofStatus: nextProofStatus,
        });
      }

      if (mission.status !== "accepted") {
        throw validationError(`Solo se puede verificar una misión aceptada. Estado actual: ${mission.status}`, {
          missionId,
          status: mission.status,
        });
      }

      if (mission.proofRequired && mission.proofStatus !== "submitted" && mission.proofStatus !== "verified") {
        throw validationError("La misión requiere reporte/prueba submitted antes de verificar.", {
          missionId,
          proofStatus: mission.proofStatus,
        });
      }

      mission.proofStatus = nextProofStatus;
      const flags = getMissionFlags(mission);
      flags.lastVerification = {
        day: gameState.currentDay,
        time: gameState.time,
        status: nextProofStatus,
        summary: patch.verificationSummary || patch.reportSummary || "",
      };
      setMissionFlags(mission, flags);
    }

    if (op === "complete") {
      if (mission.status === "completed") {
        removeActiveMissionId(gameState, mission.missionId);
        reward = {
          alreadyPaid: true,
          reason: "mission_already_completed",
        };
      } else {
        if (mission.status !== "accepted") {
          throw validationError(`Solo se puede completar una misión aceptada. Estado actual: ${mission.status}`, {
            missionId,
            status: mission.status,
          });
        }

        if (mission.acceptedByCharacterId && mission.acceptedByCharacterId !== characterId) {
          throw validationError("La misión fue aceptada por otro personaje.", {
            missionId,
            acceptedByCharacterId: mission.acceptedByCharacterId,
            characterId,
          });
        }

        if (mission.proofStatus === "rejected") {
          throw validationError("No se puede completar una misión con prueba rechazada.", {
            missionId,
          });
        }

        const requiresVerifiedProof = Boolean(mission.proofRequired && mission.proofStatus !== "not_required");
        if (requiresVerifiedProof && mission.proofStatus !== "verified") {
          throw validationError("La misión requiere proofStatus verified antes de completar y pagar.", {
            missionId,
            proofStatus: mission.proofStatus,
          });
        }

        mission.status = "completed";
        mission.completedDay = gameState.currentDay;
        removeActiveMissionId(gameState, mission.missionId);

        const flags = getMissionFlags(mission);
        flags.completedTime = gameState.time;
        flags.completionSummary = patch.completionSummary || patch.reportSummary || "";
        flags.resolution = {
          status: "completed",
          day: gameState.currentDay,
          time: gameState.time,
          summary: flags.completionSummary,
          rewardSource: "missionPatch.complete",
        };
        setMissionFlags(mission, flags);

        reward = await applyMissionReward({ gameState, mission, session });
      }
    }

    if (op === "fail") {
      if (mission.status === "completed") {
        throw validationError("No se puede fallar una misión ya completada.", { missionId });
      }

      if (mission.status !== "failed") {
        mission.status = "failed";
        removeActiveMissionId(gameState, mission.missionId);
        const flags = getMissionFlags(mission);
        flags.failedDay = gameState.currentDay;
        flags.failedTime = gameState.time;
        flags.failureReason = patch.failureReason || patch.reason || "";
        flags.resolution = {
          status: "failed",
          day: gameState.currentDay,
          time: gameState.time,
          summary: flags.failureReason,
        };
        setMissionFlags(mission, flags);
      }
    }

    if (op === "expire") {
      if (mission.status === "completed") {
        throw validationError("No se puede expirar una misión ya completada.", { missionId });
      }

      if (mission.status !== "expired") {
        const hasValidatedOverride = String(patch.overrideReason || "").trim().length >= 8;
        if (!isMissionExpired(mission, gameState) && !hasValidatedOverride) {
          throw validationError("La misión todavía no expiró; usar overrideReason para expiración manual.", {
            missionId,
            currentDay: gameState.currentDay,
            currentTime: gameState.time,
            expiresDay: mission.expiresDay,
            expiresTime: mission.expiresTime,
          });
        }

        mission.status = "expired";
        removeActiveMissionId(gameState, mission.missionId);
        const flags = getMissionFlags(mission);
        flags.expiredAtDay = gameState.currentDay;
        flags.expiredAtTime = gameState.time;
        flags.expireReason = patch.overrideReason || "expired_by_time";
        flags.resolution = {
          status: "expired",
          day: gameState.currentDay,
          time: gameState.time,
          summary: flags.expireReason,
        };
        setMissionFlags(mission, flags);
      }
    }

    await mission.save({ session });
    const outcome = buildMissionOutcome({ op, mission, before, reward, patch });

    results.push({
      op,
      missionId: mission.missionId,
      title: mission.title,
      reportSummary: patch.reportSummary || "",
      before,
      after: {
        status: mission.status,
        acceptedByCharacterId: mission.acceptedByCharacterId,
        acceptedDay: mission.acceptedDay,
        proofStatus: mission.proofStatus,
        completedDay: mission.completedDay,
        flags: getMissionFlags(mission),
        activeMissionIds: [...(gameState.activeMissionIds || [])],
        moneyCopper: gameState.moneyCopper,
      },
      reward,
      outcome,
    });
  }

  return results;
}

function validateEventLogInputs(eventLogs) {
  if (!Array.isArray(eventLogs)) return;

  for (const log of eventLogs) {
    const source = log.source || "player_action";
    const visibility = log.visibility || "private";

    if (!VALID_EVENT_LOG_SOURCES.has(source)) {
      throw validationError("eventLogs.source invalido.", {
        source,
        allowedSources: Array.from(VALID_EVENT_LOG_SOURCES),
      });
    }

    if (!VALID_EVENT_LOG_VISIBILITIES.has(visibility)) {
      throw validationError("eventLogs.visibility invalida.", {
        visibility,
        allowedVisibilities: Array.from(VALID_EVENT_LOG_VISIBILITIES),
      });
    }
  }
}

async function validateEventLogsForInsert(logsToCreate, session = null) {
  const issues = [];
  const logIds = new Set();

  for (const log of logsToCreate) {
    if (logIds.has(log.logId)) {
      issues.push({
        logId: log.logId,
        message: "logId duplicado dentro del request.",
      });
      continue;
    }

    logIds.add(log.logId);

    const validation = new EventLog(log).validateSync();
    if (validation) {
      issues.push({
        logId: log.logId,
        message: validation.message,
      });
    }
  }

  if (issues.length > 0) {
    throw validationError("eventLogs no pasan validacion.", { issues });
  }

  if (logIds.size > 0) {
    const existing = await EventLog.find({ logId: { $in: Array.from(logIds) } })
      .select("logId")
      .session(session)
      .lean();

    if (existing.length > 0) {
      throw validationError("eventLogs.logId ya existe.", {
        existingLogIds: existing.map((log) => log.logId),
      });
    }
  }
}

function validateHourBoundaryCost({ timeAdvance, currentTime, body }) {
  if (!timeAdvance) return;

  const from = timeAdvance.from || currentTime;
  const to = timeAdvance.to;
  const fromDay = timeAdvance.fromDay || 1;
  const toDay = timeAdvance.toDay || fromDay;

  if (!isValidTime(from) || !isValidTime(to)) return;

  const minutes = diffAdvanceMinutes({ fromDay, from, toDay, to });

  if (minutes <= 0) return;

  const hasActivityCost = Boolean(body.activityCost);
  const hasExemption = String(body.biologicalCostExemptReason || "").trim().length >= 8;

  if (!hasActivityCost && !hasExemption) {
    if (getClosedHourBlocks({ fromDay, from, toDay, to }).length > 0) {
      throw validationError(
        "timeAdvance reaches hour boundary but no biological cost or exemption was provided.",
        { from, to, minutes }
      );
    }

    throw validationError(
      "timeAdvance advances time but no biological cost or exemption was provided.",
      { from, to, minutes }
    );
  }
}

function validateActivityCostMinutes({ timeAdvance, currentTime, body }) {
  if (!timeAdvance || !body.activityCost) return;

  const from = timeAdvance.from || currentTime;
  const to = timeAdvance.to;
  const fromDay = timeAdvance.fromDay || 1;
  const toDay = timeAdvance.toDay || fromDay;

  if (!isValidTime(from) || !isValidTime(to)) return;

  const expectedMinutes = diffAdvanceMinutes({ fromDay, from, toDay, to });
  if (expectedMinutes <= 0) return;

  const actualMinutes = body.activityCost.minutes;
  const hasExemption = Boolean(String(body.biologicalCostExemptReason || "").trim());
  const hasValidatedOverride =
    body.activityCost.allowMinutesMismatch === true &&
    String(body.activityCost.overrideReason || "").trim().length >= 8;

  if (actualMinutes !== expectedMinutes && !hasExemption && !hasValidatedOverride) {
    throw validationError("activityCost.minutes debe coincidir con la diferencia real de timeAdvance.", {
      from,
      to,
      expectedMinutes,
      receivedMinutes: actualMinutes,
    });
  }
}

function applyActivityCost(gameState, activityCost) {
  if (!activityCost) return null;

  const cost = calculateActivityCost({
    category: activityCost.category,
    minutes: activityCost.minutes,
    currentEnergy: gameState.lucasStatus.energy.current,
    currentSatiety: gameState.lucasStatus.satiety.current,
  });

  return {
    category: cost.categoryId,
    label: cost.label,
    minutes: cost.minutes,
    reason: activityCost.reason || "",
    satiety: applyStatDelta(gameState.lucasStatus.satiety, cost.delta.satiety, "satiety"),
    energy: applyStatDelta(gameState.lucasStatus.energy, cost.delta.energy, "energy"),
    perHour: cost.perHour,
    fatigueMultiplier: cost.fatigueMultiplier,
  };
}

function ensureBiologicalClock(gameState) {
  if (!gameState.biologicalClock) {
    gameState.biologicalClock = {};
  }

  if (!Array.isArray(gameState.biologicalClock.pendingAccumulations)) {
    gameState.biologicalClock.pendingAccumulations = [];
  }

  if (!Array.isArray(gameState.biologicalClock.pendingAccumulation)) {
    gameState.biologicalClock.pendingAccumulation = [];
  }

  if (!gameState.biologicalClock.lastProcessedTime) {
    gameState.biologicalClock.lastProcessedTime = gameState.time;
  }

  gameState.biologicalClock.currentHourBlock = getHourBlockForTime(gameState.time);

  return gameState.biologicalClock;
}

function splitActivitySegments({ fromDay = 1, from, toDay = fromDay, to, activityCost }) {
  if (!activityCost) return [];

  const fromMinutes = toAbsoluteMinutes(fromDay, from);
  const toMinutes = toAbsoluteMinutes(toDay, to);
  const segments = [];
  let cursor = fromMinutes;

  while (cursor < toMinutes) {
    const blockStartMinutes = Math.floor(cursor / 60) * 60;
    const blockEndMinutes = blockStartMinutes + 60;
    const segmentEnd = Math.min(toMinutes, blockEndMinutes);
    const blockStart = minutesToTime(blockStartMinutes);
    const blockEnd = minutesToTime(blockEndMinutes);
    const blockDay = dayFromAbsoluteMinutes(blockStartMinutes);

    segments.push({
      day: blockDay,
      category: normalizeCategory(activityCost.category),
      minutes: segmentEnd - cursor,
      reason: activityCost.reason || "",
      start: minutesToTime(cursor),
      end: minutesToTime(segmentEnd),
      blockStart,
      blockEnd,
      closesBlock: segmentEnd === blockEndMinutes,
    });

    cursor = segmentEnd;
  }

  return segments;
}

function getClosedHourBlocks({ fromDay = 1, from, toDay = fromDay, to }) {
  const fromMinutes = toAbsoluteMinutes(fromDay, from);
  const toMinutes = toAbsoluteMinutes(toDay, to);
  const blocks = [];

  for (
    let boundary = Math.floor(fromMinutes / 60) * 60 + 60;
    boundary <= toMinutes;
    boundary += 60
  ) {
    if (boundary <= fromMinutes) continue;
    const blockStart = minutesToTime(boundary - 60);
    const blockEnd = minutesToTime(boundary);
    blocks.push({
      day: dayFromAbsoluteMinutes(boundary - 60),
      blockStart,
      blockEnd,
    });
  }

  return blocks;
}

function isUnprocessedAccumulation(entry) {
  return entry && entry.status !== "processed" && !entry.processedAt;
}

function getPendingAccumulationsForBlock(gameState, { day, blockStart, blockEnd }) {
  const clock = ensureBiologicalClock(gameState);

  return clock.pendingAccumulations.filter(
    (entry) =>
      isUnprocessedAccumulation(entry) &&
      entry.day === (day || gameState.currentDay) &&
      entry.blockStart === blockStart &&
      entry.blockEnd === blockEnd
  );
}

function createPendingAccumulation(gameState, segment, body) {
  return {
    accumulationId: createId("bioacc"),
    gameId: gameState.gameId,
    characterId: gameState.characterId || "char_lucas",
    day: segment.day || gameState.currentDay,
    blockStart: segment.blockStart,
    blockEnd: segment.blockEnd,
    category: segment.category,
    minutes: segment.minutes,
    reason: segment.reason,
    sourceActionSummary: body.actionSummary || "",
    sourceEventLogId: body.activityCost?.sourceEventLogId || "",
    status: "pending",
    createdAt: new Date(),
    processedAt: null,
    processedDay: null,
    processedTime: "",
  };
}

function groupBiologicalActivities(activities) {
  const grouped = new Map();

  for (const activity of activities) {
    if (!activity || activity.minutes <= 0) continue;
    const category = normalizeCategory(activity.category);
    const existing = grouped.get(category) || {
      category,
      minutes: 0,
      reasons: [],
      sourceAccumulationIds: [],
      sourceEventLogIds: [],
    };

    existing.minutes += activity.minutes;
    if (activity.reason) existing.reasons.push(activity.reason);
    if (activity.accumulationId) existing.sourceAccumulationIds.push(activity.accumulationId);
    if (activity.sourceEventLogId) existing.sourceEventLogIds.push(activity.sourceEventLogId);
    grouped.set(category, existing);
  }

  return Array.from(grouped.values());
}

function processBiologicalBlock(gameState, block, activities) {
  const groupedActivities = groupBiologicalActivities(activities);

  if (groupedActivities.length === 0) {
    return null;
  }

  const before = {
    satiety: gameState.lucasStatus.satiety.current,
    energy: gameState.lucasStatus.energy.current,
  };

  const details = [];

  for (const activity of groupedActivities) {
    const cost = calculateActivityCost({
      category: activity.category,
      minutes: activity.minutes,
      currentEnergy: gameState.lucasStatus.energy.current,
      currentSatiety: gameState.lucasStatus.satiety.current,
    });

    details.push({
      category: cost.categoryId,
      label: cost.label,
      minutes: cost.minutes,
      reasons: activity.reasons,
      sourceAccumulationIds: activity.sourceAccumulationIds,
      sourceEventLogIds: activity.sourceEventLogIds,
      delta: cost.delta,
      perHour: cost.perHour,
      fatigueMultiplier: cost.fatigueMultiplier,
    });

    applyStatDelta(gameState.lucasStatus.satiety, cost.delta.satiety, "satiety");
    applyStatDelta(gameState.lucasStatus.energy, cost.delta.energy, "energy");
  }

  const after = {
    satiety: gameState.lucasStatus.satiety.current,
    energy: gameState.lucasStatus.energy.current,
  };

  for (const activity of activities) {
    if (activity.accumulationRef) {
      activity.accumulationRef.status = "processed";
      activity.accumulationRef.processedAt = new Date();
      activity.accumulationRef.processedDay = block.day || gameState.currentDay;
      activity.accumulationRef.processedTime = block.blockEnd;
    }
  }

  gameState.biologicalClock.lastProcessedTime = block.blockEnd;

  return {
    blockStart: block.blockStart,
    blockEnd: block.blockEnd,
    activities: details,
    satiety: {
      before: before.satiety,
      delta: after.satiety - before.satiety,
      after: after.satiety,
      labelAfter: gameState.lucasStatus.satiety.label || "",
    },
    energy: {
      before: before.energy,
      delta: after.energy - before.energy,
      after: after.energy,
      labelAfter: gameState.lucasStatus.energy.label || "",
    },
  };
}

function applyBiologicalClockForTurn(gameState, body, turnTimeAdvance) {
  const clock = ensureBiologicalClock(gameState);

  if (!body.activityCost && !turnTimeAdvance) {
    return null;
  }

  if (!turnTimeAdvance && body.activityCost) {
    throw validationError("activityCost requiere timeAdvance para guardar acumuladores biologicos formales.");
  }

  const fromDay = turnTimeAdvance.fromDay || gameState.currentDay;
  const from = turnTimeAdvance.from;
  const toDay = turnTimeAdvance.toDay || fromDay;
  const to = turnTimeAdvance.to;
  const segments = splitActivitySegments({ fromDay, from, toDay, to, activityCost: body.activityCost });
  const closedBlocks = getClosedHourBlocks({ fromDay, from, toDay, to });
  const pendingCreated = [];
  const processedBlocks = [];

  for (const block of closedBlocks) {
    const pending = getPendingAccumulationsForBlock(gameState, block);
    const currentSegments = segments.filter(
      (segment) =>
        segment.day === block.day &&
        segment.blockStart === block.blockStart &&
        segment.blockEnd === block.blockEnd &&
        segment.closesBlock
    );

    const activities = [
      ...pending.map((entry) => ({
        accumulationRef: entry,
        accumulationId: entry.accumulationId,
        sourceEventLogId: entry.sourceEventLogId,
        category: entry.category,
        minutes: entry.minutes,
        reason: entry.reason,
      })),
      ...currentSegments,
    ];

    const processed = processBiologicalBlock(gameState, block, activities);
    if (processed) processedBlocks.push(processed);
  }

  for (const segment of segments) {
    if (segment.closesBlock) continue;
    const pending = createPendingAccumulation(gameState, segment, body);
    clock.pendingAccumulations.push(pending);
    pendingCreated.push(pending);
  }

  clock.currentHourBlock = getHourBlockForTime(gameState.time);

  return {
    mode: processedBlocks.length > 0 ? "processed_hour_boundary" : "pending_accumulation",
    pendingCreated,
    processedBlocks,
    pendingCount: clock.pendingAccumulations.filter(isUnprocessedAccumulation).length,
  };
}

async function applyTurn(req, res) {
  let session = null;

  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        ok: false,
        error: "MongoDB no está conectado. Configurá MONGODB_URI.",
      });
    }

    const body = req.body || {};
    validateEventLogInputs(body.eventLogs);

    let responsePayload = null;
    session = await mongoose.startSession();

    await session.withTransaction(async () => {
      const gameId = body.gameId || "isekai_lucas_main";
      const gameState = await GameState.findOne({ gameId }).session(session);

      if (!gameState) {
        const error = new Error(`No existe GameState para gameId: ${gameId}`);
        error.statusCode = 404;
        throw error;
      }

      const changes = {};

      if (body.timeAdvance) {
        const { from, to } = body.timeAdvance;
        const effectiveFrom = from || gameState.time;
        const dayBefore = gameState.currentDay;
        const fromDay = body.timeAdvance.fromDay ?? dayBefore;
        const toDay = body.timeAdvance.toDay ?? fromDay;

        if (from && from !== gameState.time) {
          throw validationError("timeAdvance.from no coincide con la hora actual del GameState.", {
            currentTime: gameState.time,
            receivedFrom: from,
          });
        }

        if (!Number.isInteger(fromDay) || fromDay < 1) {
          throw validationError("timeAdvance.fromDay debe ser un entero positivo.", {
            receivedFromDay: fromDay,
          });
        }

        if (!Number.isInteger(toDay) || toDay < 1) {
          throw validationError("timeAdvance.toDay debe ser un entero positivo.", {
            receivedToDay: toDay,
          });
        }

        if (fromDay !== dayBefore) {
          throw validationError("timeAdvance.fromDay no coincide con currentDay del GameState.", {
            currentDay: dayBefore,
            receivedFromDay: fromDay,
          });
        }

        if (!isValidTime(to)) {
          throw validationError("timeAdvance.to debe tener formato HH:MM exacto.");
        }

        const elapsedMinutes = diffAdvanceMinutes({
          fromDay,
          from: effectiveFrom,
          toDay,
          to,
        });

        if (elapsedMinutes < 0) {
          throw validationError("timeAdvance.to no puede ser anterior a timeAdvance.from. Si cruza medianoche, envia toDay.", {
            from: effectiveFrom,
            fromDay,
            to,
            toDay,
          });
        }

        if (elapsedMinutes > 24 * 60) {
          throw validationError("timeAdvance no puede avanzar mas de 24 horas en una sola llamada.", {
            from: effectiveFrom,
            fromDay,
            to,
            toDay,
            elapsedMinutes,
          });
        }

        validateHourBoundaryCost({
          timeAdvance: { fromDay, from: effectiveFrom, toDay, to },
          currentTime: gameState.time,
          body,
        });
        validateActivityCostMinutes({
          timeAdvance: { fromDay, from: effectiveFrom, toDay, to },
          currentTime: gameState.time,
          body,
        });

        changes.time = {
          dayBefore,
          before: gameState.time,
          dayAfter: toDay,
          after: to,
          blockAfter: getBlockFromTime(to),
          elapsedMinutes,
          crossesMidnight: toDay > fromDay,
        };

        if (toDay > dayBefore) {
          advanceDiegeticDate(gameState.diegeticDate, toDay - dayBefore);
        }

        gameState.currentDay = toDay;
        gameState.time = to;
        gameState.block = getBlockFromTime(to);
      }

      if (body.gameStatePatch?.locationId) {
        const location = await Location.findOne({ locationId: body.gameStatePatch.locationId })
          .select("locationId name")
          .session(session)
          .lean();

        if (!location) {
          throw validationError("gameStatePatch.locationId no existe.", {
            locationId: body.gameStatePatch.locationId,
          });
        }

        const before = gameState.locationId;
        gameState.locationId = body.gameStatePatch.locationId;
        changes.location = {
          before,
          after: gameState.locationId,
          locationName: location.name,
        };
      }

      if (body.moneyPatch) {
        const { deltaCopper, reason } = body.moneyPatch;

        if (!Number.isInteger(deltaCopper)) {
          throw validationError("moneyPatch.deltaCopper debe ser un número entero.");
        }

        const before = gameState.moneyCopper;
        const after = before + deltaCopper;

        if (after < 0) {
          throw validationError("El dinero no puede quedar negativo.", {
            currentMoneyCopper: before,
            attemptedDelta: deltaCopper,
          });
        }

        gameState.moneyCopper = after;

        changes.money = {
          before,
          delta: deltaCopper,
          after,
          reason: reason || "",
        };
      }

      if (body.lucasPatch) {
        const lucasChanges = {};

        const allowedStats = {
          lifeDelta: "life",
          satietyDelta: "satiety",
          energyDelta: "energy",
          mpDelta: "mp",
        };

        for (const [deltaKey, statKey] of Object.entries(allowedStats)) {
          if (body.lucasPatch[deltaKey] !== undefined) {
            const delta = body.lucasPatch[deltaKey];

            if (!Number.isInteger(delta)) {
              throw validationError(`${deltaKey} debe ser un número entero.`);
            }

            lucasChanges[statKey] = applyStatDelta(gameState.lucasStatus[statKey], delta, statKey);
          }
        }

        if (Array.isArray(body.lucasPatch.addInjuries)) {
          for (const injury of body.lucasPatch.addInjuries) {
            gameState.lucasStatus.injuries.push(injury);
          }

          lucasChanges.addInjuries = body.lucasPatch.addInjuries;
        }

        if (Array.isArray(body.lucasPatch.addConditions)) {
          for (const condition of body.lucasPatch.addConditions) {
            gameState.lucasStatus.conditions.push(condition);
          }

          lucasChanges.addConditions = body.lucasPatch.addConditions;
        }

        if (Object.keys(lucasChanges).length > 0) {
          changes.lucasStatus = lucasChanges;
        }
      }

      if (body.activityCost || changes.time) {
        const biologicalClockChange = applyBiologicalClockForTurn(
          gameState,
          body,
          changes.time
            ? {
                fromDay: changes.time.dayBefore,
                from: changes.time.before,
                toDay: changes.time.dayAfter,
                to: changes.time.after,
              }
            : null
        );

        if (biologicalClockChange) {
          changes.biologicalClock = biologicalClockChange;

          if (biologicalClockChange.processedBlocks.length > 0) {
            const satietyBefore = biologicalClockChange.processedBlocks[0].satiety.before;
            const energyBefore = biologicalClockChange.processedBlocks[0].energy.before;
            const satietyAfter =
              biologicalClockChange.processedBlocks[biologicalClockChange.processedBlocks.length - 1].satiety.after;
            const energyAfter =
              biologicalClockChange.processedBlocks[biologicalClockChange.processedBlocks.length - 1].energy.after;

            changes.activityCost = {
              mode: biologicalClockChange.mode,
              satiety: {
                before: satietyBefore,
                delta: satietyAfter - satietyBefore,
                after: satietyAfter,
                labelAfter: gameState.lucasStatus.satiety.label || "",
              },
              energy: {
                before: energyBefore,
                delta: energyAfter - energyBefore,
                after: energyAfter,
                labelAfter: gameState.lucasStatus.energy.label || "",
              },
              processedBlocks: biologicalClockChange.processedBlocks,
            };

            changes.lucasStatus = {
              ...(changes.lucasStatus || {}),
              activityCost: {
                satiety: changes.activityCost.satiety,
                energy: changes.activityCost.energy,
              },
            };
          }
        }
      }

      if (Array.isArray(body.inventoryPatch)) {
        const inventoryChanges = [];

        for (const patch of body.inventoryPatch) {
          inventoryChanges.push(await applyInventoryPatch(gameState.inventory, patch, session));
        }

        if (inventoryChanges.length > 0) {
          changes.inventory = inventoryChanges;
        }
      }

      if (body.skillPatch !== undefined && !Array.isArray(body.skillPatch)) {
        throw validationError("skillPatch debe ser un array.");
      }

      if (Array.isArray(body.skillPatch)) {
        const skillChanges = [];

        for (const patch of body.skillPatch) {
          const skill = gameState.skills.find((entry) => entry.skillId === patch.skillId);

          if (!skill) {
            throw validationError(`No existe la habilidad: ${patch.skillId}`);
          }

          skillChanges.push({
            ...applyValidatedSkillPatch({
              gameState,
              skill,
              patch,
            }),
          });
        }

        if (skillChanges.length > 0) {
          changes.skills = skillChanges;
        }
      }

      let updatedGameState = gameState.toObject();

      if (Array.isArray(body.npcRelationshipPatches)) {
        const relationshipChanges = await applyNpcRelationshipPatches(gameState, body.npcRelationshipPatches, session);
        if (relationshipChanges.length > 0) changes.npcRelationships = relationshipChanges;
      }

      if (Array.isArray(body.npcMemoryPatches)) {
        const memoryChanges = await applyNpcMemoryPatches(updatedGameState, body.npcMemoryPatches, session);
        if (memoryChanges.length > 0) changes.npcMemories = memoryChanges;
      }

      if (Array.isArray(body.rumorPatches)) {
        const rumorChanges = await applyRumorPatches(updatedGameState, body.rumorPatches, session);
        if (rumorChanges.length > 0) changes.rumors = rumorChanges;
      }

      if (Array.isArray(body.worldEventPatches)) {
        const worldEventChanges = await applyWorldEventPatches(updatedGameState, body.worldEventPatches, session);
        if (worldEventChanges.events.length > 0) changes.worldEvents = worldEventChanges.events;
        if (worldEventChanges.npcRelationships.length > 0) {
          changes.npcRelationships = [
            ...(changes.npcRelationships || []),
            ...worldEventChanges.npcRelationships,
          ];
        }
        if (worldEventChanges.socialConsequences.length > 0) {
          changes.worldEventSocialConsequences = [
            ...(changes.worldEventSocialConsequences || []),
            ...worldEventChanges.socialConsequences,
          ];
        }
      }

      if (Array.isArray(body.locationPatches)) {
        const locationChanges = await applyLocationPatches(body.locationPatches, session);
        if (locationChanges.length > 0) changes.locations = locationChanges;
      }

      if (Array.isArray(body.shopStockPatches)) {
        const shopStockChanges = await applyShopStockPatches(body.shopStockPatches, session);
        if (shopStockChanges.length > 0) changes.shopStocks = shopStockChanges;
      }

      if (body.missionPatch) {
        const missionChanges = await applyMissionPatches(gameState, body.missionPatch, session);
        if (missionChanges.length > 0) changes.missions = missionChanges;
      }

      if (body.jobContractPatch) {
        const jobContractChanges = await applyJobContractPatches(gameState, body.jobContractPatch, session);
        if (jobContractChanges.length > 0) changes.jobContracts = jobContractChanges;
      }

      const missionExpiry = await expireAvailableMissionsForGameState(gameState, {
        session,
        reason: "expired_during_apply_turn",
      });
      if (missionExpiry.expiredCount > 0) {
        changes.missionExpiry = missionExpiry;
      }

      const dailyEventChanges = await reconcileDailyEventsForGameState(gameState, { session });
      if (dailyEventChanges.changed) {
        changes.dailyEvents = dailyEventChanges;
      }

      if (dailyEventChanges.expired?.length > 0) {
        const expiredSocialConsequences = await applyExpiredWorldEventSocialConsequences(
          gameState,
          dailyEventChanges.expired,
          session
        );

        if (expiredSocialConsequences.npcRelationships.length > 0) {
          changes.npcRelationships = [
            ...(changes.npcRelationships || []),
            ...expiredSocialConsequences.npcRelationships,
          ];
        }

        if (expiredSocialConsequences.socialConsequences.length > 0) {
          changes.worldEventSocialConsequences = [
            ...(changes.worldEventSocialConsequences || []),
            ...expiredSocialConsequences.socialConsequences,
          ];
          changes.dailyEvents.socialConsequencesApplied = expiredSocialConsequences.socialConsequences;
        }
      }

      if (changes.time && gameId === "isekai_lucas_main") {
        const weatherChanges = await ensureCurrentWeatherForGameState(gameState, { session });
        if (weatherChanges.changed) {
          changes.weather = {
            before: weatherChanges.before
              ? {
                  weatherId: weatherChanges.before.weatherId,
                  currentCondition: weatherChanges.before.currentCondition,
                  expectedUntilDay: weatherChanges.before.expectedUntilDay,
                  expectedUntilTime: weatherChanges.before.expectedUntilTime,
                }
              : null,
            after: {
              weatherId: weatherChanges.weather.weatherId,
              currentCondition: weatherChanges.weather.currentCondition,
              startedDay: weatherChanges.weather.startedDay,
              startedTime: weatherChanges.weather.startedTime,
              expectedUntilDay: weatherChanges.weather.expectedUntilDay,
              expectedUntilTime: weatherChanges.weather.expectedUntilTime,
            },
          };
        }
      }

      const logsToCreate = [];

      if (Array.isArray(body.eventLogs)) {
        for (const log of body.eventLogs) {
          logsToCreate.push({
            logId: log.logId || createLogId(),
            gameId,
            day: changes.time?.dayBefore || updatedGameState.currentDay,
            timeStart: body.timeAdvance?.from || changes.time?.before || updatedGameState.time,
            timeEnd: body.timeAdvance?.to || updatedGameState.time,
            locationId: updatedGameState.locationId,
            type: log.type || "turn_update",
            summary: log.summary || body.actionSummary || "Turno actualizado.",
            involvedCharacterIds: log.involvedCharacterIds || ["char_lucas"],
            involvedNpcIds: log.involvedNpcIds || [],
            involvedFactionIds: log.involvedFactionIds || [],
            mechanicalChanges: log.mechanicalChanges || changes,
            visibility: log.visibility || "private",
            source: log.source || "player_action",
            tags: log.tags || [],
          });
        }
      } else if (body.actionSummary || Object.keys(changes).length > 0) {
        logsToCreate.push({
          logId: createLogId(),
          gameId,
          day: changes.time?.dayBefore || updatedGameState.currentDay,
          timeStart: changes.time?.before || updatedGameState.time,
          timeEnd: updatedGameState.time,
          locationId: updatedGameState.locationId,
          type: "turn_update",
          summary: body.actionSummary || "Turno actualizado.",
          involvedCharacterIds: ["char_lucas"],
          mechanicalChanges: changes,
          visibility: "private",
          source: "player_action",
        });
      }

      let narrativeHints = null;
      if (logsToCreate.length > 0 || body.actionSummary || Object.keys(changes).length > 0) {
        narrativeHints = await buildNarrativeHints({
          gameId,
          gameState: gameState.toObject(),
          actionSummary: body.actionSummary || "",
          changes,
          logDrafts: logsToCreate,
          session,
        });
        attachNarrativeTrackingToLogDrafts(logsToCreate, narrativeHints);
      }

      await validateEventLogsForInsert(logsToCreate, session);
      normalizePendingAccumulationIdentities(gameState);
      await gameState.save({ session });

      if (changes.time && gameId === "isekai_lucas_main") {
        const routineSync = await syncNpcRoutines({
          day: gameState.currentDay,
          time: gameState.time,
          session,
        });

        if (routineSync.updatedCount > 0) {
          changes.routineSync = routineSync;
        }
      } else if (changes.time) {
        changes.routineSync = {
          skipped: true,
          reason: "Rutinas NPC globales omitidas para gameId no canonico.",
          gameId,
        };
      }

      if (logsToCreate.length > 0) {
        await EventLog.insertMany(logsToCreate, { session });
      }

      const autoCheckpointPlan = buildApplyTurnAutoCheckpointPlan(changes);
      if (autoCheckpointPlan) {
        changes.autoCheckpoint = await createAutomaticCheckpoint({
          gameId,
          title: autoCheckpointPlan.title,
          reason: autoCheckpointPlan.reason,
          triggerKey: autoCheckpointPlan.triggerKey,
          metadata: autoCheckpointPlan.metadata,
          session,
        });
      }

      if (narrativeHints) {
        changes.narrativeHints = narrativeHints;
      }

      updatedGameState = gameState.toObject();

      responsePayload = {
      ok: true,
      message: "Turno aplicado correctamente.",
      changes,
      gameState: updatedGameState,
      eventLogsCreated: logsToCreate.length,
      };
    });

    return res.json(responsePayload);
  } catch (error) {
    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
      ok: false,
      error: statusCode === 500 ? "Error aplicando turno." : error.message,
      details: error.details || error.message,
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

module.exports = {
  applyTurn,
};
