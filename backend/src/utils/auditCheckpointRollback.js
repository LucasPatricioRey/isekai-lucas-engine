try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for file loading; API checks require API_KEY.
}

const mongoose = require("mongoose");

const Checkpoint = require("../models/Checkpoint");
const CombatEncounter = require("../models/CombatEncounter");
const GameState = require("../models/GameState");

const BASE_URL =
  process.env.AUDIT_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  "https://isekai-lucas-engine.onrender.com";

const API_KEY = process.env.API_KEY || process.env.AUDIT_API_KEY || "dev-secret";
const OFFICIAL_CHECKPOINT_ID = "checkpoint_d10_1200_1779723391623";

const EXPECTED_STATE = {
  day: 10,
  time: "12:00",
  locationId: "loc_hoshimori_grulla_azul_comedor",
  moneyCopper: 1470,
  mpCurrent: 200,
  activeMissionCount: 0,
  activeCombatCount: 0,
};

function endpoint(path) {
  return `${BASE_URL}${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(endpoint(path), {
    ...options,
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => null);

  return {
    status: response.status,
    ok: response.ok,
    data,
  };
}

async function post(path, body) {
  return request(path, {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function assertEqual(issues, label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual} (expected ${expected})`);
  if (!ok) issues.push(`${label}: got ${actual}, expected ${expected}`);
}

