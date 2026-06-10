require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const GameState = require("../models/GameState");
const JobContract = require("../models/JobContract");
const Mission = require("../models/Mission");
const WorldEvent = require("../models/WorldEvent");
const {
  BLOCK_ROLLS,
  IMPORTANT_TEMPLATES,
  MINOR_TEMPLATES,
} = require("../services/dailyEventSchedulerService");
const { buildSocialConsequenceHintEffect } = require("../services/dailyEventSocialService");
const { expireAvailableMissionsForGameState } = require("../services/missionService");

const GAME_ID = process.env.REPAIR_GAME_ID || "isekai_lucas_main";
const CONTRACT_ID = process.env.REPAIR_CONTRACT_ID || "job_contract_lucas_grulla_azul_d10";
const WRITE = process.argv.includes("--write") || process.env.WRITE_LIVE_CONTINUITY_REPAIR === "true";
const SOURCE = "live_continuity_bug_repair";

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}

function toAbsoluteMinutes(day, time) {
  return (Number(day || 1) - 1) * 1440 + timeToMinutes(time);
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function isPendingAccumulation(entry) {
  return entry && entry.status !== "processed" && !entry.processedAt;
}

function parseDayKey(dayKey) {
  const match = String(dayKey || "").match(/^day_(\d+)$/);
  return match ? Number(match[1]) : null;
}

function getCompletedShiftWindows(contract) {
  const completedShiftsByDay = contract?.flags?.completedShifts || {};
  const windows = [];

  for (const [dayKey, shiftLedger] of Object.entries(completedShiftsByDay)) {
    const day = parseDayKey(dayKey);
    if (!day || !shiftLedger || typeof shiftLedger !== "object") continue;

    for (const completion of Object.values(shiftLedger)) {
      if (!completion?.startedAt || !completion?.completedAt) continue;
      windows.push({
        day,
        shiftId: completion.shiftId || "",
        startedAt: completion.startedAt,
        completedAt: completion.completedAt,
      });
    }
  }

  return windows;
}

function findCoveringCompletedShift(entry, completedShiftWindows) {
  const blockStart = toAbsoluteMinutes(entry.day, entry.blockStart);
  const blockEnd = toAbsoluteMinutes(entry.day, entry.blockEnd);

  return completedShiftWindows.find((shift) => {
    if (shift.day !== entry.day) return false;
    const shiftStart = toAbsoluteMinutes(shift.day, shift.startedAt);
    const shiftEnd = toAbsoluteMinutes(shift.day, shift.completedAt);
    return blockStart < shiftEnd && blockEnd > shiftStart;
  });
}

function buildBiologyRepairPlan(gameState, contract) {
  const completedShiftWindows = getCompletedShiftWindows(contract);
  const pending = gameState.biologicalClock?.pendingAccumulations || [];
  const now = toAbsoluteMinutes(gameState.currentDay, gameState.time);
  const repairs = [];

  for (const entry of pending) {
    if (!isPendingAccumulation(entry)) continue;

    const coveredByShift = findCoveringCompletedShift(entry, completedShiftWindows);
    if (coveredByShift) {
      repairs.push({
        accumulationId: entry.accumulationId,
        mode: "covered_by_completed_job_shift_repair",
        day: entry.day,
        blockStart: entry.blockStart,
        blockEnd: entry.blockEnd,
        category: entry.category,
        minutes: entry.minutes,
        processedDay: coveredByShift.day,
        processedTime: coveredByShift.completedAt,
        reason:
          `Cubierto por el turno completado ${coveredByShift.shiftId}; no se cambia saciedad/energia para evitar doble conteo.`,
      });
      continue;
    }

    if (entry.day && entry.blockEnd && toAbsoluteMinutes(entry.day, entry.blockEnd) < now) {
      repairs.push({
        accumulationId: entry.accumulationId,
        mode: "stale_repaired_no_stat_delta",
        day: entry.day,
        blockStart: entry.blockStart,
        blockEnd: entry.blockEnd,
        category: entry.category,
        minutes: entry.minutes,
        processedDay: gameState.currentDay,
        processedTime: gameState.time,
        reason:
          "Acumulador pendiente de un bloque anterior reparado sin delta retroactivo para evitar doble conteo.",
      });
    }
  }

  return repairs;
}

function applyBiologyRepairs(gameState, repairs) {
  const byId = new Map(repairs.map((repair) => [repair.accumulationId, repair]));
  const pending = gameState.biologicalClock?.pendingAccumulations || [];
  const processedAt = new Date();

  for (const entry of pending) {
    const repair = byId.get(entry.accumulationId);
    if (!repair) continue;

    entry.status = "processed";
    if (!entry.gameId) entry.gameId = gameState.gameId || GAME_ID;
    if (!entry.characterId) entry.characterId = gameState.characterId || "char_lucas";
    entry.processedAt = processedAt;
    entry.processedDay = repair.processedDay;
    entry.processedTime = repair.processedTime;
    entry.processedMode = repair.mode;
    entry.processedReason = repair.reason;
  }

  if (repairs.length > 0) gameState.markModified("biologicalClock");
}

function findTag(tags, prefix) {
  return (tags || []).find((tag) => String(tag).startsWith(prefix)) || "";
}

function findDailyTemplate(templateId) {
  return [...MINOR_TEMPLATES, ...IMPORTANT_TEMPLATES].find((template) => template.id === templateId) || null;
}

function inferDailyEventMetadata(event) {
  const tags = event.tags || [];
  const templateId = findTag(tags, "daily_event_template_").replace("daily_event_template_", "");
  const startKey = findTag(tags, "daily_event_start_").replace("daily_event_start_", "");
  const durationRaw = findTag(tags, "daily_event_duration_").replace("daily_event_duration_", "");
  const importance = tags.includes("daily_event_important") || event.severity === "major" ? "important" : "minor";
  const template = findDailyTemplate(templateId);
  const block = BLOCK_ROLLS.find((entry) => entry.key === startKey || entry.startTime === event.startTime) ||
    BLOCK_ROLLS.find((entry) => entry.startTime === event.startTime) ||
    BLOCK_ROLLS[0];
  const durationDays = Number(durationRaw) || Math.max(1, Number(event.endDay || event.startDay) - Number(event.startDay));

  return {
    templateId,
    template,
    block,
    importance,
    durationDays,
  };
}

function buildMissingDailyEventEffects(event) {
  const existingTypes = new Set((event.effects || []).map((effect) => effect.type));
  const metadata = inferDailyEventMetadata(event);
  const effects = [];

  if (!existingTypes.has("daily_event_rolls")) {
    effects.push({
      type: "daily_event_rolls",
      target: "scheduler",
      value: {
        blockRoll: metadata.block.roll,
        block: metadata.block.block,
        startTime: event.startTime,
        importance: metadata.importance,
        durationDays: metadata.durationDays,
        inferred: true,
      },
      reason: "Metadatos reconstruidos desde tags del evento diario tras reparacion tecnica.",
    });
  }

  if (!existingTypes.has("consequence_if_ignored")) {
    effects.push({
      type: "consequence_if_ignored",
      target: metadata.importance === "important" ? "major_event" : "minor_event",
      value: {
        level: metadata.importance === "important" ? "major" : "minor",
        summary: metadata.template?.consequence || "Consecuencia reconstruida para preservar reglas del evento diario.",
        requiresPlayerResolution: metadata.importance === "important",
        inferred: true,
      },
      reason: "Consecuencia reconstruida desde template/tags tras reparacion tecnica.",
    });
  }

  if (!existingTypes.has("social_consequence_rules")) {
    effects.push(buildSocialConsequenceHintEffect(event));
  }

  return effects;
}

async function repairDailyEventEffects({ write }) {
  const events = await WorldEvent.find({
    gameId: GAME_ID,
    tags: "daily_event",
    status: { $in: ["scheduled", "active", "resolved", "expired", "consequences_applied"] },
  }).exec();

  const repairs = [];

  for (const event of events) {
    const missingEffects = buildMissingDailyEventEffects(event.toObject());
    if (missingEffects.length === 0) continue;

    repairs.push({
      eventId: event.eventId,
      status: event.status,
      addedEffectTypes: missingEffects.map((effect) => effect.type),
    });

    if (write) {
      event.effects = [...(event.effects || []), ...missingEffects];
      event.tags = unique([...(event.tags || []), "admin_effect_repair", SOURCE]);
      await event.save();
    }
  }

  return {
    count: repairs.length,
    repairs,
  };
}

async function main() {
  await connectDB();

  const gameState = await GameState.findOne({ gameId: GAME_ID });
  if (!gameState) throw new Error(`No existe GameState para gameId: ${GAME_ID}`);

  const contract = await JobContract.findOne({ contractId: CONTRACT_ID }).lean();
  const biologyRepairs = buildBiologyRepairPlan(gameState, contract);
  const expiredBefore = await Mission.find({ status: "available" })
    .select("missionId title status expiresDay expiresTime flags")
    .lean();

  let missionExpiry = {
    expiredCount: 0,
    expired: [],
  };

  if (WRITE) {
    applyBiologyRepairs(gameState, biologyRepairs);
    if (biologyRepairs.length > 0) await gameState.save();
    missionExpiry = await expireAvailableMissionsForGameState(gameState, {
      reason: SOURCE,
    });
  } else {
    const currentDay = gameState.currentDay;
    const currentTime = gameState.time;
    const expired = expiredBefore.filter((mission) => {
      if (!mission.expiresDay || !mission.expiresTime) return false;
      if (mission.expiresDay < currentDay) return true;
      if (mission.expiresDay > currentDay) return false;
      return timeToMinutes(mission.expiresTime) <= timeToMinutes(currentTime);
    });
    missionExpiry = {
      expiredCount: expired.length,
      expired: expired.map((mission) => ({
        missionId: mission.missionId,
        title: mission.title,
        expiresDay: mission.expiresDay,
        expiresTime: mission.expiresTime,
      })),
    };
  }

  const dailyEventEffects = await repairDailyEventEffects({ write: WRITE });

  const result = {
    mode: WRITE ? "write" : "dry-run",
    gameId: GAME_ID,
    biology: {
      repairedCount: biologyRepairs.length,
      repairs: biologyRepairs,
    },
    missionExpiry,
    dailyEventEffects,
  };

  console.log(JSON.stringify(result, null, 2));
  if (!WRITE) console.log("Dry-run only. Re-run with --write or WRITE_LIVE_CONTINUITY_REPAIR=true to apply.");

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Live continuity repair failed:", error.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
