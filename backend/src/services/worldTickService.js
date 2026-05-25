const CombatEncounter = require("../models/CombatEncounter");
const GameState = require("../models/GameState");
const Mission = require("../models/Mission");
const Npc = require("../models/Npc");
const RoutineOverride = require("../models/RoutineOverride");
const Rumor = require("../models/Rumor");
const ShopStock = require("../models/ShopStock");
const WorldEvent = require("../models/WorldEvent");

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function toAbsoluteMinutes(day, time) {
  return (Number(day || 1) - 1) * 24 * 60 + timeToMinutes(time);
}

function isTimeInRange(currentTime, startTime, endTime) {
  if (!currentTime || !startTime || !endTime) return false;

  const current = timeToMinutes(currentTime);
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (start === end) return false;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end;
}

function inferAvailability(task) {
  const value = String(task || "").toLowerCase();

  if (value.includes("durmiendo")) return "sleeping";
  if (value.includes("viajando")) return "traveling";
  if (
    value.includes("atendiendo") ||
    value.includes("supervisando") ||
    value.includes("descansando") ||
    value.includes("disponible")
  ) {
    return "available";
  }

  return "busy";
}

function findRoutineEntry(routineBase, time) {
  return (routineBase || []).find((entry) => isTimeInRange(time, entry.timeStart, entry.timeEnd));
}

async function findRoutineOverride(npcId, day, time) {
  const overrides = await RoutineOverride.find({
    npcId,
    day,
    status: { $in: ["scheduled", "active"] },
  }).lean();

  return overrides
    .filter((override) => isTimeInRange(time, override.timeStart, override.timeEnd))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0] || null;
}

function missionExpiresWithin(mission, fromAbs, toAbs) {
  if (!mission.expiresDay || !mission.expiresTime) return false;

  const expiresAbs = toAbsoluteMinutes(mission.expiresDay, mission.expiresTime);
  return expiresAbs > fromAbs && expiresAbs <= toAbs;
}

function eventEndsWithin(event, fromAbs, toAbs) {
  if (!event.endDay || !event.endTime) return false;

  const endsAbs = toAbsoluteMinutes(event.endDay, event.endTime);
  return endsAbs > fromAbs && endsAbs <= toAbs;
}

async function previewRoutineSync({ toDay, toTime }) {
  const npcs = await Npc.find({ regionId: "region_hoshimori" }).lean();
  const updates = [];
  const skipped = [];

  for (const npc of npcs) {
    const override = await findRoutineOverride(npc.npcId, toDay, toTime);
    const routine = override || findRoutineEntry(npc.routineBase, toTime);

    if (!routine) {
      skipped.push({
        npcId: npc.npcId,
        name: npc.name,
        reason: "sin rutina aplicable para el destino del tick",
      });
      continue;
    }

    const nextLocationId = routine.locationId;
    const nextTask = routine.task;
    const nextStatus = inferAvailability(nextTask);
    const changed =
      npc.currentLocationId !== nextLocationId ||
      npc.currentTask !== nextTask ||
      npc.availability?.status !== nextStatus;

    if (!changed) {
      skipped.push({
        npcId: npc.npcId,
        name: npc.name,
        reason: "sin cambios previstos",
      });
      continue;
    }

    updates.push({
      npcId: npc.npcId,
      name: npc.name,
      before: {
        currentLocationId: npc.currentLocationId,
        currentTask: npc.currentTask,
        availability: npc.availability,
      },
      after: {
        currentLocationId: nextLocationId,
        currentTask: nextTask,
        availability: {
          status: nextStatus,
          reason: override
            ? `Override de rutina activo para Dia ${toDay} ${toTime}`
            : `Rutina base aplicable para ${toTime}`,
        },
      },
      source: override ? "override" : "routineBase",
    });
  }

  return {
    checkedNpcCount: npcs.length,
    updateCount: updates.length,
    skippedCount: skipped.length,
    updates: updates.slice(0, 25),
    skipped: skipped.slice(0, 10),
  };
}

async function previewMissionExpiry({ fromAbs, toAbs }) {
  const available = await Mission.find({ status: "available" }).lean();
  const expiring = available
    .filter((mission) => missionExpiresWithin(mission, fromAbs, toAbs))
    .map((mission) => ({
      missionId: mission.missionId,
      title: mission.title,
      expiresDay: mission.expiresDay,
      expiresTime: mission.expiresTime,
      statusAfterApply: "expired",
    }));

  return {
    checkedAvailableCount: available.length,
    expiringCount: expiring.length,
    expiring,
  };
}

