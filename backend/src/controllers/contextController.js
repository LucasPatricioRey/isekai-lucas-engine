const mongoose = require("mongoose");

const GameState = require("../models/GameState");
const Character = require("../models/Character");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const WorldEvent = require("../models/WorldEvent");
const Rumor = require("../models/Rumor");
const Mission = require("../models/Mission");
const EventLog = require("../models/EventLog");
const Shop = require("../models/Shop");
const ShopStock = require("../models/ShopStock");
const Item = require("../models/Item");
const Faction = require("../models/Faction");
const RoutineOverride = require("../models/RoutineOverride");
const CombatEncounter = require("../models/CombatEncounter");
const NpcRelationship = require("../models/NpcRelationship");
const NpcSocialLedger = require("../models/NpcSocialLedger");
const WeatherState = require("../models/WeatherState");
const JobContract = require("../models/JobContract");
const Commitment = require("../models/Commitment");
const Evidence = require("../models/Evidence");
const KnowledgeRecord = require("../models/KnowledgeRecord");
const responseShaping = require("../utils/responseShaping");
const { buildContextHudContract } = require("../utils/turnDisplayBundle");
const { buildNarrativeContextSummary } = require("../services/narrativeVariationService");
const { buildNpcKnowledgeContext } = require("../services/knowledgeService");
const { buildStateAudit } = require("../services/stateAuditService");
const { buildCommitmentReviewPlans } = require("../services/commitmentReviewService");
const {
  annotateMissionForBoard,
  applyMissionEnvironmentFilter,
  shouldIncludeTestSuiteMissions,
} = require("../services/missionService");
const {
  DAILY_EVENT_TAG,
  EVENT_LAYERS,
  eventGameFilter,
  isMainEvent,
  mainEventQuery,
  shouldEnsureDailyEvent,
} = require("../services/dailyEventSchedulerService");

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeCompactProfile(value, includeTechnicalSummary = false) {
  const requested = String(value || "").trim();
  if (["player_scene", "mechanical_turn", "minimal_header", "debug_audit"].includes(requested)) {
    return requested;
  }
  return includeTechnicalSummary ? "debug_audit" : "player_scene";
}

function compactProfileDefaults(profile) {
  if (profile === "debug_audit") {
    return {
      npcLimit: 20,
      memoryLimit: 6,
      rumorLimit: 5,
      missionLimit: 8,
      eventLimit: 6,
      logLimit: 5,
      commitmentLimit: 8,
    };
  }

  if (profile === "minimal_header") {
    return {
      npcLimit: 4,
      memoryLimit: 1,
      rumorLimit: 1,
      missionLimit: 3,
      eventLimit: 4,
      logLimit: 1,
      commitmentLimit: 3,
    };
  }

  if (profile === "mechanical_turn") {
    return {
      npcLimit: 8,
      memoryLimit: 2,
      rumorLimit: 2,
      missionLimit: 5,
      eventLimit: 5,
      logLimit: 3,
      commitmentLimit: 5,
    };
  }

  return {
    npcLimit: 5,
    memoryLimit: 3,
    rumorLimit: 3,
    missionLimit: 3,
    eventLimit: 5,
    logLimit: 3,
    commitmentLimit: 5,
  };
}

function compactProfileCaps(profile) {
  if (profile === "debug_audit") {
    return {
      npcLimit: 30,
      memoryLimit: 12,
      rumorLimit: 10,
      missionLimit: 15,
      eventLimit: 12,
      logLimit: 10,
      commitmentLimit: 15,
    };
  }

  return {
    npcLimit: 12,
    memoryLimit: 6,
    rumorLimit: 5,
    missionLimit: 8,
    eventLimit: 8,
    logLimit: 5,
    commitmentLimit: 8,
  };
}

function npcMemoryImportanceRank(memory = {}) {
  const ranks = {
    critical: 4,
    important: 3,
    normal: 2,
    minor: 1,
  };
  return ranks[memory.importance] || 0;
}

function sortNpcMemories(left = {}, right = {}) {
  const importanceDiff = npcMemoryImportanceRank(right) - npcMemoryImportanceRank(left);
  if (importanceDiff !== 0) return importanceDiff;
  const dayDiff = (Number(right.createdDay) || 0) - (Number(left.createdDay) || 0);
  if (dayDiff !== 0) return dayDiff;
  return String(right.createdTime || "").localeCompare(String(left.createdTime || ""));
}

function selectBalancedNpcMemories(memories = [], npcIds = [], requestedLimit = 0, profile = "player_scene") {
  if (profile === "debug_audit") return memories;
  if (!requestedLimit || requestedLimit <= 0) return [];

  const nearbyNpcIds = npcIds.filter(Boolean);
  const maxTotal = requestedLimit;
  const byNpc = new Map();
  const selected = [];
  const selectedIds = new Set();

  for (const memory of [...memories].sort(sortNpcMemories)) {
    if (!memory?.npcId) continue;
    if (!byNpc.has(memory.npcId)) byNpc.set(memory.npcId, []);
    byNpc.get(memory.npcId).push(memory);
  }

  for (const npcId of nearbyNpcIds) {
    const firstMemory = byNpc.get(npcId)?.[0];
    if (!firstMemory || selectedIds.has(firstMemory.memoryId)) continue;
    selected.push(firstMemory);
    selectedIds.add(firstMemory.memoryId);
    if (selected.length >= maxTotal) return selected.sort(sortNpcMemories);
  }

  for (const memory of [...memories].sort(sortNpcMemories)) {
    if (!memory?.memoryId || selectedIds.has(memory.memoryId)) continue;
    selected.push(memory);
    selectedIds.add(memory.memoryId);
    if (selected.length >= maxTotal) break;
  }

  return selected.sort(sortNpcMemories);
}

function slimNpcSummaryForProfile(npc, profile) {
  if (!npc || profile === "debug_audit") return npc;
  const dramaticRole = npc.dialogueProfile?.dramaticRole
    ? {
        schemaVersion: npc.dialogueProfile.dramaticRole.schemaVersion,
        publicMask: responseShaping.truncateText(npc.dialogueProfile.dramaticRole.publicMask || "", 70),
        sceneWant: responseShaping.truncateText(npc.dialogueProfile.dramaticRole.sceneWant || "", 80),
        resistanceMove: responseShaping.truncateText(npc.dialogueProfile.dramaticRole.resistanceMove || "", 70),
        vulnerabilityTell: responseShaping.truncateText(npc.dialogueProfile.dramaticRole.vulnerabilityTell || "", 65),
        objectAnchor: responseShaping.truncateText(npc.dialogueProfile.dramaticRole.objectAnchor || "", 70),
        rule: "Usar gesto/objeto/dialogo; no mente privada.",
      }
    : null;
  const emotionalSubtext = npc.dialogueProfile?.emotionalSubtext
    ? {
        defaultMood: responseShaping.truncateText(npc.dialogueProfile.emotionalSubtext.defaultMood || "", 80),
        visibleTells: (npc.dialogueProfile.emotionalSubtext.visibleTells || []).slice(0, 2),
        contradiction: responseShaping.truncateText(npc.dialogueProfile.emotionalSubtext.contradiction || "", 90),
        rule: npc.dialogueProfile.emotionalSubtext.rule || "",
      }
    : null;
  const dialogueDirector = npc.dialogueProfile?.dialogueDirector
    ? {
        schemaVersion: npc.dialogueProfile.dialogueDirector.schemaVersion,
        cadence: responseShaping.truncateText(npc.dialogueProfile.dialogueDirector.cadence || "", 70),
        emotionalRule: responseShaping.truncateText(npc.dialogueProfile.dialogueDirector.emotionalRule || "", 80),
        reactFirst: responseShaping.truncateText(npc.dialogueProfile.dialogueDirector.reactFirst || "", 70),
        sampleBeats: (npc.dialogueProfile.dialogueDirector.sampleBeats || []).slice(0, 1),
        avoid: (npc.dialogueProfile.dialogueDirector.avoid || []).slice(0, 1),
        rule: npc.dialogueProfile.dialogueDirector.rule || "",
      }
    : null;

  return {
    npcId: npc.npcId,
    name: npc.name,
    role: npc.role || "",
    currentLocationId: npc.currentLocationId || "",
    currentTask: npc.currentTask || "",
    availability: npc.availability || {},
    persistenceLevel: npc.persistenceLevel || "",
    socialProfile: npc.socialProfile
      ? {
          values: (npc.socialProfile.values || []).slice(0, 3),
          tolerates: (npc.socialProfile.tolerates || []).slice(0, 3),
          rejects: (npc.socialProfile.rejects || []).slice(0, 3),
          boundaries: (npc.socialProfile.boundaries || []).slice(0, 3),
          trustTriggers: (npc.socialProfile.trustTriggers || []).slice(0, 2),
          trustBreakers: (npc.socialProfile.trustBreakers || []).slice(0, 2),
        }
      : null,
    emotionalProfile: npc.emotionalProfile
      ? {
          schemaVersion: npc.emotionalProfile.schemaVersion || "emotional_profile_v1",
          defaultMood: responseShaping.truncateText(npc.emotionalProfile.defaultMood || "", 90),
          coreDrives: (npc.emotionalProfile.coreDrives || []).slice(0, 2),
          coreFears: (npc.emotionalProfile.coreFears || []).slice(0, 1),
          visibleTells: (npc.emotionalProfile.visibleTells || []).slice(0, 2),
          contradiction: responseShaping.truncateText(npc.emotionalProfile.contradiction || "", 90),
          sceneHooks: (npc.emotionalProfile.sceneHooks || []).slice(0, 1),
        }
      : null,
    voiceProfile: npc.voiceProfile
      ? {
          speechStyle: npc.voiceProfile.speechStyle || "",
          personality: (npc.voiceProfile.personality || []).slice(0, 4),
          values: (npc.voiceProfile.values || []).slice(0, 3),
          boundaries: (npc.voiceProfile.boundaries || []).slice(0, 3),
          dialogueGuidance: (npc.voiceProfile.dialogueGuidance || [])
            .slice(0, 1)
            .map((line) => responseShaping.truncateText(line, 120)),
        }
      : null,
    dialogueProfile: npc.dialogueProfile
      ? {
          schemaVersion: npc.dialogueProfile.schemaVersion,
          speechRhythm: npc.dialogueProfile.speechRhythm || "",
          dialogueDirector,
          relationshipRegister: npc.dialogueProfile.relationshipRegister || null,
          emotionalTemperature: npc.dialogueProfile.emotionalTemperature || null,
          currentPressure: npc.dialogueProfile.currentPressure || null,
          dramaticRole,
          emotionalSubtext,
          subtextSeed: npc.dialogueProfile.subtextSeed || "",
          dialogueMoves: (npc.dialogueProfile.dialogueMoves || [])
            .slice(0, 1)
            .map((line) => responseShaping.truncateText(line, 90)),
          avoid: (npc.dialogueProfile.avoid || [])
            .slice(0, 1)
            .map((line) => responseShaping.truncateText(line, 80)),
          rule: npc.dialogueProfile.rule || "",
        }
      : null,
    relationshipBands: npc.relationshipBands
      ? Object.fromEntries(
          Object.entries(npc.relationshipBands).map(([key, band]) => [
            key,
            {
              key: band?.key || "",
              label: band?.label || "",
            },
          ])
        )
      : {},
    relationshipState: npc.relationshipState
      ? {
          schemaVersion: npc.relationshipState.schemaVersion,
          accessScore: npc.relationshipState.accessScore,
          stance: npc.relationshipState.stance || null,
          narrativeGuidance: (npc.relationshipState.narrativeGuidance || []).slice(0, 1),
          nextThresholds: (npc.relationshipState.nextThresholds || []).slice(0, 1),
          blockers: (npc.relationshipState.blockers || []).slice(0, 1),
          opportunities: (npc.relationshipState.opportunities || []).slice(0, 1),
        }
      : null,
    factionLinks: (npc.factionLinks || []).slice(0, 3).map((link) => ({
      factionId: link.factionId,
      role: link.role || "",
      standing: link.standing || "",
    })),
    knownPublicFacts: (npc.knownPublicFacts || []).slice(0, 3),
  };
}

