require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");
const Mission = require("../models/Mission");
const WeatherState = require("../models/WeatherState");
const WorldEvent = require("../models/WorldEvent");
const {
  DAILY_EVENT_TAG,
  eventGameFilter,
  getEventStatusAt,
  reconcileDailyEventsForGameState,
  shouldEnsureDailyEvent,
} = require("../services/dailyEventSchedulerService");

const GAME_ID = process.env.REPAIR_GAME_ID || "isekai_lucas_main";
const REGION_ID = process.env.REPAIR_REGION_ID || "region_hoshimori";
const WRITE = process.argv.includes("--write") || process.env.WRITE_LIVE_START_REPAIR === "true";
const SOURCE = "live_start_readiness_repair";

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}

function sanitizeIdPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function isMissionExpired(mission, gameState) {
  if (!mission?.expiresDay || !mission.expiresTime) return false;
  if (mission.expiresDay < gameState.currentDay) return true;
  if (mission.expiresDay > gameState.currentDay) return false;
  return timeToMinutes(mission.expiresTime) <= timeToMinutes(gameState.time);
}

function isWeatherStale(weather, gameState) {
  if (!weather?.expectedUntilDay || !weather.expectedUntilTime) return false;
  if (weather.expectedUntilDay < gameState.currentDay) return true;
  if (weather.expectedUntilDay > gameState.currentDay) return false;
  return timeToMinutes(weather.expectedUntilTime) < timeToMinutes(gameState.time);
}

function getWeatherBlock(day, time) {
  const minutes = timeToMinutes(time);

  if (minutes < 360) {
    return {
      key: "predawn",
      label: "Madrugada",
      startDay: day,
      startTime: "00:00",
      endDay: day,
      endTime: "06:00",
      currentCondition: "clear",
      intensity: 1,
    };
  }

  if (minutes < 720) {
    return {
      key: "morning",
      label: "Manana",
      startDay: day,
      startTime: "06:00",
      endDay: day,
      endTime: "12:00",
      currentCondition: "cloudy",
      intensity: 1,
    };
  }

  if (minutes < 840) {
    return {
      key: "midday",
      label: "Mediodia",
      startDay: day,
      startTime: "12:00",
      endDay: day,
      endTime: "14:00",
      currentCondition: "clear",
      intensity: 1,
    };
  }

  if (minutes < 1080) {
    return {
      key: "afternoon",
      label: "Tarde",
      startDay: day,
      startTime: "14:00",
      endDay: day,
      endTime: "18:00",
      currentCondition: "cloudy",
      intensity: 1,
    };
  }

  return {
    key: "night",
    label: "Noche",
    startDay: day,
    startTime: "18:00",
    endDay: day + 1,
    endTime: "00:00",
    currentCondition: "clear",
    intensity: 1,
  };
}

