try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for hosted/admin shells.
}

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");
const Location = require("../models/Location");
const Mission = require("../models/Mission");
const Npc = require("../models/Npc");
const WeatherState = require("../models/WeatherState");

const GAME_ID = process.env.REPAIR_GAME_ID || "isekai_lucas_main";
const WRITE = process.argv.includes("--write") || process.env.WRITE_CANON_REPAIR === "true";
const SOURCE = "phase3_canon_repair";
const DELIVERY_MISSION_ID = "mission_d10_grulla_delivery_guild";
const YARA_ID = "npc_yara_mils";
const KITCHEN_ID = "loc_hoshimori_grulla_azul_cocina";
const INN_ID = "loc_hoshimori_grulla_azul";
const NIGHT_WEATHER_ID = "weather_hoshimori_d10_night_clearing";

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}

function isExpiredByGameTime(mission, gameState) {
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

function docSummary(doc, fields) {
  const summary = {};
  for (const field of fields) summary[field] = doc?.[field];
  return summary;
}

async function buildRepairPlan() {
  const gameState = await GameState.findOne({ gameId: GAME_ID }).lean();
  if (!gameState) throw new Error(`No existe GameState para gameId: ${GAME_ID}`);

  const [
    deliveryMission,
    availableMissions,
    latestWeather,
    nightWeather,
    yara,
    kitchen,
    evidenceLogs,
  ] = await Promise.all([
    Mission.findOne({ missionId: DELIVERY_MISSION_ID }).lean(),
    Mission.find({ status: "available" }).sort({ expiresDay: 1, expiresTime: 1 }).lean(),
    WeatherState.findOne({ regionId: "region_hoshimori" })
      .sort({ startedDay: -1, startedTime: -1, updatedAt: -1 })
      .lean(),
    WeatherState.findOne({ weatherId: NIGHT_WEATHER_ID }).lean(),
    Npc.findOne({ npcId: YARA_ID }).lean(),
    Location.findOne({ locationId: KITCHEN_ID }).lean(),
    EventLog.find({
      gameId: GAME_ID,
      $or: [
        { tags: { $in: ["proof_submitted", "completed", "reported_to_client"] } },
        { summary: /Mara|paquete|Roberto|entrega/i },
      ],
    })
      .sort({ day: 1, timeStart: 1 })
      .lean(),
  ]);

  const changes = [];

  if (
    deliveryMission &&
    deliveryMission.status === "accepted" &&
    deliveryMission.proofStatus === "submitted" &&
    !deliveryMission.completedDay
  ) {
    changes.push({
      type: "complete_delivery_mission",
      missionId: deliveryMission.missionId,
      before: docSummary(deliveryMission, [
        "status",
        "proofStatus",
        "acceptedByCharacterId",
        "acceptedDay",
        "completedDay",
        "flags",
      ]),
      after: {
        status: "completed",
        proofStatus: "verified",
        completedDay: 10,
        flags: {
          ...(deliveryMission.flags || {}),
          canonRepair: {
            phase: 3,
            source: SOURCE,
            reason: "La entrega fue registrada por Mara, recompensada y reportada a Roberto en logs canonicos.",
            rewardAlreadyPaid: true,
            completedTime: "13:00",
            evidenceLogIds: evidenceLogs.map((log) => log.logId),
          },
        },
      },
    });
  }

  if ((gameState.activeMissionIds || []).includes(DELIVERY_MISSION_ID)) {
    changes.push({
      type: "remove_completed_mission_from_active_ids",
      missionId: DELIVERY_MISSION_ID,
      before: { activeMissionIds: gameState.activeMissionIds || [] },
      after: {
        activeMissionIds: (gameState.activeMissionIds || []).filter(
          (missionId) => missionId !== DELIVERY_MISSION_ID
        ),
      },
    });
  }

  for (const mission of availableMissions.filter((entry) => isExpiredByGameTime(entry, gameState))) {
    changes.push({
      type: "expire_available_mission",
      missionId: mission.missionId,
      before: docSummary(mission, ["status", "proofStatus", "expiresDay", "expiresTime", "flags"]),
      after: {
        status: "expired",
        flags: {
          ...(mission.flags || {}),
          canonRepair: {
            phase: 3,
            source: SOURCE,
            reason: `Mision disponible vencida al Dia ${gameState.currentDay} ${gameState.time}.`,
            expiredAtDay: gameState.currentDay,
            expiredAtTime: gameState.time,
          },
        },
      },
    });
  }

  if (latestWeather && isWeatherStale(latestWeather, gameState) && !nightWeather) {
    changes.push({
      type: "create_current_weather",
      weatherId: NIGHT_WEATHER_ID,
      before: docSummary(latestWeather, [
        "weatherId",
        "currentCondition",
        "startedDay",
        "startedTime",
        "expectedUntilDay",
        "expectedUntilTime",
      ]),
      after: {
        weatherId: NIGHT_WEATHER_ID,
        regionId: latestWeather.regionId,
        currentCondition: "clear",
        intensity: 1,
        startedDay: 10,
        startedTime: "18:00",
        expectedUntilDay: 11,
        expectedUntilTime: "06:00",
        effects: [],
        source: SOURCE,
        tags: ["canon_repair", "phase3", "hoshimori", "weather", "night", "clearing"],
      },
    });
  }

  if (
    yara &&
    (yara.currentLocationId !== INN_ID ||
      yara.currentTask !== "descansando o durmiendo" ||
      yara.availability?.status !== "sleeping")
  ) {
    changes.push({
      type: "sync_yara_night_routine",
      npcId: YARA_ID,
      before: docSummary(yara, ["currentLocationId", "currentTask", "availability"]),
      after: {
        currentLocationId: INN_ID,
        currentTask: "descansando o durmiendo",
        availability: {
          status: "sleeping",
          reason: `Rutina base nocturna aplicable para Dia ${gameState.currentDay} ${gameState.time}; cierre de cocina ya terminado.`,
        },
      },
    });
  }

  if ((kitchen?.visibleNpcIds || []).includes(YARA_ID)) {
    changes.push({
      type: "remove_yara_from_kitchen_visible_ids",
      locationId: KITCHEN_ID,
      before: { visibleNpcIds: kitchen.visibleNpcIds || [] },
      after: {
        visibleNpcIds: (kitchen.visibleNpcIds || []).filter((npcId) => npcId !== YARA_ID),
      },
    });
  }

  return {
    gameState: docSummary(gameState, ["gameId", "currentDay", "time", "locationId", "activeMissionIds"]),
    evidenceLogIds: evidenceLogs.map((log) => log.logId),
    changes,
  };
}

async function applyRepairPlan(plan) {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const gameState = await GameState.findOne({ gameId: GAME_ID }).session(session);
      if (!gameState) throw new Error(`No existe GameState para gameId: ${GAME_ID}`);

      for (const change of plan.changes) {
        if (change.type === "complete_delivery_mission") {
          await Mission.updateOne(
            {
              missionId: change.missionId,
              status: "accepted",
              proofStatus: "submitted",
              completedDay: null,
            },
            {
              $set: {
                status: change.after.status,
                proofStatus: change.after.proofStatus,
                completedDay: change.after.completedDay,
                flags: change.after.flags,
              },
            },
            { session }
          );
        }

        if (change.type === "remove_completed_mission_from_active_ids") {
          gameState.activeMissionIds = change.after.activeMissionIds;
        }

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

        if (change.type === "create_current_weather") {
          await WeatherState.updateOne(
            { weatherId: change.weatherId },
            { $setOnInsert: change.after },
            { upsert: true, session }
          );
        }

        if (change.type === "sync_yara_night_routine") {
          await Npc.updateOne(
            { npcId: change.npcId },
            {
              $set: {
                currentLocationId: change.after.currentLocationId,
                currentTask: change.after.currentTask,
                availability: change.after.availability,
              },
            },
            { session }
          );
        }

        if (change.type === "remove_yara_from_kitchen_visible_ids") {
          await Location.updateOne(
            { locationId: change.locationId },
            { $set: { visibleNpcIds: change.after.visibleNpcIds } },
            { session }
          );
        }
      }

      await gameState.save({ session });

      if (plan.changes.length > 0) {
        await EventLog.create(
          [
            {
              logId: `log_phase3_canon_repair_${Date.now()}`,
              gameId: GAME_ID,
              day: gameState.currentDay,
              timeStart: gameState.time,
              timeEnd: gameState.time,
              locationId: gameState.locationId,
              type: "system_correction",
              summary:
                "Reparacion canonica fase 3: mision entregada formalizada, misiones vencidas expiradas, clima nocturno actualizado y rutina/presencia de Yara sincronizada.",
              involvedCharacterIds: ["char_lucas"],
              involvedNpcIds: [YARA_ID, "npc_roberto_valen", "npc_mara_vell"],
              mechanicalChanges: {
                source: SOURCE,
                changes: plan.changes,
                evidenceLogIds: plan.evidenceLogIds,
              },
              visibility: "hidden",
              source: "admin_fix",
              tags: ["canon_repair", "phase3", "admin_fix"],
            },
          ],
          { session }
        );
      }
    });
  } finally {
    await session.endSession();
  }
}

async function main() {
  await connectDB();
  const plan = await buildRepairPlan();

  console.log(JSON.stringify({
    mode: WRITE ? "write" : "dry-run",
    gameId: GAME_ID,
    gameState: plan.gameState,
    changeCount: plan.changes.length,
    changes: plan.changes,
  }, null, 2));

  if (!WRITE) {
    console.log("Dry-run only. Re-run with --write or WRITE_CANON_REPAIR=true to apply.");
    return;
  }

  await applyRepairPlan(plan);
  const after = await buildRepairPlan();

  console.log(JSON.stringify({
    applied: true,
    remainingChangeCount: after.changes.length,
    remainingChanges: after.changes,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error("Canon repair phase 3 failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