function assertTrue(issues, label, condition, evidence = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${evidence ? `: ${evidence}` : ""}`);
  if (!condition) issues.push(label);
}

function summarizeGameState(context) {
  const gameState = context.context?.gameState || {};
  return {
    currentDay: gameState.currentDay,
    time: gameState.time,
    locationId: gameState.locationId,
    moneyCopper: gameState.moneyCopper,
    mpCurrent: gameState.lucasStatus?.mp?.current,
    satietyCurrent: gameState.lucasStatus?.satiety?.current,
    energyCurrent: gameState.lucasStatus?.energy?.current,
    activeMissionIds: gameState.activeMissionIds || [],
  };
}

async function getContextState() {
  const context = await request("/api/context/full");
  if (!context.ok) {
    throw new Error(`context/full failed with HTTP ${context.status}`);
  }
  return summarizeGameState(context.data);
}

async function assertCanonState(issues, labelPrefix = "") {
  const [state, activeCombats] = await Promise.all([
    getContextState(),
    request("/api/combat/encounters/active"),
  ]);
  const activeCombatCount = activeCombats.data?.encounters?.length || 0;

  assertEqual(issues, `${labelPrefix}day`, state.currentDay, EXPECTED_STATE.day);
  assertEqual(issues, `${labelPrefix}time`, state.time, EXPECTED_STATE.time);
  assertEqual(issues, `${labelPrefix}locationId`, state.locationId, EXPECTED_STATE.locationId);
  assertEqual(issues, `${labelPrefix}moneyCopper`, state.moneyCopper, EXPECTED_STATE.moneyCopper);
  assertEqual(issues, `${labelPrefix}MP current`, state.mpCurrent, EXPECTED_STATE.mpCurrent);
  assertEqual(issues, `${labelPrefix}activeMissionIds count`, state.activeMissionIds.length, EXPECTED_STATE.activeMissionCount);
  assertEqual(issues, `${labelPrefix}active combat count`, activeCombatCount, EXPECTED_STATE.activeCombatCount);

  return state;
}

async function assertMongoAvailable() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:checkpoint-rollback.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
}

async function cleanupTempCheckpoint(tempCheckpointId) {
  if (mongoose.connection.readyState === 1) {
    await Checkpoint.deleteOne({ checkpointId: tempCheckpointId });
  }
}

async function rollbackOfficial() {
  return post(`/api/checkpoints/${OFFICIAL_CHECKPOINT_ID}/rollback`, {});
}

async function main() {
  const issues = [];
  const tempCheckpointId = `checkpoint_test_rollback_${Date.now()}`;

  console.log("Checkpoint rollback audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: controlled mutation with rollback to official checkpoint.");

  await assertMongoAvailable();

  try {
    section("Official Checkpoint");
    const official = await Checkpoint.findOne({ checkpointId: OFFICIAL_CHECKPOINT_ID }).lean();
    assertTrue(issues, "official checkpoint exists", Boolean(official), OFFICIAL_CHECKPOINT_ID);

    const officialRollback = await rollbackOfficial();
    assertEqual(issues, "official rollback HTTP", officialRollback.status, 200);
    assertTrue(issues, "official rollback ok", officialRollback.data?.ok === true);
    await assertCanonState(issues, "after official rollback ");

    section("Temporary Checkpoint And Mutation");
    const checkpoint = await post("/api/checkpoints", {
      checkpointId: tempCheckpointId,
      title: "Rollback audit temporary checkpoint",
      reason: "Temporary checkpoint for rollback audit.",
    });
    assertEqual(issues, "temp checkpoint HTTP", checkpoint.status, 200);
    assertTrue(issues, "temp checkpoint created", checkpoint.data?.ok === true);

    const mutation = await post("/api/turn/apply", {
      actionSummary: "Rollback audit controlled travel mutation.",
      timeAdvance: {
        from: "12:00",
        to: "12:20",
      },
      activityCost: {
        category: "viaje_caminata_suave",
        minutes: 20,
        reason: "Rollback audit travel test.",
      },
      gameStatePatch: {
        locationId: "loc_hoshimori_guild",
      },
      eventLogs: [
        {
          source: "mechanical_audit",
          visibility: "hidden",
          summary: "Rollback audit controlled mutation.",
        },
      ],
    });
    assertEqual(issues, "controlled mutation HTTP", mutation.status, 200);
    assertTrue(issues, "controlled mutation ok", mutation.data?.ok === true);
    assertEqual(issues, "controlled mutation location", mutation.data?.gameState?.locationId, "loc_hoshimori_guild");

    const tempRollback = await post(`/api/checkpoints/${tempCheckpointId}/rollback`, {});
    assertEqual(issues, "temp rollback HTTP", tempRollback.status, 200);
    assertTrue(issues, "temp rollback ok", tempRollback.data?.ok === true);
    await assertCanonState(issues, "after temp rollback ");

    section("Final Official Restore");
    const finalRollback = await rollbackOfficial();
    assertEqual(issues, "final official rollback HTTP", finalRollback.status, 200);
    assertTrue(issues, "final official rollback ok", finalRollback.data?.ok === true);
    await assertCanonState(issues, "final ");

    const [dbState, dbActiveCombats] = await Promise.all([
      GameState.findOne({ gameId: "isekai_lucas_main" }).lean(),
      CombatEncounter.countDocuments({ gameId: "isekai_lucas_main", status: "active" }),
    ]);
    assertEqual(issues, "db day", dbState.currentDay, EXPECTED_STATE.day);
    assertEqual(issues, "db time", dbState.time, EXPECTED_STATE.time);
    assertEqual(issues, "db locationId", dbState.locationId, EXPECTED_STATE.locationId);
    assertEqual(issues, "db moneyCopper", dbState.moneyCopper, EXPECTED_STATE.moneyCopper);
    assertEqual(issues, "db MP current", dbState.lucasStatus?.mp?.current, EXPECTED_STATE.mpCurrent);
    assertEqual(issues, "db activeMissionIds count", (dbState.activeMissionIds || []).length, EXPECTED_STATE.activeMissionCount);
    assertEqual(issues, "db active combat count", dbActiveCombats, EXPECTED_STATE.activeCombatCount);
  } catch (error) {
    console.error("Audit encountered an error; attempting final official rollback.");
    try {
      await rollbackOfficial();
    } catch (rollbackError) {
      console.error(`Final official rollback attempt failed: ${rollbackError.message}`);
    }
    throw error;
  } finally {
    await cleanupTempCheckpoint(tempCheckpointId);
    await mongoose.disconnect();
  }

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Checkpoint rollback audit FAILED:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log("Checkpoint rollback audit OK. Final canon state restored.");
}

main().catch(async (error) => {
  console.error("Checkpoint rollback audit failed unexpectedly:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
