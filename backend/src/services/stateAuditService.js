const fs = require("node:fs");
const path = require("node:path");

const Commitment = require("../models/Commitment");
const GameState = require("../models/GameState");
const MagicTechnique = require("../models/MagicTechnique");
const Mission = require("../models/Mission");
const WorldEvent = require("../models/WorldEvent");
const { ADVANCED_ACTIONS } = require("./combatAdvancedService");
const {
  canonicalActiveMissionQuery,
  isMissionExpired,
} = require("./missionService");
const {
  eventGameFilter,
  getEventStatusAt,
  isMainEvent,
  shouldEnsureDailyEvent,
} = require("./dailyEventSchedulerService");

const CANON_GAME_ID = "isekai_lucas_main";
const COMBAT_OPENAPI_PATH = path.resolve(__dirname, "../../docs/openapi-gpt-action-combat.json");

function addIssue(issues, { code, severity = "warning", message, evidence = {}, recommendedAction = "" }) {
  issues.push({
    code,
    severity,
    message,
    evidence,
    recommendedAction,
  });
}

function issueSummary(issues) {
  const bySeverity = issues.reduce((summary, issue) => {
    summary[issue.severity] = (summary[issue.severity] || 0) + 1;
    return summary;
  }, {});

  return {
    total: issues.length,
    bySeverity,
    ok: !issues.some((issue) => ["critical", "error"].includes(issue.severity)),
  };
}

function readCombatSchemaActionEnum() {
  try {
    const schema = JSON.parse(fs.readFileSync(COMBAT_OPENAPI_PATH, "utf8"));
    return schema.components?.schemas?.PreviewActionRequest?.properties?.actionType?.enum || [];
  } catch {
    return [];
  }
}

function cleanSortedIds(values = []) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function auditTimeToMinutes(time = "00:00") {
  const [hours = "0", minutes = "0"] = String(time || "00:00").split(":");
  return Number(hours) * 60 + Number(minutes);
}

function auditAbsoluteMinutes(day, time = "23:59") {
  return (Number(day || 1) - 1) * 1440 + auditTimeToMinutes(time);
}

function isTrackableCommitment(commitment = {}) {
  if (!commitment) return false;
  if (commitment.requiresExplicitResolution) return true;
  if (commitment.promiseType && commitment.promiseType !== "none") return true;
  if (commitment.promiseStrength && commitment.promiseStrength !== "none") return true;
  if (["critical", "high"].includes(commitment.priority)) return true;
  return ["promise", "obligation", "appointment", "follow_up", "mission_intention"].includes(commitment.type);
}

function findExpiredMissions(missions = [], gameState) {
  return missions
    .filter((mission) => isMissionExpired(mission, gameState))
    .map((mission) => ({
      missionId: mission.missionId,
      status: mission.status,
      proofStatus: mission.proofStatus,
      expiresDay: mission.expiresDay,
      expiresTime: mission.expiresTime || "",
    }));
}

function hasDebugTag(tags = []) {
  return (tags || []).some((tag) => {
    const normalized = String(tag || "").toLowerCase();
    return (
      normalized === "admin_fix" ||
      normalized.includes("repair") ||
      normalized.includes("test") ||
      normalized.startsWith("former_") ||
      normalized.startsWith("debug_")
    );
  });
}

