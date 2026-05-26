try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional; MongoDB/API env vars can come from the shell.
}

const mongoose = require("mongoose");

const CombatEncounter = require("../models/CombatEncounter");
const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");

const BASE_URL =
  process.env.AUDIT_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  "https://isekai-lucas-engine.onrender.com";

const API_KEY = process.env.API_KEY || process.env.AUDIT_API_KEY || "dev-secret";
const GAME_ID = "isekai_lucas_main";
const RUN_PENDING_LOG_ID = "log_1779761547269_izdlv6";

function endpoint(routePath) {
  return `${BASE_URL}${routePath}`;
}

async function request(routePath, options = {}) {
  const response = await fetch(endpoint(routePath), {
    ...options,
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(`${routePath} failed with HTTP ${response.status}`);
    error.response = data;
    throw error;
  }

  return data;
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function assertCondition(issues, label, condition, evidence = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${evidence ? `: ${evidence}` : ""}`);
  if (!condition) issues.push(label);
}

function assertEqual(issues, label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual} (expected ${expected})`);
  if (!ok) issues.push(`${label}: got ${actual}, expected ${expected}`);
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function isPending(entry) {
  return entry && entry.status !== "processed" && !entry.processedAt;
}

async function connectMongo() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:biological-accumulator.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
}

async function migrateKnownRunPendingAccumulator(gameState) {
  const log = await EventLog.findOne({ logId: RUN_PENDING_LOG_ID }).lean();

  if (!log) {
    return {
      action: "skipped_missing_event_log",
      migrated: false,
    };
  }

  const allPending = gameState.biologicalClock?.pendingAccumulations || [];
  const existing = allPending.find((entry) => entry.sourceEventLogId === RUN_PENDING_LOG_ID);

  if (existing) {
    return {
      action: existing.status === "processed" ? "already_processed" : "already_pending",
      migrated: false,
      accumulationId: existing.accumulationId,
    };
  }

  const currentMinutes = timeToMinutes(gameState.time);
  const blockEndMinutes = timeToMinutes("14:00");

  if (gameState.currentDay !== 10 || currentMinutes >= blockEndMinutes) {
    return {
      action: "skipped_block_no_longer_pending",
      migrated: false,
      reason: "The 13:00-14:00 block is no longer open.",
    };
  }

  const accumulation = {
    accumulationId: `bioacc_${RUN_PENDING_LOG_ID}`,
    gameId: gameState.gameId,
    characterId: gameState.characterId || "char_lucas",
    day: 10,
    blockStart: "13:00",
    blockEnd: "14:00",
    category: "esfuerzo_fuerte",
    minutes: 10,
    reason: "Carrera de 10 minutos pendiente del bloque 13:00-14:00 migrada desde EventLog oculto.",
    sourceActionSummary: log.summary,
    sourceEventLogId: RUN_PENDING_LOG_ID,
    status: "pending",
    createdAt: log.createdAt || new Date(),
    processedAt: null,
    processedDay: null,
    processedTime: "",
  };

  await GameState.updateOne(
    { gameId: gameState.gameId },
    {
      $setOnInsert: { gameId: gameState.gameId },
      $push: {
        "biologicalClock.pendingAccumulations": accumulation,
      },
    },
    { runValidators: true }
  );

  return {
    action: "migrated_event_log_to_pending_accumulation",
    migrated: true,
    accumulationId: accumulation.accumulationId,
  };
}

function summarizeGameState(gameState) {
  return {
    currentDay: gameState?.currentDay,
    time: gameState?.time,
    locationId: gameState?.locationId,
    moneyCopper: gameState?.moneyCopper,
    mpCurrent: gameState?.lucasStatus?.mp?.current,
    activeMissionIds: gameState?.activeMissionIds || [],
    pendingAccumulations: (gameState?.biologicalClock?.pendingAccumulations || [])
      .filter(isPending)
      .map((entry) => ({
        accumulationId: entry.accumulationId,
        blockStart: entry.blockStart,
        blockEnd: entry.blockEnd,
        category: entry.category,
        minutes: entry.minutes,
        sourceEventLogId: entry.sourceEventLogId,
      })),
  };
}

async function main() {
  const issues = [];

  console.log("Biological accumulator audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: idempotent migration + read-only verification.");

  await connectMongo();

  let gameState = await GameState.findOne({ gameId: GAME_ID });
  if (!gameState) {
    throw new Error(`Missing GameState ${GAME_ID}`);
  }

  section("Before Migration");
  console.log(JSON.stringify(summarizeGameState(gameState.toObject()), null, 2));

  const migration = await migrateKnownRunPendingAccumulator(gameState.toObject());
  console.log(JSON.stringify(migration, null, 2));

  gameState = await GameState.findOne({ gameId: GAME_ID }).lean();
  const activeCombats = await CombatEncounter.countDocuments({ gameId: GAME_ID, status: "active" });
  const context = await request("/api/context/full");
  const contextGameState = context.context?.gameState || {};
  const contextPending =
    context.context?.pendingBiologicalAccumulations ||
    (contextGameState.biologicalClock?.pendingAccumulations || []).filter(isPending);

  section("After Migration");
  console.log(
    JSON.stringify(
      {
        mongo: summarizeGameState(gameState),
        contextPendingCount: contextPending.length,
        activeCombats,
      },
      null,
      2
    )
  );

  const pending = gameState.biologicalClock?.pendingAccumulations || [];
  const knownRunEntries = pending.filter((entry) => entry.sourceEventLogId === RUN_PENDING_LOG_ID);
  const pendingRunEntries = knownRunEntries.filter(isPending);

  section("Assertions");
  assertCondition(issues, "GameState has biologicalClock", Boolean(gameState.biologicalClock));
  assertCondition(
    issues,
    "GameState has formal pendingAccumulations array",
    Array.isArray(gameState.biologicalClock?.pendingAccumulations)
  );
  assertCondition(issues, "known run pending entry is unique", knownRunEntries.length <= 1, String(knownRunEntries.length));
  assertCondition(
    issues,
    "known run pending exists or block is no longer pending",
    pendingRunEntries.length === 1 || migration.action === "skipped_block_no_longer_pending" || migration.action === "already_processed",
    migration.action
  );
  if (pendingRunEntries.length === 1) {
    assertEqual(issues, "known run category", pendingRunEntries[0].category, "esfuerzo_fuerte");
    assertEqual(issues, "known run minutes", pendingRunEntries[0].minutes, 10);
    assertEqual(issues, "known run blockStart", pendingRunEntries[0].blockStart, "13:00");
    assertEqual(issues, "known run blockEnd", pendingRunEntries[0].blockEnd, "14:00");
  }
  assertCondition(
    issues,
    "context exposes pending accumulations",
    Array.isArray(contextPending) && contextPending.length >= pending.filter(isPending).length,
    String(contextPending.length)
  );
  assertCondition(issues, "day is playable canon", gameState.currentDay >= 10, String(gameState.currentDay));
  assertCondition(issues, "time has HH:MM format", /^([01]\d|2[0-3]):[0-5]\d$/.test(gameState.time), gameState.time);
  assertEqual(issues, "moneyCopper", gameState.moneyCopper, 1470);
  assertEqual(issues, "MP current", gameState.lucasStatus?.mp?.current, 200);
  assertEqual(issues, "active combat count", activeCombats, 0);

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Biological accumulator audit FAILED:");
    for (const issue of issues) console.error(`- ${issue}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  await mongoose.disconnect();
  console.log("Biological accumulator audit OK.");
}

main().catch(async (error) => {
  console.error("Biological accumulator audit failed unexpectedly:", error.message);
  if (error.response) console.error(JSON.stringify(error.response, null, 2));
  await mongoose.disconnect();
  process.exit(1);
});