function slimNpcKnowledgeContextForProfile(context, profile) {
  if (!context || profile === "debug_audit") return context;

  return {
    ...context,
    perNpc: (context.perNpc || []).map((entry) => ({
      npcId: entry.npcId,
      name: entry.name,
      knownRecordCount: (entry.knownRecords || []).length,
      knownRecords: (entry.knownRecords || []).slice(0, 2).map((record) => ({
        knowledgeId: record.knowledgeId,
        factKey: record.factKey,
        summary: record.summary || record.fact || "",
        sourceType: record.sourceType,
        certainty: record.certainty,
        visibility: record.visibility,
        canShare: Boolean(record.canShare),
      })),
      knownMemoryCount: entry.knownMemoryCount || (entry.knownMemories || []).length,
      knownMemories: (entry.knownMemories || []).slice(0, 2).map((memory) => ({
        memoryId: memory.memoryId,
        summary: memory.summary || memory.fact || "",
        sourceType: memory.sourceType,
        certainty: memory.certainty,
        privacyLevel: memory.privacyLevel,
        canShare: Boolean(memory.canShare),
      })),
      jobAvailability: entry.jobAvailability
        ? {
            publicWorkKnown: Boolean(entry.jobAvailability.publicWorkKnown),
            institutionalCanAskAvailability: Boolean(entry.jobAvailability.institutionalCanAskAvailability),
            exactSchedule: entry.jobAvailability.exactSchedule,
            recommendedWording: entry.jobAvailability.recommendedWording,
          }
        : null,
    })),
  };
}

function slimWorldEventForProfile(event, profile) {
  if (!event || profile === "debug_audit") return event;
  return {
    eventId: event.eventId,
    title: event.title,
    type: event.type,
    eventLayer: event.eventLayer,
    countsAsMainEvent: Boolean(event.countsAsMainEvent),
    blocksMainEventGeneration: Boolean(event.blocksMainEventGeneration),
    status: event.status,
    severity: event.severity,
    visibility: event.visibility,
    startDay: event.startDay,
    startTime: event.startTime,
    endDay: event.endDay,
    endTime: event.endTime || "",
    affectedLocationIds: (event.affectedLocationIds || []).slice(0, 3),
    affectedNpcIds: (event.affectedNpcIds || []).slice(0, 3),
    progress: event.progress
      ? {
          stage: event.progress.stage || "",
          statusLabel: event.progress.statusLabel || "",
          summary: responseShaping.truncateText(event.progress.summary || "", 160),
          nextAction: responseShaping.truncateText(event.progress.nextAction || "", 120),
          evidenceIds: (event.progress.evidenceIds || []).slice(0, 3),
          reportIds: (event.progress.reportIds || []).slice(0, 3),
        }
      : {},
    dailyEventNotice: event.dailyEventNotice
      ? {
          title: event.dailyEventNotice.title,
          block: event.dailyEventNotice.block || null,
          text: responseShaping.truncateText(event.dailyEventNotice.text || "", 180),
        }
      : null,
    effects: (event.effects || []).slice(0, 3).map((effect) => ({
      type: effect.type,
      summary: responseShaping.truncateText(effect.summary || effect.description || effect.rule || "", 140),
    })),
    tags: (event.tags || []).slice(0, 8),
  };
}

function eventStatusLineForProfile(event, profile) {
  if (!event || profile === "debug_audit") return event;
  return {
    eventId: event.eventId,
    title: event.title,
    status: event.status,
    eventLayer: event.eventLayer,
    severity: event.severity,
    progress: event.progress
      ? {
          stage: event.progress.stage || "",
          statusLabel: event.progress.statusLabel || "",
          summary: responseShaping.truncateText(event.progress.summary || "", 180),
          nextAction: responseShaping.truncateText(event.progress.nextAction || "", 120),
        }
      : {},
  };
}

function slimSceneRelationshipDynamicsForProfile(dynamics, profile) {
  if (!dynamics || profile === "debug_audit") return dynamics;
  const pairs = (dynamics.pairs || []).slice(0, 2).map((pair) => ({
    relationshipId: pair.relationshipId,
    npcIds: pair.npcIds || [],
    npcNames: pair.npcNames || [],
    type: pair.type || "",
    trustBand: pair.trustBand || null,
    familiarityBand: pair.familiarityBand || null,
    tensionBand: pair.tensionBand || null,
    pressure: pair.pressure || null,
    emotionalTone: responseShaping.truncateText(pair.emotionalTone || "", 70),
    publicSummary: responseShaping.truncateText(pair.publicSummary || "", 100),
    publicTensionReason: responseShaping.truncateText(pair.publicTensionReason || "", 90),
    interactionHints: (pair.interactionHints || []).slice(0, 2),
    boundaries: (pair.boundaries || []).slice(0, 1),
    knownToLucas: Boolean(pair.knownToLucas),
    currentlySharedScene: Boolean(pair.currentlySharedScene),
    rule: "No revelar privateSubtext; usar solo roces, pausas, silencios o decisiones visibles.",
  }));

  return {
    schemaVersion: dynamics.schemaVersion,
    count: pairs.length,
    availablePairCount: Number(dynamics.count) || pairs.length,
    pairs,
    guidance: dynamics.guidance || "",
  };
}

function uniqueByEventId(events) {
  const seen = new Set();
  const result = [];

  for (const event of events || []) {
    if (!event?.eventId || seen.has(event.eventId)) continue;
    seen.add(event.eventId);
    result.push(event);
  }

  return result;
}

function isMinorRumorEvent(event = {}) {
  return (
    event.eventLayer === EVENT_LAYERS.MINOR_RUMOR ||
    (event.countsAsMainEvent === false && (event.tags || []).includes("minor_rumor"))
  );
}

function isBackgroundEvent(event = {}) {
  return event.eventLayer === EVENT_LAYERS.BACKGROUND;
}

