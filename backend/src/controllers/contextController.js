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
const responseShaping = require("../utils/responseShaping");
const { buildNarrativeContextSummary } = require("../services/narrativeVariationService");
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
    narrativeState: narrativeContext || null,
    socialRhythmState: socialRhythm
      ? {
          saturatedNpcIds: socialRhythm.saturatedNpcIds || [],
          npcCount: (socialRhythm.npcs || []).length,
          globalGuidance: socialRhythm.globalGuidance || "",
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

function buildCommitmentAgenda(commitments = []) {
  const byUrgency = (urgency) => commitments.filter((commitment) => commitment.urgency === urgency);
  const consequenceReady = commitments.filter((commitment) => commitment.consequencePreview?.pastGrace);
  const needsResolution = commitments.filter((commitment) => commitment.consequencePreview?.requiresExplicitResolution);

  return {
    consequenceReady,
    overdue: byUrgency("consequence_ready").concat(byUrgency("overdue_in_grace")),
    dueNow: byUrgency("due_now"),
    dueSoon: byUrgency("due_soon").concat(byUrgency("upcoming")),
    unscheduledImportant: commitments.filter(
      (commitment) =>
        commitment.dueStatus === "unscheduled" && ["critical", "high"].includes(commitment.priority)
    ),
    needsResolution,
    next: commitments.slice(0, 5),
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
    const limits = {
      npcLimit: responseShaping.toIntQuery(req.query.npcLimit, 20, 1, 30),
      memoryLimit: responseShaping.toIntQuery(req.query.memoryLimit, 6, 0, 12),
      rumorLimit: responseShaping.toIntQuery(req.query.rumorLimit, 5, 0, 10),
      missionLimit: responseShaping.toIntQuery(req.query.missionLimit, 8, 0, 15),
      eventLimit: responseShaping.toIntQuery(req.query.eventLimit, 6, 0, 12),
      logLimit: responseShaping.toIntQuery(req.query.logLimit, 5, 0, 10),
      commitmentLimit: responseShaping.toIntQuery(req.query.commitmentLimit, 8, 0, 15),
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
    const inventoryItemIds = unique((gameState.inventory || []).map((entry) => entry.itemId));

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

    const [
      inventoryItems,
      relevantNpcMemories,
      activeEvents,
      dailyEvents,
      layeredWorldEvents,
      activeRumors,
      activeMissions,
      availableMissions,
      recentEventLogs,
      routineOverrides,
      activeCombatEncounters,
      weather,
      jobContract,
      todaySocialLedger,
      pendingCommitments,
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
            .limit(limits.memoryLimit)
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

      Mission.find({ $or: activeMissionClauses })
        .sort({ postedDay: -1, postedTime: -1 })
        .limit(limits.missionLimit)
        .lean(),

      limits.missionLimit > 0
        ? Mission.find({ status: "available" })
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
            .limit(20)
            .lean()
        : Promise.resolve([]),

      limits.commitmentLimit > 0
        ? Commitment.find({
            gameId,
            status: { $in: ["pending", "active"] },
          })
            .sort({ dueDay: 1, dueTime: 1, priority: -1, createdDay: -1, createdTime: -1 })
            .limit(Math.max(limits.commitmentLimit * 4, limits.commitmentLimit))
            .lean()
        : Promise.resolve([]),
    ]);

    const activeMissionSummaries = activeMissions.map((mission) =>
      responseShaping.summarizeMission(mission, gameState.currentDay, gameState.time)
    );
    const priorityWeight = { critical: 4, high: 3, normal: 2, low: 1 };
    const pendingCommitmentSummaries = pendingCommitments
      .map((commitment) => responseShaping.summarizeCommitment(commitment, gameState.currentDay, gameState.time))
      .sort((left, right) => {
        const leftDue = left.dueDay ? toAbsoluteMinutes(left.dueDay, left.dueTime || "23:59") : Number.MAX_SAFE_INTEGER;
        const rightDue = right.dueDay
          ? toAbsoluteMinutes(right.dueDay, right.dueTime || "23:59")
          : Number.MAX_SAFE_INTEGER;
        if (leftDue !== rightDue) return leftDue - rightDue;
        return (priorityWeight[right.priority] || 0) - (priorityWeight[left.priority] || 0);
      })
      .slice(0, limits.commitmentLimit);
    const commitmentAgenda = buildCommitmentAgenda(pendingCommitmentSummaries);
    const availableMissionSummaries = availableMissions.map((mission) =>
      responseShaping.summarizeMission(mission, gameState.currentDay, gameState.time)
    );
    const availableMissionPreview = availableMissionSummaries
      .filter((mission) => !mission.expiredByCurrentTime)
      .slice(0, limits.missionLimit);
    const nearbyNpcSummaries = nearbyNpcs.map(responseShaping.summarizeNpc);
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
    const npcById = new Map(nearbyNpcs.map((npc) => [npc.npcId, npc]));
    const alerts = [];

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
      limit: 30,
    });
    const technicalSummary = includeTechnicalSummary
      ? summarizeTechnicalReadiness({
          gameState,
          weatherSummary,
          jobContractSummary,
          activeMissionSummaries,
          availableMissionPreview,
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
      limits,
      context: {
        gameState: responseShaping.summarizeGameState(gameState),
        lucas: responseShaping.summarizeLucasState(gameState, lucas, inventoryItems),
        scene: {
          currentLocation: responseShaping.summarizeLocation(currentLocation),
          parentLocation: responseShaping.summarizeLocation(parentLocation),
          locationScope: locationIds,
          staticVisibleNpcIds: directVisibleNpcIds,
          probableNpcIds,
          npcsPresent: nearbyNpcSummaries.filter((npc) => directPresentNpcIds.has(npc.npcId)),
          nearbyNpcs: nearbyNpcSummaries,
          npcPresence,
          routineOverrides,
          recentEventSummaries: recentEventLogs.map((log) => responseShaping.summarizeEventLog(log)),
        },
        relevantNpcMemories: relevantNpcMemories.map(responseShaping.summarizeNpcMemory),
        mainEvent: mainEventSummary,
        eventForStatusLine: mainEventSummary,
        activeEvents: activeEventSummaries,
        scheduledEvents: scheduledEventSummaries,
        currentDailyEvent: currentDailyEventSummary,
        dailyEvents: dailyEvents.map(responseShaping.summarizeWorldEvent),
        minorRumors: [
          ...activeRumors.map(responseShaping.summarizeRumor),
          ...minorRumorEventSummaries,
        ],
        backgroundEvents: backgroundEventSummaries,
        activeRumors: activeRumors.map(responseShaping.summarizeRumor),
        socialLedgerToday: todaySocialLedger.map(responseShaping.summarizeNpcSocialLedger),
        socialRhythm,
        pendingCommitments: pendingCommitmentSummaries,
        commitmentAgenda,
        activeMissions: activeMissionSummaries,
        availableMissionPreview,
        pendingBiology: pendingBiologicalAccumulations,
        pendingBiologicalAccumulations,
        narrativeContext,
        ...(includeTechnicalSummary ? { technicalSummary } : {}),
        weather: weatherSummary,
        jobContract: jobContractSummary,
        activeCombatEncounters: activeCombatEncounters.map(responseShaping.summarizeCombatEncounter),
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

module.exports = {
  getFullContext,
  getCompactContext,
};