async function auditMissions({ gameState, issues, checks }) {
  const rawOpenTestSuiteMissions = await Mission.find({
    "flags.testSuite": true,
    status: { $in: ["available", "accepted", "blocked"] },
  })
    .sort({ status: 1, postedDay: -1, postedTime: -1 })
    .lean();

  checks.missions = {
    rawOpenTestSuiteCount: rawOpenTestSuiteMissions.length,
  };

  if (rawOpenTestSuiteMissions.length > 0) {
    addIssue(issues, {
      code: "test_suite_missions_open_in_canon_store",
      severity: "critical",
      message: "Hay misiones de test abiertas en la coleccion global de misiones.",
      evidence: {
        missionIds: rawOpenTestSuiteMissions.map((mission) => mission.missionId),
      },
      recommendedAction:
        "Ocultarlas/cerrarlas con repair:canon-hygiene y mantener filtros por defecto en board/context.",
    });
  }

  const canonicalActiveMissions = await Mission.find(canonicalActiveMissionQuery(gameState))
    .sort({ postedDay: -1, postedTime: -1 })
    .lean();
  const derivedActiveMissionIds = cleanSortedIds(canonicalActiveMissions.map((mission) => mission.missionId));
  const storedActiveMissionIds = cleanSortedIds(gameState.activeMissionIds || []);
  const missingFromStored = derivedActiveMissionIds.filter((missionId) => !storedActiveMissionIds.includes(missionId));
  const staleStored = storedActiveMissionIds.filter((missionId) => !derivedActiveMissionIds.includes(missionId));
  checks.missions.derivedActiveMissionIds = derivedActiveMissionIds;
  checks.missions.storedActiveMissionIds = storedActiveMissionIds;

  if (missingFromStored.length > 0 || staleStored.length > 0) {
    addIssue(issues, {
      code: "active_mission_ids_diverge",
      severity: "critical",
      message: "GameState.activeMissionIds no coincide con las misiones aceptadas canonicas.",
      evidence: { missingFromStored, staleStored },
      recommendedAction:
        "Derivar/reconciliar activeMissionIds desde misiones aceptadas no testSuite.",
    });
  }

  const acceptedExpired = findExpiredMissions(canonicalActiveMissions, gameState);
  checks.missions.acceptedExpiredCount = acceptedExpired.length;
  if (acceptedExpired.length > 0) {
    addIssue(issues, {
      code: "accepted_missions_expired",
      severity: "warning",
      message: "Hay misiones canonicas aceptadas cuyo vencimiento ya paso.",
      evidence: { missions: acceptedExpired },
      recommendedAction:
        "Cerrar cada mision con expire/fail/formal_closure_required antes de avanzar tiempo largo.",
    });
  }
}

async function auditEvents({ gameState, gameId, issues, checks }) {
  const activeEventIds = cleanSortedIds(gameState.activeEventIds || []);
  const activeEventsFromState = activeEventIds.length
    ? await WorldEvent.find({ ...eventGameFilter(gameId), eventId: { $in: activeEventIds } }).lean()
    : [];
  const activeEventDocIds = cleanSortedIds(activeEventsFromState.map((event) => event.eventId));
  const missingEventIds = activeEventIds.filter((eventId) => !activeEventDocIds.includes(eventId));
  const nonOpenActiveRefs = activeEventsFromState
    .filter((event) => !["scheduled", "active"].includes(event.status))
    .map((event) => ({ eventId: event.eventId, status: event.status }));

  const openMainEvents = await WorldEvent.find({
    $and: [
      eventGameFilter(gameId),
      {
        $or: [
          { eventLayer: "main_event" },
          { countsAsMainEvent: true },
          { blocksMainEventGeneration: true },
        ],
      },
    ],
    status: { $in: ["scheduled", "active"] },
  })
    .sort({ startDay: 1, startTime: 1 })
    .lean();
  const blockingMainEvents = openMainEvents.filter(isMainEvent);
  const debugTaggedOpenEvents = await WorldEvent.find({
    ...eventGameFilter(gameId),
    status: { $in: ["scheduled", "active"] },
    tags: { $exists: true, $ne: [] },
  })
    .sort({ startDay: 1, startTime: 1 })
    .lean();
  const debugTagged = debugTaggedOpenEvents.filter((event) => hasDebugTag(event.tags));

  checks.events = {
    activeEventIds,
    activeEventDocIds,
    openMainEventIds: blockingMainEvents.map((event) => event.eventId),
    debugTaggedOpenEventIds: debugTagged.map((event) => event.eventId),
  };

  if (missingEventIds.length > 0) {
    addIssue(issues, {
      code: "active_event_ids_missing_docs",
      severity: "critical",
      message: "GameState.activeEventIds referencia eventos que no existen.",
      evidence: { missingEventIds },
      recommendedAction: "Quitar referencias rotas o restaurar el WorldEvent correspondiente.",
    });
  }

  if (nonOpenActiveRefs.length > 0) {
    addIssue(issues, {
      code: "active_event_ids_non_open",
      severity: "warning",
      message: "GameState.activeEventIds contiene eventos que ya no estan scheduled/active.",
      evidence: { events: nonOpenActiveRefs },
      recommendedAction: "Limpiar activeEventIds al resolver/expirar eventos.",
    });
  }

  if (blockingMainEvents.length > 1) {
    addIssue(issues, {
      code: "multiple_blocking_main_events",
      severity: "critical",
      message: "Hay mas de un evento principal abierto bloqueando generacion.",
      evidence: { eventIds: blockingMainEvents.map((event) => event.eventId) },
      recommendedAction: "Demover/cerrar duplicados antes de generar mas eventos principales.",
    });
  }

  if (shouldEnsureDailyEvent(gameState) && blockingMainEvents.length === 0) {
    addIssue(issues, {
      code: "daily_event_missing",
      severity: "warning",
      message: "Ya deberia existir un evento principal diario o bloqueante y no se encontro uno abierto.",
      evidence: { day: gameState.currentDay, time: gameState.time },
      recommendedAction: "Ejecutar ensure:daily-event o revisar scheduler antes de narrar un dia largo.",
    });
  }

  if (blockingMainEvents.length > 0) {
    const effectivelyActiveMainEvents = blockingMainEvents.filter(
      (event) => getEventStatusAt(event, gameState.currentDay, gameState.time) === "active"
    );
    const missingFromState = effectivelyActiveMainEvents
      .map((event) => event.eventId)
      .filter((eventId) => !activeEventIds.includes(eventId));
    if (missingFromState.length > 0) {
      addIssue(issues, {
        code: "blocking_main_event_not_in_active_event_ids",
        severity: "warning",
        message: "Existe evento principal ya activo, pero no esta referenciado por GameState.activeEventIds.",
        evidence: { eventIds: missingFromState },
        recommendedAction: "Reconciliar activeEventIds para que el contexto compacto lo vea siempre.",
      });
    }
  }

  if (debugTagged.length > 0) {
    addIssue(issues, {
      code: "debug_tags_on_open_events",
      severity: "info",
      message: "Hay eventos abiertos con tags tecnicos; el contexto narrativo los oculta, pero conviene revisarlos.",
      evidence: {
        events: debugTagged.map((event) => ({
          eventId: event.eventId,
          tags: event.tags,
        })),
      },
      recommendedAction: "Mantener tags tecnicos fuera de narrativeTags o moverlos a flags/debug.",
    });
  }
}