function summarizeTechnicalReadiness({
  gameState,
  weatherSummary,
  jobContractSummary,
  activeMissionSummaries,
  availableMissionPreview,
  missionAgenda,
  guildState,
  worldFriction,
  npcKnowledgeContext,
  mainEventSummary,
  minorRumorEventSummaries,
  backgroundEventSummaries,
  pendingCommitmentSummaries,
  pendingBiologicalAccumulations,
  stalePendingBiologicalAccumulations,
  alerts,
  narrativeContext,
  socialRhythm,
} = {}) {
  const warningAlerts = (alerts || []).filter((alert) => alert.severity === "warning");
  const infoAlerts = (alerts || []).filter((alert) => alert.severity !== "warning");
  const nextShift = jobContractSummary?.schedule?.nextShift || null;
  const openMissionNeedingProof = (activeMissionSummaries || []).filter(
    (mission) => mission.status === "accepted" && ["pending", "submitted"].includes(mission.proofStatus)
  );

  return {
    schemaVersion: "technical_summary_v1",
    generatedFor: "modo_tecnico_o_debug",
    clock: {
      day: gameState.currentDay,
      date: gameState.diegeticDate,
      block: gameState.block,
      time: gameState.time,
      locationId: gameState.locationId,
    },
    eventState: {
      mainEvent: mainEventSummary
        ? {
            eventId: mainEventSummary.eventId,
            title: mainEventSummary.title,
            status: mainEventSummary.status,
            severity: mainEventSummary.severity,
            start: {
              day: mainEventSummary.startDay,
              time: mainEventSummary.startTime,
            },
            end: {
              day: mainEventSummary.endDay,
              time: mainEventSummary.endTime,
            },
          }
        : null,
      minorRumorCount: (minorRumorEventSummaries || []).length,
      backgroundEventCount: (backgroundEventSummaries || []).length,
    },
    missionState: {
      activeCount: (activeMissionSummaries || []).length,
      availableCount: (availableMissionPreview || []).length,
      proofOrReportPendingMissionIds: openMissionNeedingProof.map((mission) => mission.missionId),
      awaitingVerificationIds: missionAgenda?.awaitingVerification?.map((mission) => mission.missionId) || [],
      readyToCompleteIds: missionAgenda?.readyToComplete?.map((mission) => mission.missionId) || [],
      rejectedProofIds: missionAgenda?.proofRejected?.map((mission) => mission.missionId) || [],
      acceptedExpiredIds: missionAgenda?.acceptedExpired?.map((mission) => mission.missionId) || [],
      availableExpiringSoonIds: missionAgenda?.availableExpiringSoon?.map((mission) => mission.missionId) || [],
      guild: guildState || null,
    },
    commitmentState: {
      pendingCount: (pendingCommitmentSummaries || []).length,
      dueNowOrOverdueIds: (pendingCommitmentSummaries || [])
        .filter((commitment) => ["due_now", "overdue"].includes(commitment.dueStatus))
        .map((commitment) => commitment.commitmentId),
      consequenceReadyIds: (pendingCommitmentSummaries || [])
        .filter((commitment) => commitment.consequencePreview?.pastGrace)
        .map((commitment) => commitment.commitmentId),
      needsResolutionIds: (pendingCommitmentSummaries || [])
        .filter((commitment) => commitment.consequencePreview?.requiresExplicitResolution)
        .map((commitment) => commitment.commitmentId),
    },
    jobState: jobContractSummary
      ? {
          contractId: jobContractSummary.contractId,
          title: jobContractSummary.title,
          nextShiftId: nextShift?.shiftId || "",
          unresolvedAttendance: (jobContractSummary.schedule?.attendance?.unresolved || []).map((entry) => ({
            shiftId: entry.shiftId,
            status: entry.status,
            day: entry.day,
            time: entry.time,
            consequenceLevel: entry.consequenceLevel,
            consequenceSummary: entry.consequenceSummary,
          })),
          futureShiftChanges: (jobContractSummary.schedule?.futureChanges || []).map((shift) => ({
            shiftId: shift.shiftId,
            inactiveFromDay: shift.inactiveFromDay,
            reason: shift.reason || shift.inactiveReason || "",
          })),
        }
      : null,
    biologyState: {
      pendingCount: (pendingBiologicalAccumulations || []).length,
      stalePendingCount: (stalePendingBiologicalAccumulations || []).length,
    },
    weatherState: weatherSummary
      ? {
          condition: weatherSummary.currentCondition,
          staleByCurrentTime: Boolean(weatherSummary.staleByCurrentTime),
          expectedUntilDay: weatherSummary.expectedUntilDay,
          expectedUntilTime: weatherSummary.expectedUntilTime,
      }
      : null,
    worldFrictionState: worldFriction
      ? {
          economyPressure: Boolean(worldFriction.economy?.hasPressure),
          travelPressure: Boolean(worldFriction.travel?.hasPressure),
          weatherMultiplier: worldFriction.weather?.exteriorTravelTimeMultiplier || 1,
          lowStockCount: worldFriction.economy?.lowStock?.length || 0,
          outOfStockCount: worldFriction.economy?.outOfStock?.length || 0,
          guidance: worldFriction.guidance || [],
        }
      : null,
    narrativeState: narrativeContext || null,
    socialRhythmState: socialRhythm
      ? {
          saturatedNpcIds: socialRhythm.saturatedNpcIds || [],
          npcCount: (socialRhythm.npcs || []).length,
          globalGuidance: socialRhythm.globalGuidance || "",
        }
      : null,
    knowledgeState: npcKnowledgeContext
      ? {
          scheduleUnconfirmedNpcIds: npcKnowledgeContext.scheduleUnconfirmedNpcIds || [],
          mechanicalOnlyBoundaries: npcKnowledgeContext.mechanicalOnlyBoundaries || [],
          npcCount: (npcKnowledgeContext.perNpc || []).length,
        }
      : null,
    alertSummary: {
      warnings: warningAlerts.map((alert) => alert.type || alert.code || alert.message),
      infos: infoAlerts.map((alert) => alert.type || alert.code || alert.message),
    },
    recommendedChecks: [
      warningAlerts.length > 0 ? "Resolver o tener en cuenta alertas warning antes de acciones largas." : "",
      weatherSummary?.staleByCurrentTime ? "Actualizar clima antes de viajes o escenas exteriores." : "",
      (pendingBiologicalAccumulations || []).length > 0 ? "Cerrar acumuladores biologicos al cruzar la proxima hora exacta." : "",
      mainEventSummary?.status === "active" ? "Si el evento principal se atiende, cerrarlo con worldEventPatches y resolutionSummary." : "",
      (pendingCommitmentSummaries || []).some((commitment) => commitment.consequencePreview?.pastGrace)
        ? "Cerrar compromisos vencidos con fulfill/fail/cancel/expire antes de saltar mas tiempo."
        : "",
      (socialRhythm?.saturatedNpcIds || []).length > 0
        ? "Evitar nuevos deltas sociales por rutina con NPCs saturados hoy; usar textura o memoria."
        : "",
      (jobContractSummary?.schedule?.attendance?.unresolved || []).length > 0
        ? "Cerrar seguimientos laborales pendientes con consecuencia explicita o marcar consecuenciaApplied."
        : "",
      missionAgenda?.proofRejected?.length > 0 || missionAgenda?.acceptedExpired?.length > 0
        ? "Resolver misiones con prueba rechazada o vencida antes de saltar escenas largas."
        : "",
      missionAgenda?.awaitingVerification?.length > 0
        ? "Verificar reportes de mision antes de completar o pagar recompensa."
        : "",
      (worldFriction?.guidance || []).length > 0
        ? "Revisar worldFriction antes de resolver compras, viajes o consecuencias de clima."
        : "",
    ].filter(Boolean),
  };
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function toAbsoluteMinutes(day, time) {
  return (Number(day || 1) - 1) * 1440 + timeToMinutes(time);
}

function minutesToTime(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getHourBlockForTime(time) {
  const blockStartMinutes = Math.floor(timeToMinutes(time) / 60) * 60;
  const blockStart = minutesToTime(blockStartMinutes);
  const blockEnd = minutesToTime(blockStartMinutes + 60);
  return { blockStart, blockEnd };
}

function getRelevantPendingAccumulations(gameState) {
  const pending = gameState.biologicalClock?.pendingAccumulations || [];
  const currentBlock = getHourBlockForTime(gameState.time);

  return pending.filter(
    (entry) =>
      entry &&
      entry.status !== "processed" &&
      !entry.processedAt &&
      entry.day === gameState.currentDay &&
      entry.blockStart === currentBlock.blockStart &&
      entry.blockEnd === currentBlock.blockEnd
  );
}

function getStalePendingAccumulations(gameState) {
  const pending = gameState.biologicalClock?.pendingAccumulations || [];
  const now = toAbsoluteMinutes(gameState.currentDay, gameState.time);

  return pending.filter((entry) => {
    if (!entry || entry.status === "processed" || entry.processedAt) return false;
    if (!entry.day || !entry.blockEnd) return false;

    return toAbsoluteMinutes(entry.day, entry.blockEnd) < now;
  });
}

function commitmentAgendaEntry(commitment) {
  return {
    commitmentId: commitment.commitmentId,
    title: commitment.title,
    type: commitment.type,
    promiseType: commitment.promiseType || "none",
    promiseStrength: commitment.promiseStrength || "none",
    status: commitment.status,
    priority: commitment.priority,
    dueDay: commitment.dueDay,
    dueTime: commitment.dueTime || "",
    dueStatus: commitment.dueStatus,
    urgency: commitment.urgency,
    nextCheckDay: commitment.nextCheckDay,
    nextCheckTime: commitment.nextCheckTime || "",
    nextCheckStatus: commitment.nextCheckStatus || "none",
    blockerSummary: commitment.blockerSummary || "",
    conditionSummary: commitment.conditionSummary || "",
    dormantUntilDay: commitment.dormantUntilDay,
    dormantUntilTime: commitment.dormantUntilTime || "",
    dormantStatus: commitment.dormantStatus || "none",
    speakerNpcId: commitment.speakerNpcId || "",
    responsibleNpcId: commitment.responsibleNpcId || "",
    responsibleFactionId: commitment.responsibleFactionId || "",
    reviewPlan: commitment.reviewPlan || null,
    targetNpcIds: commitment.targetNpcIds || [],
    relatedEventIds: commitment.relatedEventIds || [],
    relatedMissionIds: commitment.relatedMissionIds || [],
    consequencePreview: commitment.consequencePreview
      ? {
          severity: commitment.consequencePreview.severity,
          pastGrace: Boolean(commitment.consequencePreview.pastGrace),
          requiresExplicitResolution: Boolean(commitment.consequencePreview.requiresExplicitResolution),
          recommendedAction: commitment.consequencePreview.recommendedAction || "",
        }
      : null,
  };
}

function buildCommitmentAgenda(commitments = []) {
  const byUrgency = (urgency) => commitments.filter((commitment) => commitment.urgency === urgency);
  const consequenceReady = commitments.filter((commitment) => commitment.consequencePreview?.pastGrace);
  const immediateResolutionUrgencies = new Set([
    "consequence_ready",
    "overdue_in_grace",
    "due_now",
    "review_overdue",
    "review_due",
  ]);
  const needsResolution = commitments.filter(
    (commitment) =>
      commitment.consequencePreview?.requiresExplicitResolution &&
      immediateResolutionUrgencies.has(commitment.urgency)
  );

  return {
    consequenceReady: consequenceReady.map(commitmentAgendaEntry),
    overdue: byUrgency("consequence_ready").concat(byUrgency("overdue_in_grace")).map(commitmentAgendaEntry),
    dueNow: byUrgency("due_now").map(commitmentAgendaEntry),
    dueSoon: byUrgency("due_soon").concat(byUrgency("upcoming")).map(commitmentAgendaEntry),
    reviewDue: byUrgency("review_overdue").concat(byUrgency("review_due")).map(commitmentAgendaEntry),
    reviewSoon: byUrgency("review_soon").map(commitmentAgendaEntry),
    needsSchedule: byUrgency("needs_schedule").map(commitmentAgendaEntry),
    conditionalDormant: byUrgency("conditional_dormant").map(commitmentAgendaEntry),
    unscheduledImportant: commitments.filter(
      (commitment) =>
        commitment.dueStatus === "unscheduled" && ["critical", "high"].includes(commitment.priority)
    ).map(commitmentAgendaEntry),
    needsResolution: needsResolution.map(commitmentAgendaEntry),
    next: commitments.slice(0, 5).map(commitmentAgendaEntry),
  };
}

function commitmentScheduleAbs(commitment) {
  const candidates = [];
  if (commitment?.dueDay) candidates.push(toAbsoluteMinutes(commitment.dueDay, commitment.dueTime || "23:59"));
  if (commitment?.nextCheckDay) {
    candidates.push(toAbsoluteMinutes(commitment.nextCheckDay, commitment.nextCheckTime || "23:59"));
  }
  return candidates.length > 0 ? Math.min(...candidates) : Number.MAX_SAFE_INTEGER;
}

function missionAgendaEntry(mission) {
  return {
    missionId: mission.missionId,
    title: mission.title,
    status: mission.status,
    proofStatus: mission.proofStatus,
    rank: mission.rank,
    riskLevel: mission.riskLevel,
    clientNpcId: mission.clientNpcId || "",
    locationId: mission.locationId || "",
    expiresDay: mission.expiresDay,
    expiresTime: mission.expiresTime || "",
    actionState: mission.actionState || null,
  };
}

function buildMissionAgenda({ activeMissions = [], availableMissions = [] } = {}) {
  const byAction = (missions, key) => missions.filter((mission) => mission.actionState?.key === key);
  const acceptedExpired = byAction(activeMissions, "accepted_expired");
  const proofRejected = byAction(activeMissions, "proof_rejected");
  const awaitingVerification = byAction(activeMissions, "awaiting_verification");
  const readyToComplete = byAction(activeMissions, "ready_to_complete");
  const needsReport = byAction(activeMissions, "needs_report");
  const availableExpiringSoon = byAction(availableMissions, "available_expiring_soon");

  return {
    schemaVersion: "mission_agenda_v1",
    acceptedExpired: acceptedExpired.map(missionAgendaEntry),
    proofRejected: proofRejected.map(missionAgendaEntry),
    awaitingVerification: awaitingVerification.map(missionAgendaEntry),
    readyToComplete: readyToComplete.map(missionAgendaEntry),
    needsReport: needsReport.map(missionAgendaEntry),
    availableExpiringSoon: availableExpiringSoon.map(missionAgendaEntry),
    next: [
      ...acceptedExpired,
      ...proofRejected,
      ...awaitingVerification,
      ...readyToComplete,
      ...needsReport,
      ...availableExpiringSoon,
    ]
      .slice(0, 6)
      .map(missionAgendaEntry),
    globalGuidance:
      acceptedExpired.length || proofRejected.length
        ? "Hay misiones con cierre o consecuencia pendiente: no saltar escenas largas sin resolver fail/expire/correccion."
        : awaitingVerification.length
          ? "Hay reportes entregados: verificar antes de completar o pagar."
          : readyToComplete.length
            ? "Hay misiones listas para cierre formal y recompensa idempotente."
            : "No hay bloqueo critico de mision en la agenda compacta.",
  };
}

function buildGuildState(gameState = {}, guildFaction = null) {
  const flags = gameState.flags && typeof gameState.flags === "object" ? gameState.flags : {};
  const guild = flags.guild && typeof flags.guild === "object" ? flags.guild : {};
  const relationship = guildFaction?.relationshipWithLucas || {};
  return {
    formalGuildRegistrationPending: Boolean(flags.formalGuildRegistrationPending),
    mg: Number.isInteger(guild.mg) ? guild.mg : 0,
    rank: guild.rank || guild.currentRank || "",
    registrationStatus: flags.formalGuildRegistrationPending ? "pending" : "available_or_complete",
    factionId: guildFaction?.factionId || "faction_hoshimori_guild",
    factionName: guildFaction?.name || "Gremio local de Hoshimori",
    institutionalStanding: guildFaction
      ? {
          reputation: relationship.reputation || 0,
          trust: relationship.trust || 0,
          suspicion: relationship.suspicion || 0,
          institutionalCredit: relationship.institutionalCredit || 0,
          merit: relationship.merit || 0,
          accessLevel: relationship.accessLevel || "basic",
          notes: relationship.notes || "",
        }
      : null,
  };
}

function summarizePositiveSocialDeltas(entries = []) {
  const totals = {};
  for (const entry of entries) {
    for (const [field, value] of Object.entries(entry.appliedDeltas || {})) {
      const delta = Number(value) || 0;
      if (delta > 0) totals[field] = (totals[field] || 0) + delta;
    }
  }
  return totals;
}

function countSocialActionTypes(entries = []) {
  const counts = {};
  for (const entry of entries) {
    const actionType = entry.actionType || "general";
    counts[actionType] = (counts[actionType] || 0) + 1;
  }
  return counts;
}

function buildNpcSocialSceneGuidance({ npc, entries, actionTypeCounts, positiveDeltas }) {
  const repeatedActionTypes = Object.entries(actionTypeCounts)
    .filter(([, count]) => count >= 2)
    .map(([actionType]) => actionType);
  const cappedWarnings = entries.flatMap((entry) => entry.caps?.warnings || []);
  const availabilityStatus = npc.availability?.status || "";
  const busy = ["busy", "working", "unavailable"].includes(availabilityStatus);
  const entryCount = entries.length;
  const positiveFieldCount = Object.keys(positiveDeltas).length;

  let mode = "open";
  let guidance = "Puede reaccionar segun personalidad y contexto; avance numerico solo si hay novedad real.";

  if (cappedWarnings.length > 0 || repeatedActionTypes.length > 0 || entryCount >= 3) {
    mode = "saturated_today";
    guidance = "Ya hubo interaccion social suficiente hoy; preferir gesto, continuidad o memoria sin subir numeros.";
  } else if (entryCount > 0 || positiveFieldCount > 0) {
    mode = "warm_continuity";
    guidance = "Mostrar continuidad del trato sin repetir el mismo agradecimiento ni volver cada ayuda una sorpresa.";
  }

  if (busy) {
    guidance = `${guidance} El NPC esta ocupado: usar respuestas breves, practicas o no verbales.`;
  }

  return {
    mode,
    repeatedActionTypes,
    cappedWarnings,
    busy,
    guidance,
    dialogueMode:
      mode === "saturated_today"
        ? "gesture_or_short_line"
        : busy
          ? "brief_practical_line"
          : "natural_if_scene_needs_it",
  };
}

function buildSocialRhythm({ nearbyNpcSummaries = [], todaySocialLedger = [], gameState = {} } = {}) {
  const ledgerByNpc = new Map();
  for (const entry of todaySocialLedger || []) {
    if (!entry?.npcId) continue;
    if (!ledgerByNpc.has(entry.npcId)) ledgerByNpc.set(entry.npcId, []);
    ledgerByNpc.get(entry.npcId).push(entry);
  }

  const npcs = nearbyNpcSummaries.slice(0, 10).map((npc) => {
    const entries = ledgerByNpc.get(npc.npcId) || [];
    const actionTypeCounts = countSocialActionTypes(entries);
    const positiveDeltas = summarizePositiveSocialDeltas(entries);
    const guidance = buildNpcSocialSceneGuidance({
      npc,
      entries,
      actionTypeCounts,
      positiveDeltas,
    });

    return {
      npcId: npc.npcId,
      name: npc.name,
      currentTask: npc.currentTask || "",
      availability: {
        status: npc.availability?.status || "",
        reason: npc.availability?.reason || "",
      },
      relationshipBands: {
        trust: npc.relationshipBands?.trust?.label || "",
        familiarity: npc.relationshipBands?.familiarity?.label || "",
        respect: npc.relationshipBands?.respect?.label || "",
      },
      today: {
        entryCount: entries.length,
        actionTypeCounts,
        positiveDeltas,
      },
      sceneGuidance: guidance,
      nextThresholds: (npc.relationshipState?.nextThresholds || []).slice(0, 3),
      narrativeGuidance: (npc.relationshipState?.narrativeGuidance || []).slice(0, 3),
    };
  });

  const saturatedNpcIds = npcs
    .filter((npc) => npc.sceneGuidance.mode === "saturated_today")
    .map((npc) => npc.npcId);

  return {
    schemaVersion: "social_rhythm_v1",
    day: gameState.currentDay,
    time: gameState.time,
    saturatedNpcIds,
    npcs,
    globalGuidance:
      saturatedNpcIds.length > 0
        ? "Hay NPCs con interaccion social repetida hoy: si la escena es rutina, usar textura o memoria y evitar nuevos deltas numericos."
        : "No hay saturacion social cercana; aun asi, los cambios numericos requieren accion significativa y validacion.",
  };
}

async function getFullContext(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        ok: false,
        error: "MongoDB no está conectado. Configurá MONGODB_URI para usar /api/context/full.",
      });
    }

    const gameId = req.query.gameId || "isekai_lucas_main";
    const recentLogLimit = responseShaping.toIntQuery(req.query.logLimit, 10, 0, 30);
    const includeMechanicalChanges = responseShaping.queryBoolean(req.query.includeMechanicalChanges, false);

    const gameState = await GameState.findOne({ gameId }).lean();

    if (!gameState) {
      return res.status(404).json({
        ok: false,
        error: `No existe GameState para gameId: ${gameId}`,
      });
    }

    const currentLocationId = gameState.locationId;
    const activeEventIds = gameState.activeEventIds || [];
    const activeMissionIds = gameState.activeMissionIds || [];
    const pendingBiologicalAccumulations = getRelevantPendingAccumulations(gameState);

    const [lucas, currentLocation] = await Promise.all([
      Character.findOne({ characterId: gameState.characterId }).lean(),
      Location.findOne({ locationId: currentLocationId }).lean(),
    ]);

    const parentLocation = currentLocation?.parentLocationId
      ? await Location.findOne({ locationId: currentLocation.parentLocationId }).lean()
      : null;

    const locationIds = unique([
      currentLocationId,
      currentLocation?.parentLocationId,
      parentLocation?.parentLocationId,
    ]);

    const locationNpcIds = unique([
      ...(currentLocation?.visibleNpcIds || []),
      ...(currentLocation?.probableNpcIds || []),
      ...(parentLocation?.visibleNpcIds || []),
      ...(parentLocation?.probableNpcIds || []),
    ]);

    const nearbyNpcs = await Npc.find({
      $or: [
        { currentLocationId: { $in: locationIds } },
        { npcId: { $in: locationNpcIds } },
      ],
    })
      .sort({ name: 1 })
      .limit(40)
      .lean();

    const nearbyNpcIds = nearbyNpcs.map((npc) => npc.npcId);

    const shops = await Shop.find({
      locationId: { $in: locationIds },
    })
      .sort({ name: 1 })
      .lean();

    const shopIds = shops.map((shop) => shop.shopId);

    const [
      shopStocks,
      relevantNpcMemories,
      activeEvents,
      activeRumors,
      missions,
      recentEventLogs,
      routineOverrides,
      activeCombatEncounters,
      socialRelationships,
    ] = await Promise.all([
      ShopStock.find({
        shopId: { $in: shopIds },
      })
        .sort({ shopId: 1, itemId: 1 })
        .lean(),

      NpcMemory.find({
        npcId: { $in: nearbyNpcIds },
        importance: { $in: ["normal", "important", "critical"] },
      })
        .sort({ importance: -1, createdDay: -1, createdTime: -1 })
        .limit(50)
        .lean(),

      WorldEvent.find({
        $and: [
          eventGameFilter(gameId),
          {
            $or: [
              { eventId: { $in: activeEventIds } },
              { status: { $in: ["active", "scheduled"] }, affectedLocationIds: { $in: locationIds } },
              { status: { $in: ["active", "scheduled"] }, affectedNpcIds: { $in: nearbyNpcIds } },
            ],
          },
        ],
      })
        .sort({ startDay: 1, startTime: 1 })
        .limit(30)
        .lean(),

      Rumor.find({
        status: "active",
        $or: [
          { locationIds: { $in: locationIds } },
          { knownByNpcIds: { $in: nearbyNpcIds } },
        ],
      })
        .sort({ createdDay: -1, createdTime: -1 })
        .limit(30)
        .lean(),

      Mission.find({
        $or: [
          { missionId: { $in: activeMissionIds } },
          { status: "available" },
          { status: "accepted", acceptedByCharacterId: gameState.characterId },
        ],
      })
        .sort({ postedDay: -1, postedTime: -1 })
        .limit(30)
        .lean(),

      EventLog.find({
        gameId,
        day: { $gte: Math.max(1, gameState.currentDay - 3) },
        type: { $not: /^test_/i },
        summary: { $not: /prueba|rollback|entreno cortando/i },
      })
        .sort({ day: -1, timeStart: -1 })
        .limit(recentLogLimit)
        .lean(),

      RoutineOverride.find({
        npcId: { $in: nearbyNpcIds },
        day: gameState.currentDay,
        status: { $in: ["scheduled", "active"] },
      })
        .sort({ timeStart: 1 })
        .limit(30)
        .lean(),

      CombatEncounter.find({
        gameId,
        status: "active",
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      NpcRelationship.find({
        $or: [
          { npcAId: { $in: nearbyNpcIds } },
          { npcBId: { $in: nearbyNpcIds } },
        ],
      })
        .sort({ familiarity: -1, trust: -1 })
        .limit(80)
        .lean(),
    ]);

    const itemIds = unique(shopStocks.map((stock) => stock.itemId));

    const stockItems = itemIds.length
      ? await Item.find({ itemId: { $in: itemIds } }).sort({ name: 1 }).lean()
      : [];

    const factionIds = unique([
      currentLocation?.controllingFactionId,
      parentLocation?.controllingFactionId,
      ...shops.map((shop) => shop.factionId),
      ...nearbyNpcs.flatMap((npc) => (npc.factionLinks || []).map((link) => link.factionId)),
      ...missions.map((mission) => mission.sourceFactionId),
    ]);

    const factionSummaries = factionIds.length
      ? await Faction.find({ factionId: { $in: factionIds } }).sort({ name: 1 }).lean()
      : [];

    return res.json({
      ok: true,
      context: {
        gameState,
        lucas,
        currentLocation,
        parentLocation,
        locationScope: locationIds,
        nearbyNpcs,
        relevantNpcMemories,
        activeEvents,
        activeRumors,
        missions,
        shops,
        shopStocks,
        stockItems,
        factionSummaries,
        socialRelationships,
        routineOverrides,
        activeCombatEncounters,
        pendingBiology: pendingBiologicalAccumulations,
        pendingBiologicalAccumulations,
        recentEventLogs: includeMechanicalChanges
          ? recentEventLogs
          : recentEventLogs.map((log) => responseShaping.summarizeEventLog(log)),
        coherenceWarnings: [],
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error obteniendo contexto completo.",
      details: error.message,
    });
  }
}

async function getCompactContext(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        ok: false,
        error: "MongoDB no esta conectado. Configura MONGODB_URI para usar /api/context/compact.",
      });
    }

    const gameId = req.query.gameId || "isekai_lucas_main";
    const includeTechnicalSummary = responseShaping.queryBoolean(req.query.includeTechnicalSummary, false);
    const profile = normalizeCompactProfile(req.query.profile, includeTechnicalSummary);
    const defaultLimits = compactProfileDefaults(profile);
    const capLimits = compactProfileCaps(profile);
    const limits = {
      npcLimit: responseShaping.toIntQuery(req.query.npcLimit, defaultLimits.npcLimit, 1, capLimits.npcLimit),
      memoryLimit: responseShaping.toIntQuery(req.query.memoryLimit, defaultLimits.memoryLimit, 0, capLimits.memoryLimit),
      rumorLimit: responseShaping.toIntQuery(req.query.rumorLimit, defaultLimits.rumorLimit, 0, capLimits.rumorLimit),
      missionLimit: responseShaping.toIntQuery(req.query.missionLimit, defaultLimits.missionLimit, 0, capLimits.missionLimit),
      eventLimit: responseShaping.toIntQuery(req.query.eventLimit, defaultLimits.eventLimit, 0, capLimits.eventLimit),
      logLimit: responseShaping.toIntQuery(req.query.logLimit, defaultLimits.logLimit, 0, capLimits.logLimit),
      commitmentLimit: responseShaping.toIntQuery(
        req.query.commitmentLimit,
        defaultLimits.commitmentLimit,
        0,
        capLimits.commitmentLimit
      ),
    };

    const gameState = await GameState.findOne({ gameId }).lean();

    if (!gameState) {
      return res.status(404).json({
        ok: false,
        error: `No existe GameState para gameId: ${gameId}`,
      });
    }

    const currentLocationId = gameState.locationId;
    const activeEventIds = gameState.activeEventIds || [];
    const activeMissionIds = gameState.activeMissionIds || [];
    const includeTestSuiteMissions = shouldIncludeTestSuiteMissions({
      gameId,
      includeTestSuite: responseShaping.queryBoolean(req.query.includeTestSuite, false),
    });
    const pendingBiologicalAccumulations = getRelevantPendingAccumulations(gameState);
    const stalePendingBiologicalAccumulations = getStalePendingAccumulations(gameState);

    const [lucas, currentLocation] = await Promise.all([
      Character.findOne({ characterId: gameState.characterId }).lean(),
      Location.findOne({ locationId: currentLocationId }).lean(),
    ]);

    const parentLocation = currentLocation?.parentLocationId
      ? await Location.findOne({ locationId: currentLocation.parentLocationId }).lean()
      : null;

    const locationIds = unique([
      currentLocationId,
      currentLocation?.parentLocationId,
      parentLocation?.parentLocationId,
    ]);

    const directVisibleNpcIds = currentLocation?.visibleNpcIds || [];
    const probableNpcIds = unique([
      ...(currentLocation?.probableNpcIds || []),
      ...(parentLocation?.probableNpcIds || []),
    ]);
    const staticLocationNpcIds = unique([
      ...directVisibleNpcIds,
      probableNpcIds,
      ...(parentLocation?.visibleNpcIds || []),
    ].flat());

    const nearbyNpcs = await Npc.find({
      $or: [
        { currentLocationId: { $in: locationIds } },
        { npcId: { $in: staticLocationNpcIds } },
      ],
    })
      .sort({ name: 1 })
      .limit(limits.npcLimit)
      .lean();

    const nearbyNpcIds = nearbyNpcs.map((npc) => npc.npcId);
    const regionId =
      req.query.regionId ||
      currentLocation?.regionId ||
      parentLocation?.regionId ||
      "region_hoshimori";

    const nearbyShops = locationIds.length
      ? await Shop.find({
          locationId: { $in: locationIds },
        })
          .sort({ status: 1, name: 1 })
          .limit(10)
          .lean()
      : [];
    const nearbyShopIds = nearbyShops.map((shop) => shop.shopId);
    const nearbyShopStockLimit = profile === "debug_audit" ? 80 : profile === "minimal_header" ? 24 : 48;
    const nearbyFactionIds = unique([
      currentLocation?.controllingFactionId,
      parentLocation?.controllingFactionId,
      ...nearbyShops.map((shop) => shop.factionId),
      ...nearbyNpcs.flatMap((npc) => (npc.factionLinks || []).map((link) => link.factionId)),
    ]);
    const nearbyShopStocks = nearbyShopIds.length
      ? await ShopStock.find({
          shopId: { $in: nearbyShopIds },
        })
          .sort({ shopId: 1, itemId: 1 })
          .limit(nearbyShopStockLimit)
          .lean()
      : [];
    const inventoryItemIds = unique([
      ...(gameState.inventory || []).map((entry) => entry.itemId),
      ...nearbyShopStocks.map((stock) => stock.itemId),
    ]);

    const eventClauses = [];
    if (activeEventIds.length > 0) eventClauses.push({ eventId: { $in: activeEventIds } });
    if (locationIds.length > 0) {
      eventClauses.push({
        status: { $in: ["active", "scheduled"] },
        affectedLocationIds: { $in: locationIds },
      });
    }
    if (nearbyNpcIds.length > 0) {
      eventClauses.push({
        status: { $in: ["active", "scheduled"] },
        affectedNpcIds: { $in: nearbyNpcIds },
      });
    }

    const rumorClauses = [];
    if (locationIds.length > 0) rumorClauses.push({ locationIds: { $in: locationIds } });
    if (nearbyNpcIds.length > 0) rumorClauses.push({ knownByNpcIds: { $in: nearbyNpcIds } });

    const activeMissionClauses = [
      { status: "accepted", acceptedByCharacterId: gameState.characterId },
    ];
    if (activeMissionIds.length > 0) activeMissionClauses.push({ missionId: { $in: activeMissionIds } });

    const knowledgeClauses = [{ visibility: "public" }];
    if (nearbyNpcIds.length > 0) knowledgeClauses.push({ holderNpcIds: { $in: nearbyNpcIds } });
    if (nearbyFactionIds.length > 0) knowledgeClauses.push({ holderFactionIds: { $in: nearbyFactionIds } });
    if (activeEventIds.length > 0) knowledgeClauses.push({ relatedEventIds: { $in: activeEventIds } });
    if (activeMissionIds.length > 0) knowledgeClauses.push({ relatedMissionIds: { $in: activeMissionIds } });

    const activeMissionQuery = applyMissionEnvironmentFilter(
      { $or: activeMissionClauses },
      { gameId, includeTestSuite: includeTestSuiteMissions }
    );
    const availableMissionQuery = applyMissionEnvironmentFilter(
      { status: "available" },
      { gameId, includeTestSuite: includeTestSuiteMissions }
    );
    const socialLedgerLimit = profile === "debug_audit" ? 20 : profile === "minimal_header" ? 4 : 10;
    const knowledgeRecordLimit = profile === "debug_audit" ? 40 : profile === "minimal_header" ? 12 : 24;
    const narrativeContextLimit = profile === "debug_audit" ? 30 : profile === "minimal_header" ? 8 : 18;
    const memoryFetchLimit =
      profile === "debug_audit"
        ? limits.memoryLimit
        : Math.min(40, Math.max(limits.memoryLimit * 4, nearbyNpcIds.length * 3, limits.memoryLimit));

    const [
      inventoryItems,
      rawRelevantNpcMemories,
      activeEvents,
      dailyEvents,
      layeredWorldEvents,
      activeRumors,
      activeMissions,
      availableMissions,
      recentEventLogs,
      routineOverrides,
      nearbyNpcRelationships,
      activeCombatEncounters,
      weather,
      jobContract,
      todaySocialLedger,
      pendingCommitments,
      carriedEvidence,
      knowledgeRecords,
      guildFaction,
    ] = await Promise.all([
      inventoryItemIds.length
        ? Item.find({ itemId: { $in: inventoryItemIds } }).sort({ name: 1 }).lean()
        : Promise.resolve([]),

      nearbyNpcIds.length && limits.memoryLimit > 0
        ? NpcMemory.find({
            npcId: { $in: nearbyNpcIds },
            importance: { $in: ["normal", "important", "critical"] },
          })
            .sort({ importance: -1, createdDay: -1, createdTime: -1 })
            .limit(memoryFetchLimit)
            .lean()
        : Promise.resolve([]),

      eventClauses.length && limits.eventLimit > 0
        ? WorldEvent.find({
            $and: [
              eventGameFilter(gameId),
              { $or: eventClauses },
            ],
          })
            .sort({ startDay: 1, startTime: 1 })
            .limit(limits.eventLimit)
            .lean()
        : Promise.resolve([]),

      limits.eventLimit > 0
        ? WorldEvent.find({
            ...eventGameFilter(gameId),
            $and: [mainEventQuery()],
            status: { $in: ["scheduled", "active", "resolved", "expired", "consequences_applied"] },
          })
            .sort({ startDay: -1, startTime: 1 })
            .limit(Math.min(limits.eventLimit, 6))
            .lean()
        : Promise.resolve([]),

      eventClauses.length && limits.eventLimit > 0
        ? WorldEvent.find({
            $and: [
              eventGameFilter(gameId),
              {
                eventLayer: { $in: [EVENT_LAYERS.MINOR_RUMOR, EVENT_LAYERS.BACKGROUND] },
                status: { $in: ["scheduled", "active"] },
              },
              { $or: eventClauses },
            ],
          })
            .sort({ startDay: -1, startTime: 1 })
            .limit(limits.eventLimit)
            .lean()
        : Promise.resolve([]),

      rumorClauses.length && limits.rumorLimit > 0
        ? Rumor.find({
            status: "active",
            $or: rumorClauses,
          })
            .sort({ createdDay: -1, createdTime: -1 })
            .limit(limits.rumorLimit)
            .lean()
        : Promise.resolve([]),

      Mission.find(activeMissionQuery)
        .sort({ postedDay: -1, postedTime: -1 })
        .limit(limits.missionLimit)
        .lean(),

      limits.missionLimit > 0
        ? Mission.find(availableMissionQuery)
            .sort({ postedDay: -1, postedTime: -1 })
            .limit(Math.max(limits.missionLimit * 4, limits.missionLimit))
            .lean()
        : Promise.resolve([]),

      limits.logLimit > 0
        ? EventLog.find({
            gameId,
            day: { $gte: Math.max(1, gameState.currentDay - 2) },
            type: { $not: /^test_/i },
            summary: { $not: /prueba|rollback|entreno cortando|test biologico/i },
            visibility: { $ne: "hidden" },
          })
            .sort({ day: -1, timeStart: -1 })
            .limit(limits.logLimit)
            .lean()
        : Promise.resolve([]),

      nearbyNpcIds.length
        ? RoutineOverride.find({
            npcId: { $in: nearbyNpcIds },
            day: gameState.currentDay,
            status: { $in: ["scheduled", "active"] },
          })
            .sort({ timeStart: 1 })
            .limit(10)
            .lean()
        : Promise.resolve([]),

      nearbyNpcIds.length >= 2
        ? NpcRelationship.find({
            npcAId: { $in: nearbyNpcIds },
            npcBId: { $in: nearbyNpcIds },
          })
            .sort({ tension: -1, familiarity: -1, trust: -1 })
            .limit(24)
            .lean()
        : Promise.resolve([]),

      CombatEncounter.find({
        gameId,
        status: "active",
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),

      WeatherState.findOne({ regionId })
        .sort({ startedDay: -1, startedTime: -1 })
        .lean(),

      JobContract.findOne({
        characterId: gameState.characterId,
        status: "active",
      })
        .sort({ startDay: -1 })
        .lean(),

      nearbyNpcIds.length
        ? NpcSocialLedger.find({
            gameId,
            npcId: { $in: nearbyNpcIds },
            day: gameState.currentDay,
          })
            .sort({ createdAt: -1 })
            .limit(socialLedgerLimit)
            .lean()
        : Promise.resolve([]),

      limits.commitmentLimit > 0
        ? Commitment.find({
            gameId,
            status: { $in: ["pending", "active"] },
          })
            .sort({
              dueDay: 1,
              dueTime: 1,
              nextCheckDay: 1,
              nextCheckTime: 1,
              priority: -1,
              createdDay: -1,
              createdTime: -1,
            })
            .limit(Math.max(limits.commitmentLimit * 4, limits.commitmentLimit))
            .lean()
        : Promise.resolve([]),

      Evidence.find({
        gameId,
        status: { $in: ["observed", "collected", "stored", "reported"] },
        $or: [
          { holderType: "character", holderId: gameState.characterId || "char_lucas" },
          ...(activeEventIds.length
            ? [
                { sourceEventId: { $in: activeEventIds } },
                { relatedEventIds: { $in: activeEventIds } },
              ]
            : []),
          ...(activeMissionIds.length
            ? [
                { sourceMissionId: { $in: activeMissionIds } },
                { relatedMissionIds: { $in: activeMissionIds } },
              ]
            : []),
        ],
      })
        .sort({ updatedAt: -1, collectedDay: -1, collectedTime: -1 })
        .limit(8)
        .lean(),

      KnowledgeRecord.find({
        gameId,
        status: "active",
        $or: knowledgeClauses,
      })
        .sort({ createdDay: -1, createdTime: -1, updatedAt: -1 })
        .limit(knowledgeRecordLimit)
        .lean(),

      Faction.findOne({ factionId: "faction_hoshimori_guild" }).lean(),
    ]);

    const relevantNpcMemories = selectBalancedNpcMemories(
      rawRelevantNpcMemories,
      nearbyNpcIds,
      limits.memoryLimit,
      profile
    );

    const activeMissionSummaries = activeMissions.map((mission) =>
      responseShaping.summarizeMission(mission, gameState.currentDay, gameState.time)
    );
    const priorityWeight = { critical: 4, high: 3, normal: 2, low: 1 };
    const basePendingCommitmentSummaries = pendingCommitments
      .map((commitment) => responseShaping.summarizeCommitment(commitment, gameState.currentDay, gameState.time))
      .sort((left, right) => {
        const leftDue = commitmentScheduleAbs(left);
        const rightDue = commitmentScheduleAbs(right);
        if (leftDue !== rightDue) return leftDue - rightDue;
        return (priorityWeight[right.priority] || 0) - (priorityWeight[left.priority] || 0);
      })
      .slice(0, limits.commitmentLimit);
    const commitmentReviewPlans = buildCommitmentReviewPlans({
      commitments: basePendingCommitmentSummaries,
      gameState,
      fromDay: gameState.currentDay,
      fromTime: gameState.time,
      toDay: gameState.currentDay,
      toTime: gameState.time,
    });
    const reviewPlanByCommitmentId = new Map(
      commitmentReviewPlans.map((plan) => [plan.commitmentId, plan])
    );
    const pendingCommitmentSummaries = basePendingCommitmentSummaries.map((commitment) => ({
      ...commitment,
      reviewPlan: reviewPlanByCommitmentId.get(commitment.commitmentId) || null,
    }));
    const commitmentReviewAgenda = {
      schemaVersion: "commitment_review_agenda_v1",
      dueCount: commitmentReviewPlans.length,
      plans: commitmentReviewPlans.slice(0, 6),
      requiresApplyTurn: commitmentReviewPlans.length > 0,
      globalGuidance: commitmentReviewPlans.length
        ? "Hay revisiones offscreen listas: usar los parches sugeridos o una resolucion equivalente, no inventar el resultado por narracion."
        : "No hay revisiones offscreen vencidas en este momento.",
    };
    const commitmentAgenda = buildCommitmentAgenda(pendingCommitmentSummaries);
    const availableMissionSummaries = availableMissions
      .map((mission) => annotateMissionForBoard(mission, gameState))
      .map((mission) => responseShaping.summarizeMission(mission, gameState.currentDay, gameState.time));
    const availableMissionPreview = availableMissionSummaries
      .filter((mission) => !mission.expiredByCurrentTime)
      .slice(0, limits.missionLimit);
    const missionAgenda = buildMissionAgenda({
      activeMissions: activeMissionSummaries,
      availableMissions: availableMissionPreview,
    });
    const guildState = buildGuildState(gameState, guildFaction);
    const npcKnowledgeContext = buildNpcKnowledgeContext({
      nearbyNpcs,
      relevantNpcMemories,
      knowledgeRecords,
      jobContract,
      guildState,
    });
    const nearbyNpcSummaries = nearbyNpcs.map(responseShaping.summarizeNpc);
    const detailedNpcLimit = profile === "debug_audit" ? limits.npcLimit : Math.min(limits.npcLimit, 3);
    const nearbyNpcSummariesForResponse = nearbyNpcSummaries
      .slice(0, detailedNpcLimit)
      .map((npc) => slimNpcSummaryForProfile(npc, profile));
    const npcKnowledgeContextForResponse = slimNpcKnowledgeContextForProfile(npcKnowledgeContext, profile);
    const socialRhythm = buildSocialRhythm({
      nearbyNpcSummaries,
      todaySocialLedger,
      gameState,
    });
    const directPresentNpcIds = new Set(
      nearbyNpcs
        .filter((npc) => npc.currentLocationId === currentLocationId)
        .map((npc) => npc.npcId)
    );
    const directVisibleNpcIdSet = new Set(directVisibleNpcIds);
    const probableNpcIdSet = new Set(probableNpcIds);
    const sameBuildingLocationIds = new Set(locationIds.filter((locationId) => locationId !== currentLocationId));
    const npcPresence = {
      visible: [],
      sameRoom: [],
      sameBuilding: [],
      probable: [],
      relevant: [],
      staticVisibleButNotHere: [],
    };

    for (const npc of nearbyNpcSummaries) {
      const npcPresenceRef = responseShaping.summarizeNpcPresenceRef(npc);
      const actuallyPresent = directPresentNpcIds.has(npc.npcId);
      const staticallyVisible = directVisibleNpcIdSet.has(npc.npcId);
      const sameBuilding = sameBuildingLocationIds.has(npc.currentLocationId);
      const probable = probableNpcIdSet.has(npc.npcId);

      if (actuallyPresent) {
        npcPresence.visible.push(npcPresenceRef);
        npcPresence.sameRoom.push(npcPresenceRef);
      } else if (sameBuilding) {
        npcPresence.sameBuilding.push(npcPresenceRef);
      } else if (probable) {
        npcPresence.probable.push(npcPresenceRef);
      } else {
        npcPresence.relevant.push(npcPresenceRef);
      }

      if (staticallyVisible && !actuallyPresent) {
        npcPresence.staticVisibleButNotHere.push(npcPresenceRef);
      }
    }
    const sceneRelationshipDynamics = responseShaping.buildSceneRelationshipDynamics({
      relationships: nearbyNpcRelationships,
      nearbyNpcs: nearbyNpcSummariesForResponse,
      npcPresence,
    });
    const sceneRelationshipDynamicsForResponse = slimSceneRelationshipDynamicsForProfile(sceneRelationshipDynamics, profile);
    const dialogueSceneCapsules = responseShaping.buildDialogueSceneCapsules({
      nearbyNpcs: nearbyNpcSummaries,
      npcPresence,
      relevantNpcMemories,
      maxNpcs: profile === "debug_audit" ? limits.npcLimit : Math.min(limits.npcLimit, 3),
    });
    const npcById = new Map(nearbyNpcs.map((npc) => [npc.npcId, npc]));
    const alerts = [];

    if ((npcKnowledgeContext.scheduleUnconfirmedNpcIds || []).length > 0) {
      alerts.push({
        type: "npc_knowledge_boundary",
        severity: "info",
        message:
          "Hay NPCs cercanos sin fuente confirmada para datos mecanicos como el horario exacto de Lucas; deben hablar como inferencia, pregunta o incertidumbre.",
        npcIds: npcKnowledgeContext.scheduleUnconfirmedNpcIds,
      });
    }

    if (socialRhythm.saturatedNpcIds.length > 0) {
      alerts.push({
        type: "social_rhythm_saturated",
        severity: "info",
        message: "Hay NPCs cercanos con interacciones sociales repetidas hoy; conviene variar la escena y evitar deltas numericos rutinarios.",
        npcIds: socialRhythm.saturatedNpcIds,
      });
    }

    const currentDayDailyEvent = dailyEvents.find((event) =>
      (event.tags || []).includes(`daily_event_day_${gameState.currentDay}`)
    );
    const openMainEvent = [...dailyEvents]
      .filter((event) => isMainEvent(event) && ["scheduled", "active"].includes(event.status))
      .sort(
        (a, b) =>
          toAbsoluteMinutes(a.startDay, a.startTime) - toAbsoluteMinutes(b.startDay, b.startTime)
      )[0];
    if (shouldEnsureDailyEvent(gameState) && !currentDayDailyEvent && !openMainEvent) {
      alerts.push({
        type: "daily_event_missing",
        severity: "warning",
        message: "Ya comenzo el bloque de manana o posterior y falta generar un evento principal.",
        day: gameState.currentDay,
        time: gameState.time,
      });
    }

    const weatherSummary = responseShaping.summarizeWeather(weather, gameState.currentDay, gameState.time);
    if (weatherSummary?.staleByCurrentTime) {
      alerts.push({
        type: "weather_stale",
        severity: "info",
        message: "El clima guardado llego a su limite de bloque y conviene refrescarlo antes de narrar exterior.",
        weatherId: weatherSummary.weatherId,
        expectedUntilDay: weatherSummary.expectedUntilDay,
        expectedUntilTime: weatherSummary.expectedUntilTime,
        recommendedAction: "Usar previewWorldTick/applyTurn o ensureCurrentWeather antes de viajes/escenas exteriores.",
      });
    }

    const jobContractSummary = responseShaping.summarizeJobContract(jobContract, gameState);
    const inactiveJobShifts = jobContractSummary?.schedule?.inactiveShiftIds || [];
    const futureJobChanges = jobContractSummary?.schedule?.futureChanges || [];
    const unresolvedJobAttendance = jobContractSummary?.schedule?.attendance?.unresolved || [];
    if (inactiveJobShifts.length > 0 || futureJobChanges.length > 0) {
      alerts.push({
        type: "job_schedule_notice",
        severity: "info",
        message: "El contrato laboral tiene turnos inactivos o cambios futuros que deben respetarse.",
        inactiveShiftIds: inactiveJobShifts,
        futureShiftIds: futureJobChanges.map((shift) => shift.shiftId),
      });
    }
    if (unresolvedJobAttendance.length > 0) {
      alerts.push({
        type: "job_attendance_followup_pending",
        severity: "warning",
        message: "Hay tardanzas o ausencias laborales registradas con seguimiento pendiente.",
        attendance: unresolvedJobAttendance.map((entry) => ({
          shiftId: entry.shiftId,
          status: entry.status,
          day: entry.day,
          time: entry.time,
          consequenceLevel: entry.consequenceLevel,
        })),
        recommendedAction:
          "Resolver la consecuencia con npcRelationshipPatches/commitmentPatches o marcar consequenceApplied si ya fue cerrada.",
      });
    }

    for (const mission of activeMissionSummaries) {
      if (mission.expiredByCurrentTime && !["completed", "failed", "expired"].includes(mission.status)) {
        alerts.push({
          type: "active_mission_expired",
          severity: "warning",
          message: "Hay una mision activa aceptada cuyo vencimiento ya paso.",
          missionId: mission.missionId,
          title: mission.title,
          status: mission.status,
          expiresDay: mission.expiresDay,
          expiresTime: mission.expiresTime,
        });
      }

      if (mission.status === "accepted" && mission.proofStatus === "submitted" && !mission.completedDay) {
        alerts.push({
          type: "mission_proof_submitted_not_completed",
          severity: "warning",
          message: "La mision tiene prueba entregada pero todavia figura como aceptada.",
          missionId: mission.missionId,
          title: mission.title,
        });
      }
    }

    if (missionAgenda.proofRejected.length > 0) {
      alerts.push({
        type: "mission_proof_rejected",
        severity: "warning",
        message: "Hay misiones aceptadas con prueba rechazada; no deben pagarse ni completarse sin corregir o fallar.",
        missionIds: missionAgenda.proofRejected.map((mission) => mission.missionId),
      });
    }

    if (missionAgenda.readyToComplete.length > 0) {
      alerts.push({
        type: "missions_ready_to_complete",
        severity: "info",
        message: "Hay misiones con prueba lista o no requerida; pueden cerrarse formalmente con recompensa idempotente.",
        missionIds: missionAgenda.readyToComplete.map((mission) => mission.missionId),
      });
    }

    if (missionAgenda.availableExpiringSoon.length > 0) {
      alerts.push({
        type: "available_missions_expiring_soon",
        severity: "info",
        message: "Hay misiones disponibles que vencen pronto; solo narrarlas si Lucas puede ver la cartelera o recibir el aviso.",
        missionIds: missionAgenda.availableExpiringSoon.map((mission) => mission.missionId),
      });
    }

    const expiredAvailableMissions = availableMissionSummaries.filter((mission) => mission.expiredByCurrentTime);
    if (expiredAvailableMissions.length > 0) {
      alerts.push({
        type: "available_missions_expired",
        severity: "info",
        message: "Hay misiones disponibles vencidas que deberian filtrarse o marcarse expired.",
        missionIds: expiredAvailableMissions.map((mission) => mission.missionId),
      });
    }

    const overdueCommitments = pendingCommitmentSummaries.filter((commitment) => commitment.dueStatus === "overdue");
    if (overdueCommitments.length > 0) {
      alerts.push({
        type: "commitments_overdue",
        severity: "warning",
        message: "Hay compromisos/promesas pendientes cuya hora objetivo ya paso.",
        commitmentIds: overdueCommitments.map((commitment) => commitment.commitmentId),
      });
    }

    if (commitmentAgenda.consequenceReady.length > 0) {
      alerts.push({
        type: "commitments_consequence_ready",
        severity: "warning",
        message: "Hay compromisos vencidos fuera del margen de gracia; deben cerrarse formalmente con resultado y consecuencia.",
        commitmentIds: commitmentAgenda.consequenceReady.map((commitment) => commitment.commitmentId),
        recommendedAction: "Usar commitmentPatches con fulfill/fail/cancel/expire antes de avanzar escenas largas.",
      });
    }

    if (commitmentAgenda.reviewDue.length > 0) {
      alerts.push({
        type: "commitments_review_due",
        severity: "warning",
        message: "Hay promesas, estimaciones o procesos cuya proxima revision ya corresponde.",
        commitmentIds: commitmentAgenda.reviewDue.map((commitment) => commitment.commitmentId),
        reviewPlans: commitmentAgenda.reviewDue
          .map((commitment) => commitment.reviewPlan)
          .filter(Boolean)
          .slice(0, 4),
        recommendedAction:
          "Usar los reviewPlans/suggestedCommitmentPatch con applyTurn, o una resolucion equivalente validada.",
      });
    }

    if (commitmentAgenda.needsSchedule.length > 0) {
      alerts.push({
        type: "commitments_need_schedule",
        severity: "warning",
        message: "Hay compromisos o procesos importantes sin fecha objetivo ni proxima revision.",
        commitmentIds: commitmentAgenda.needsSchedule.map((commitment) => commitment.commitmentId),
        recommendedAction:
          "Agregar dueDay/dueTime o nextCheckDay/nextCheckTime, o cerrarlos formalmente si ya no aplican.",
      });
    }

    const dueNowCommitments = pendingCommitmentSummaries.filter((commitment) => commitment.dueStatus === "due_now");
    if (dueNowCommitments.length > 0) {
      alerts.push({
        type: "commitments_due_now",
        severity: "info",
        message: "Hay compromisos/promesas que vencen en este momento.",
        commitmentIds: dueNowCommitments.map((commitment) => commitment.commitmentId),
      });
    }

    const dueSoonCommitments = commitmentAgenda.dueSoon.filter((commitment) => commitment.dueStatus !== "future");
    if (dueSoonCommitments.length > 0) {
      alerts.push({
        type: "commitments_due_soon",
        severity: "info",
        message: "Hay compromisos cercanos; conviene no saltar tiempo largo sin atenderlos o reprogramarlos.",
        commitmentIds: dueSoonCommitments.map((commitment) => commitment.commitmentId),
      });
    }

    if (commitmentAgenda.reviewSoon.length > 0) {
      alerts.push({
        type: "commitments_review_soon",
        severity: "info",
        message: "Hay revisiones cercanas de promesas, estimaciones o procesos.",
        commitmentIds: commitmentAgenda.reviewSoon.map((commitment) => commitment.commitmentId),
      });
    }

    const eventSummaryCandidates = uniqueByEventId([
      ...activeEvents.filter(isMainEvent),
      openMainEvent,
      currentDayDailyEvent,
    ]);
    const activeEventSummaries = eventSummaryCandidates
      .filter((event) => event.status === "active")
      .map(responseShaping.summarizeWorldEvent);
    const scheduledEventSummaries = eventSummaryCandidates
      .filter((event) => event.status === "scheduled")
      .map(responseShaping.summarizeWorldEvent);
    const mainEventSummary = responseShaping.summarizeWorldEvent(openMainEvent || currentDayDailyEvent);
    const currentDailyEventSummary = mainEventSummary;
    const minorRumorEventSummaries = uniqueByEventId([
      ...activeEvents.filter(isMinorRumorEvent),
      ...layeredWorldEvents.filter(isMinorRumorEvent),
    ]).map(responseShaping.summarizeWorldEvent);
    const backgroundEventSummaries = uniqueByEventId([
      ...activeEvents.filter(isBackgroundEvent),
      ...layeredWorldEvents.filter(isBackgroundEvent),
    ]).map(responseShaping.summarizeWorldEvent);
    const worldFriction = responseShaping.buildWorldFrictionSummary({
      location: currentLocation,
      weather: weatherSummary,
      shops: nearbyShops,
      shopStocks: nearbyShopStocks,
      items: inventoryItems,
      events: [
        mainEventSummary,
        ...minorRumorEventSummaries,
        ...backgroundEventSummaries,
      ],
    });

    if (worldFriction.economy.hasPressure || worldFriction.travel.hasPressure) {
      alerts.push({
        type: "world_friction_active",
        severity: "info",
        message: "Hay friccion de economia, clima o viaje que conviene considerar antes de compras, rutas o escenas exteriores.",
        guidance: worldFriction.guidance,
        pressureTags: worldFriction.activePressureTags,
      });
    }

    if (pendingBiologicalAccumulations.length > 0) {
      alerts.push({
        type: "pending_biology",
        severity: "info",
        message: "Hay acumuladores biologicos pendientes para el bloque horario actual.",
        count: pendingBiologicalAccumulations.length,
      });
    }

    if (stalePendingBiologicalAccumulations.length > 0) {
      alerts.push({
        type: "stale_pending_biology",
        severity: "warning",
        message: "Hay acumuladores biologicos pendientes de bloques anteriores; requieren reparacion o cierre tecnico para evitar doble conteo.",
        count: stalePendingBiologicalAccumulations.length,
        accumulationIds: stalePendingBiologicalAccumulations.map((entry) => entry.accumulationId).filter(Boolean),
      });
    }

    for (const npcId of directVisibleNpcIds) {
      const npc = npcById.get(npcId);
      if (npc && npc.currentLocationId && npc.currentLocationId !== currentLocationId) {
        alerts.push({
          type: "visible_npc_not_in_current_room",
          severity: "info",
          message: "La ubicacion marca un NPC visible, pero su currentLocationId apunta a otra ubicacion.",
          npcId,
          npcName: npc.name,
          listedLocationId: currentLocationId,
          npcCurrentLocationId: npc.currentLocationId,
          availability: npc.availability || {},
        });
      }
    }

    const narrativeContext = await buildNarrativeContextSummary({
      gameId,
      gameState,
      limit: narrativeContextLimit,
    });
    const gameStateSummary = responseShaping.summarizeGameState(gameState);
    const lucasSummary = responseShaping.summarizeLucasState(gameState, lucas, inventoryItems);
    const currentLocationSummary = responseShaping.summarizeLocation(currentLocation);
    const parentLocationSummary = responseShaping.summarizeLocation(parentLocation);
    const activeCombatEncounterSummaries = activeCombatEncounters.map(responseShaping.summarizeCombatEncounter);
    const dramaticContext = responseShaping.buildDramaticContext({
      gameState: gameStateSummary,
      lucasSummary,
      currentLocation: currentLocationSummary,
      npcPresence,
      nearbyNpcs: nearbyNpcSummariesForResponse,
      relationshipDynamics: sceneRelationshipDynamicsForResponse,
      mainEvent: mainEventSummary,
      missionAgenda,
      pendingCommitments: pendingCommitmentSummaries,
      worldFriction,
      socialRhythm,
      weather: weatherSummary,
      activeCombatEncounters: activeCombatEncounterSummaries,
    });
    const narrationContract = responseShaping.buildSceneNarrationContract({
      dialogueSceneCapsules,
      nearbyNpcs: nearbyNpcSummariesForResponse,
      npcPresence,
      npcKnowledgeContext: npcKnowledgeContextForResponse,
      relationshipDynamics: sceneRelationshipDynamicsForResponse,
      dramaticContext,
      socialRhythm,
      maxNpcs: profile === "debug_audit" ? Math.min(limits.npcLimit, 6) : Math.min(limits.npcLimit, 3),
    });
    const ruleLookupContract = responseShaping.buildRuleLookupContract({
      npcPresence,
      nearbyNpcs: nearbyNpcSummariesForResponse,
      narrationContract,
      worldFriction,
      weather: weatherSummary,
      jobContract: jobContractSummary,
      activeMissions: activeMissionSummaries,
      availableMissionPreview,
      missionAgenda,
      carriedEvidence: carriedEvidence.map(responseShaping.summarizeEvidence),
      pendingCommitments: pendingCommitmentSummaries,
      commitmentAgenda,
      activeCombatEncounters: activeCombatEncounterSummaries,
      activeRumors: activeRumors.map(responseShaping.summarizeRumor),
      minorRumors: minorRumorEventSummaries,
      backgroundEvents: backgroundEventSummaries,
      guildState,
      pendingBiology: pendingBiologicalAccumulations,
      alerts,
    });
    const profileContract = responseShaping.buildCompactProfileContract({
      profile,
      includeTechnicalSummary,
    });
    const hudContract = buildContextHudContract({
      gameState,
      location: currentLocationSummary,
      nearbyNpcs: nearbyNpcSummariesForResponse,
      activeEvents: activeEventSummaries,
      latestEventLog: responseShaping.summarizeEventLog(recentEventLogs[0], { summaryMaxLength: 140 }),
      profile,
    });
    const technicalSummary = includeTechnicalSummary
      ? summarizeTechnicalReadiness({
          gameState,
          weatherSummary,
          jobContractSummary,
          activeMissionSummaries,
          availableMissionPreview,
          missionAgenda,
          guildState,
          worldFriction,
          npcKnowledgeContext,
          mainEventSummary,
          minorRumorEventSummaries,
          backgroundEventSummaries,
          pendingCommitmentSummaries,
          pendingBiologicalAccumulations,
          stalePendingBiologicalAccumulations,
          alerts,
          narrativeContext,
          socialRhythm,
        })
      : undefined;

    return res.json({
      ok: true,
      compact: true,
      profile,
      limits,
      context: {
        profileContract,
        gameState: gameStateSummary,
        lucas: lucasSummary,
        hudContract,
        scene: {
          currentLocation: currentLocationSummary,
          parentLocation: parentLocationSummary,
          locationScope: locationIds,
          staticVisibleNpcIds: directVisibleNpcIds,
          probableNpcIds,
          npcsPresent: npcPresence.visible,
          nearbyNpcs: nearbyNpcSummariesForResponse,
          npcPresence,
          relationshipDynamics: sceneRelationshipDynamicsForResponse,
          dialogueSceneCapsules,
          narrationContract,
          routineOverrides,
          recentEventSummaries: recentEventLogs.map((log) => responseShaping.summarizeEventLog(log)),
        },
        relevantNpcMemories: relevantNpcMemories.map(responseShaping.summarizeNpcMemory),
        mainEvent: slimWorldEventForProfile(mainEventSummary, profile),
        eventForStatusLine: eventStatusLineForProfile(mainEventSummary, profile),
        activeEvents: activeEventSummaries.map((event) => slimWorldEventForProfile(event, profile)),
        scheduledEvents: scheduledEventSummaries.map((event) => slimWorldEventForProfile(event, profile)),
        currentDailyEvent: slimWorldEventForProfile(currentDailyEventSummary, profile),
        dailyEvents: dailyEvents
          .map(responseShaping.summarizeWorldEvent)
          .map((event) => slimWorldEventForProfile(event, profile)),
        minorRumors: [
          ...activeRumors.map(responseShaping.summarizeRumor),
          ...minorRumorEventSummaries.map((event) => slimWorldEventForProfile(event, profile)),
        ],
        backgroundEvents: backgroundEventSummaries.map((event) => slimWorldEventForProfile(event, profile)),
        activeRumors: activeRumors.map(responseShaping.summarizeRumor),
        socialLedgerToday: todaySocialLedger.map(responseShaping.summarizeNpcSocialLedger),
        socialRhythm,
        npcKnowledgeContext: npcKnowledgeContextForResponse,
        pendingCommitments: pendingCommitmentSummaries,
        commitmentAgenda,
        commitmentReviewAgenda,
        guildState,
        worldFriction,
        carriedEvidence: carriedEvidence.map(responseShaping.summarizeEvidence),
        activeMissions: activeMissionSummaries,
        availableMissionPreview,
        missionAgenda,
        pendingBiology: pendingBiologicalAccumulations,
        pendingBiologicalAccumulations,
        ruleLookupContract,
        narrativeContext,
        dramaticContext,
        ...(includeTechnicalSummary ? { technicalSummary } : {}),
        weather: weatherSummary,
        jobContract: jobContractSummary,
        activeCombatEncounters: activeCombatEncounterSummaries,
        alerts,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error obteniendo contexto compacto.",
      details: error.message,
    });
  }
}

async function getStateAuditController(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        ok: false,
        error: "MongoDB no esta conectado. Configura MONGODB_URI para usar /api/context/audit-state.",
      });
    }

    const audit = await buildStateAudit({
      gameId: req.query.gameId || "isekai_lucas_main",
    });

    return res.json(audit);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

module.exports = {
  getFullContext,
  getCompactContext,
  getStateAuditController,
};