async function previewRestock({ currentDay, toDay }) {
  if (toDay <= currentDay) {
    return {
      dayChanged: false,
      candidateCount: 0,
      candidates: [],
    };
  }

  const candidates = await ShopStock.find({
    "restockRule.type": "daily",
    $or: [
      { lastRestockedDay: null },
      { lastRestockedDay: { $lt: toDay } },
    ],
  })
    .select("stockId shopId itemId quantity restockRule lastRestockedDay scarcityFlags")
    .lean();

  return {
    dayChanged: true,
    candidateCount: candidates.length,
    candidates: candidates.slice(0, 30).map((stock) => ({
      stockId: stock.stockId,
      shopId: stock.shopId,
      itemId: stock.itemId,
      currentQuantity: stock.quantity,
      amount: stock.restockRule?.amount || 0,
      lastRestockedDay: stock.lastRestockedDay,
      dryRun: true,
    })),
  };
}

async function previewWorldTick({
  gameId = "isekai_lucas_main",
  fromDay = null,
  fromTime = "",
  toDay = null,
  toTime = "",
  dryRun = true,
} = {}) {
  if (dryRun === false) {
    const error = new Error("G14 solo soporta world tick preview dryRun en esta fase.");
    error.statusCode = 400;
    throw error;
  }

  const gameState = await GameState.findOne({ gameId }).lean();

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const normalizedFromDay = Number(fromDay || gameState.currentDay);
  const normalizedFromTime = fromTime || gameState.time;
  const normalizedToDay = Number(toDay || normalizedFromDay);
  const normalizedToTime = toTime || gameState.time;
  const fromAbs = toAbsoluteMinutes(normalizedFromDay, normalizedFromTime);
  const toAbs = toAbsoluteMinutes(normalizedToDay, normalizedToTime);

  if (toAbs < fromAbs) {
    const error = new Error("toDay/toTime no puede estar antes de fromDay/fromTime.");
    error.statusCode = 400;
    throw error;
  }

  const [
    routines,
    missionExpiry,
    restock,
    activeRumors,
    activeEvents,
    activeCombats,
  ] = await Promise.all([
    previewRoutineSync({ toDay: normalizedToDay, toTime: normalizedToTime }),
    previewMissionExpiry({ fromAbs, toAbs }),
    previewRestock({ currentDay: gameState.currentDay, toDay: normalizedToDay }),
    Rumor.find({ status: "active" }).select("rumorId certainty locationIds knownByNpcIds tags").lean(),
    WorldEvent.find({ status: "active" }).lean(),
    CombatEncounter.find({ gameId, status: "active" }).select("encounterId enemyId enemyName").lean(),
  ]);

  const eventsEnding = activeEvents
    .filter((event) => eventEndsWithin(event, fromAbs, toAbs))
    .map((event) => ({
      eventId: event.eventId,
      title: event.title,
      endDay: event.endDay,
      endTime: event.endTime,
      statusAfterApply: "resolved",
    }));

  const rumorCandidates = activeRumors.slice(0, 20).map((rumor) => ({
    rumorId: rumor.rumorId,
    certainty: rumor.certainty,
    locationIds: rumor.locationIds || [],
    knownByNpcCount: (rumor.knownByNpcIds || []).length,
    action: "candidate_only",
  }));

  const warnings = [];

  if (activeCombats.length > 0) {
    warnings.push("Hay combates activos; un apply real deberia bloquear o resolver antes de avanzar mundo.");
  }

  if (missionExpiry.expiringCount > 0) {
    warnings.push("Hay misiones disponibles que vencerian en este rango; preview no cambia status.");
  }

  if (eventsEnding.length > 0) {
    warnings.push("Hay eventos activos que terminarian en este rango; preview no los resuelve.");
  }

  return {
    dryRun: true,
    willMutateGameState: false,
    gameId,
    from: {
      day: normalizedFromDay,
      time: normalizedFromTime,
    },
    to: {
      day: normalizedToDay,
      time: normalizedToTime,
    },
    elapsedMinutes: toAbs - fromAbs,
    currentState: {
      day: gameState.currentDay,
      time: gameState.time,
      locationId: gameState.locationId,
      moneyCopper: gameState.moneyCopper,
      mpCurrent: gameState.lucasStatus?.mp?.current,
      activeMissionIds: gameState.activeMissionIds || [],
    },
    routines,
    missionExpiry,
    restock,
    rumors: {
      candidateCount: activeRumors.length,
      candidates: rumorCandidates,
      willPropagate: false,
    },
    events: {
      activeCount: activeEvents.length,
      endingCount: eventsEnding.length,
      ending: eventsEnding,
    },
    combats: {
      activeCount: activeCombats.length,
      active: activeCombats,
    },
    generatedContent: {
      willCreateRumors: false,
      willCreateRomance: false,
      willCreateMajorEvents: false,
      willGrantRewards: false,
    },
    warnings,
  };
}

module.exports = {
  previewWorldTick,
  timeToMinutes,
  toAbsoluteMinutes,
};