async function auditMagic({ gameState, issues, checks }) {
  const techniques = await MagicTechnique.find({ status: "available" }).lean();
  const liveSkillIds = cleanSortedIds((gameState.skills || []).map((skill) => skill.skillId));
  const liveSkillIdSet = new Set(liveSkillIds);
  const currentlyPracticeableTechniques = techniques.filter((technique) =>
    (technique.requirements?.skills || []).every((requirement) => liveSkillIdSet.has(requirement.skillId))
  );
  const deferredTechniqueIds = techniques
    .filter((technique) => !currentlyPracticeableTechniques.includes(technique))
    .map((technique) => technique.techniqueId)
    .sort();
  const referencedSkillIds = cleanSortedIds(
    currentlyPracticeableTechniques.flatMap((technique) =>
      (technique.expSuggestions || []).map((suggestion) => suggestion.skillId)
    )
  );
  const missingSkillIds = referencedSkillIds.filter((skillId) => !liveSkillIds.includes(skillId));

  checks.magic = {
    referencedSkillIds,
    liveSkillIds,
    missingSkillIds,
    currentlyPracticeableTechniqueIds: currentlyPracticeableTechniques.map((technique) => technique.techniqueId).sort(),
    deferredTechniqueIds,
  };

  if (missingSkillIds.length > 0) {
    addIssue(issues, {
      code: "magic_technique_references_missing_skill",
      severity: "critical",
      message: "Hay tecnicas magicas disponibles que otorgan EXP a skills no presentes en Lucas.",
      evidence: { missingSkillIds },
      recommendedAction:
        "Seedear o desbloquear formalmente las skills antes de permitir practica real.",
    });
  }
}

function auditCombatSchema({ issues, checks }) {
  const supportedActionTypes = cleanSortedIds(
    ADVANCED_ACTIONS.filter((action) => action.c4ApplySupported).map((action) => action.actionType)
  );
  const combatSchemaActionTypes = cleanSortedIds(readCombatSchemaActionEnum());
  const missingFromSchema = supportedActionTypes.filter((actionType) => !combatSchemaActionTypes.includes(actionType));

  checks.combatSchema = {
    supportedActionTypes,
    combatSchemaActionTypes,
    missingFromSchema,
  };

  if (missingFromSchema.length > 0) {
    addIssue(issues, {
      code: "combat_supported_actions_missing_from_openapi",
      severity: "critical",
      message: "El backend lista acciones C4 soportadas que el OpenAPI de combate no permite invocar.",
      evidence: { missingFromSchema },
      recommendedAction: "Sincronizar ADVANCED_ACTIONS con PreviewActionRequest.actionType.enum.",
    });
  }
}