function docSummary(doc, fields) {
  const summary = {};
  for (const field of fields) summary[field] = doc?.[field];
  return summary;
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function buildWeatherRefresh(gameState, latestWeather) {
  const block = getWeatherBlock(gameState.currentDay, gameState.time);
  const weatherId = `weather_${sanitizeIdPart(REGION_ID)}_d${block.startDay}_${block.key}_${SOURCE}`;

  return {
    weatherId,
    regionId: latestWeather?.regionId || REGION_ID,
    currentCondition: block.currentCondition,
    intensity: block.intensity,
    startedDay: block.startDay,
    startedTime: block.startTime,
    expectedUntilDay: block.endDay,
    expectedUntilTime: block.endTime,
    effects: [],
    source: SOURCE,
    tags: [
      "admin_fix",
      "live_start_readiness",
      "weather_refresh",
      `weather_block_${block.key}`,
      `weather_day_${block.startDay}`,
    ],
  };
}

async function buildRepairPlan() {
  const gameState = await GameState.findOne({ gameId: GAME_ID }).lean();
  if (!gameState) throw new Error(`No existe GameState para gameId: ${GAME_ID}`);

  const [availableMissions, latestWeather, currentDailyEvent, lifecycleCandidates] = await Promise.all([
    Mission.find({ status: "available" }).sort({ expiresDay: 1, expiresTime: 1 }).lean(),
    WeatherState.findOne({ regionId: REGION_ID })
      .sort({ startedDay: -1, startedTime: -1, updatedAt: -1 })
      .lean(),
    WorldEvent.findOne({
      ...eventGameFilter(GAME_ID),
      tags: { $all: [DAILY_EVENT_TAG, `daily_event_day_${gameState.currentDay}`] },
    }).lean(),
    WorldEvent.find({
      ...eventGameFilter(GAME_ID),
      status: { $in: ["scheduled", "active"] },
    })
      .select("eventId status startDay startTime endDay endTime severity tags")
      .lean(),
  ]);

  const changes = [];

  for (const mission of availableMissions.filter((entry) => isMissionExpired(entry, gameState))) {
    changes.push({
      type: "expire_available_mission",
      missionId: mission.missionId,
      before: docSummary(mission, ["status", "proofStatus", "expiresDay", "expiresTime", "flags"]),
      after: {
        status: "expired",
        flags: {
          ...(mission.flags || {}),
          liveStartReadiness: {
            source: SOURCE,
            reason: `Mision disponible vencida al Dia ${gameState.currentDay} ${gameState.time}.`,
            expiredAtDay: gameState.currentDay,
            expiredAtTime: gameState.time,
          },
        },
      },
    });
  }

  if (!latestWeather || isWeatherStale(latestWeather, gameState)) {
    const nextWeather = buildWeatherRefresh(gameState, latestWeather);
    const existingRefresh = await WeatherState.findOne({ weatherId: nextWeather.weatherId }).lean();

    if (!existingRefresh || isWeatherStale(existingRefresh, gameState)) {
      changes.push({
        type: "refresh_weather",
        weatherId: nextWeather.weatherId,
        before: latestWeather
          ? docSummary(latestWeather, [
              "weatherId",
              "currentCondition",
              "startedDay",
              "startedTime",
              "expectedUntilDay",
              "expectedUntilTime",
              "source",
              "tags",
            ])
          : null,
        after: nextWeather,
      });
    }
  }

  if (shouldEnsureDailyEvent(gameState) && !currentDailyEvent) {
    changes.push({
      type: "ensure_daily_event",
      before: null,
      after: {
        day: gameState.currentDay,
        time: gameState.time,
        reason: "Debe existir un evento diario desde el bloque de manana.",
      },
    });
  }

  const lifecycleUpdates = lifecycleCandidates
    .map((event) => ({
      eventId: event.eventId,
      beforeStatus: event.status,
      afterStatus: getEventStatusAt(event, gameState.currentDay, gameState.time),
    }))
    .filter((entry) => entry.beforeStatus !== entry.afterStatus);

  if (lifecycleUpdates.length > 0) {
    changes.push({
      type: "reconcile_daily_event_lifecycle",
      before: lifecycleUpdates.map((entry) => ({
        eventId: entry.eventId,
        status: entry.beforeStatus,
      })),
      after: lifecycleUpdates.map((entry) => ({
        eventId: entry.eventId,
        status: entry.afterStatus,
      })),
    });
  }

  const expectedActiveEventIds = unique(
    lifecycleCandidates
      .filter((event) => getEventStatusAt(event, gameState.currentDay, gameState.time) === "active")
      .map((event) => event.eventId)
  );
  const currentActiveEventIds = unique(gameState.activeEventIds || []);
  if (JSON.stringify(expectedActiveEventIds) !== JSON.stringify(currentActiveEventIds)) {
    changes.push({
      type: "reconcile_active_event_ids",
      before: currentActiveEventIds,
      after: expectedActiveEventIds,
    });
  }

  return {
    gameState: docSummary(gameState, ["gameId", "currentDay", "time", "block", "locationId"]),
    changes,
  };
}

async function applyRepairPlan(plan) {
  if (!plan.changes.length) return;

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const gameState = await GameState.findOne({ gameId: GAME_ID }).session(session);
      if (!gameState) throw new Error(`No existe GameState para gameId: ${GAME_ID}`);

      for (const change of plan.changes) {
        if (change.type === "expire_available_mission") {
          await Mission.updateOne(
            { missionId: change.missionId, status: "available" },
            {
              $set: {
                status: change.after.status,
                flags: change.after.flags,
              },
            },
            { session }
          );
        }

        if (change.type === "refresh_weather") {
          await WeatherState.updateOne(
            { weatherId: change.weatherId },
            { $set: change.after },
            { upsert: true, runValidators: true, session }
          );
        }
      }

      if (
        plan.changes.some((change) =>
          ["ensure_daily_event", "reconcile_daily_event_lifecycle"].includes(change.type)
          || change.type === "reconcile_active_event_ids"
        )
      ) {
        const dailyEventResult = await reconcileDailyEventsForGameState(gameState, { session });
        gameState.activeEventIds = dailyEventResult.activeEventIds || gameState.activeEventIds || [];
        await gameState.save({ session });
      }

      await EventLog.create(
        [
          {
            logId: `log_${SOURCE}_${Date.now()}`,
            gameId: GAME_ID,
            day: gameState.currentDay,
            timeStart: gameState.time,
            timeEnd: gameState.time,
            locationId: gameState.locationId,
            type: "system_correction",
            summary:
              "Reparacion previa a partida: misiones vencidas expiradas, clima refrescado y evento diario reconciliado si hacia falta.",
            involvedCharacterIds: [gameState.characterId],
            mechanicalChanges: {
              source: SOURCE,
              changes: plan.changes,
            },
            visibility: "hidden",
            source: "admin_fix",
            tags: ["admin_fix", "live_start_readiness"],
          },
        ],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }
}

async function main() {
  await connectDB();
  const plan = await buildRepairPlan();

  console.log(
    JSON.stringify(
      {
        mode: WRITE ? "write" : "dry-run",
        gameId: GAME_ID,
        regionId: REGION_ID,
        gameState: plan.gameState,
        changeCount: plan.changes.length,
        changes: plan.changes,
      },
      null,
      2
    )
  );

  if (!WRITE) {
    console.log("Dry-run only. Re-run with --write or WRITE_LIVE_START_REPAIR=true to apply.");
    return;
  }

  await applyRepairPlan(plan);
  const after = await buildRepairPlan();

  console.log(
    JSON.stringify(
      {
        applied: true,
        remainingChangeCount: after.changes.length,
        remainingChanges: after.changes,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("Live start readiness repair failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });

module.exports = {
  buildRepairPlan,
  getWeatherBlock,
  isMissionExpired,
  isWeatherStale,
};