async function auditCommitments({ gameState, gameId, issues, checks }) {
  const openCommitments = await Commitment.find({
    gameId,
    status: { $in: ["pending", "active"] },
  })
    .sort({ dueDay: 1, dueTime: 1, nextCheckDay: 1, nextCheckTime: 1 })
    .lean();
  const currentAbs = auditAbsoluteMinutes(gameState.currentDay, gameState.time);
  const trackable = openCommitments.filter(isTrackableCommitment);
  const conditionalDormant = trackable.filter(
    (commitment) =>
      !commitment.dueDay &&
      !commitment.nextCheckDay &&
      (commitment.conditionSummary || commitment.dormantUntilDay)
  );
  const unscheduled = trackable.filter(
    (commitment) =>
      !commitment.dueDay &&
      !commitment.nextCheckDay &&
      !commitment.conditionSummary &&
      !commitment.dormantUntilDay
  );
  const reviewDue = openCommitments.filter(
    (commitment) =>
      (commitment.nextCheckDay &&
        auditAbsoluteMinutes(commitment.nextCheckDay, commitment.nextCheckTime || "23:59") <= currentAbs) ||
      (commitment.dormantUntilDay &&
        auditAbsoluteMinutes(commitment.dormantUntilDay, commitment.dormantUntilTime || "23:59") <= currentAbs)
  );
  const adminWithoutResponsible = openCommitments.filter(
    (commitment) =>
      commitment.promiseType === "administrative_process" &&
      !commitment.responsibleNpcId &&
      !commitment.responsibleFactionId
  );

  checks.commitments = {
    openCount: openCommitments.length,
    trackableCount: trackable.length,
    unscheduledTrackableIds: unscheduled.map((commitment) => commitment.commitmentId),
    conditionalDormantIds: conditionalDormant.map((commitment) => commitment.commitmentId),
    reviewDueIds: reviewDue.map((commitment) => commitment.commitmentId),
    administrativeProcessWithoutResponsibleIds: adminWithoutResponsible.map(
      (commitment) => commitment.commitmentId
    ),
  };

  if (unscheduled.length > 0) {
    addIssue(issues, {
      code: "trackable_commitments_without_due_or_review",
      severity: "warning",
      message: "Hay compromisos/promesas/procesos importantes sin fecha objetivo ni proxima revision.",
      evidence: {
        commitmentIds: unscheduled.map((commitment) => commitment.commitmentId),
      },
      recommendedAction:
        "Agregar dueDay/dueTime o nextCheckDay/nextCheckTime, o cerrarlos formalmente si ya no aplican.",
    });
  }

  if (reviewDue.length > 0) {
    addIssue(issues, {
      code: "commitment_reviews_due",
      severity: "warning",
      message: "Hay compromisos/promesas/procesos cuya proxima revision ya corresponde.",
      evidence: {
        commitmentIds: reviewDue.map((commitment) => commitment.commitmentId),
      },
      recommendedAction:
        "Cumplir, explicar bloqueo, reprogramar nextCheck o cerrar formalmente con commitmentPatches.",
    });
  }

  if (adminWithoutResponsible.length > 0) {
    addIssue(issues, {
      code: "administrative_process_without_responsible_actor",
      severity: "info",
      message: "Hay procesos administrativos sin NPC o faccion responsable.",
      evidence: {
        commitmentIds: adminWithoutResponsible.map((commitment) => commitment.commitmentId),
      },
      recommendedAction:
        "Guardar responsibleNpcId o responsibleFactionId para evitar pendientes impersonales.",
    });
  }
}

async function buildStateAudit({ gameId = CANON_GAME_ID } = {}) {
  const gameState = await GameState.findOne({ gameId }).lean();
  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const issues = [];
  const checks = {
    schemaVersion: "state_audit_v1",
    gameId,
    clock: {
      day: gameState.currentDay,
      time: gameState.time,
      locationId: gameState.locationId,
    },
  };

  await auditMissions({ gameState, issues, checks });
  await auditEvents({ gameState, gameId, issues, checks });
  await auditMagic({ gameState, issues, checks });
  await auditCommitments({ gameState, gameId, issues, checks });
  auditCombatSchema({ issues, checks });

  return {
    ok: !issues.some((issue) => ["critical", "error"].includes(issue.severity)),
    schemaVersion: "state_audit_v1",
    generatedFor: "modo_tecnico_o_admin_readonly",
    gameId,
    summary: issueSummary(issues),
    issues,
    checks,
  };
}

module.exports = {
  buildStateAudit,
};
