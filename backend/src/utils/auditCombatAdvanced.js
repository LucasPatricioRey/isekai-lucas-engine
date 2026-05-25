try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for API-only checks, but MongoDB is required for full G12 checks.
}

const mongoose = require("mongoose");

const CombatEncounter = require("../models/CombatEncounter");
const GameState = require("../models/GameState");
const Item = require("../models/Item");

const BASE_URL =
  process.env.AUDIT_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  "https://isekai-lucas-engine.onrender.com";

const API_KEY = process.env.API_KEY || process.env.AUDIT_API_KEY || "dev-secret";

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

  if (!response.ok) {
    const error = new Error(`${path} failed with HTTP ${response.status}`);
    error.response = data;
    throw error;
  }

  return data;
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
    activeMissionIds: gameState.activeMissionIds || [],
    inventory: gameState.inventory || [],
    skills: gameState.skills || [],
  };
}

async function assertMongoAvailable() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:combat-advanced.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
}

async function main() {
  const issues = [];

  console.log("Combat advanced audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: read-only API and MongoDB queries; fixture previews only.");

  const [beforeContext, activeCombatsBefore, actionsEndpoint, missingPreview, attackPreview, defendPreview, retreatPreview] =
    await Promise.all([
      request("/api/context/full"),
      request("/api/combat/encounters/active"),
      request("/api/combat/actions"),
      post("/api/combat/encounters/combat_missing_for_audit/actions/preview", {
        actionType: "attack",
      }),
      post("/api/combat/encounters/fixture_enemy_lobo_borde/actions/preview", {
        actionType: "attack",
      }),
      post("/api/combat/encounters/fixture_enemy_lobo_borde/actions/preview", {
        actionType: "defend",
      }),
      post("/api/combat/encounters/fixture_enemy_lobo_borde/actions/preview", {
        actionType: "retreat",
      }),
    ]);

  const [afterContext, activeCombatsAfter] = await Promise.all([
    request("/api/context/full"),
    request("/api/combat/encounters/active"),
  ]);

  const beforeState = summarizeGameState(beforeContext);
  const afterState = summarizeGameState(afterContext);

  section("Canon State From API");
  console.log(
    JSON.stringify(
      {
        beforeState: {
          currentDay: beforeState.currentDay,
          time: beforeState.time,
          locationId: beforeState.locationId,
          moneyCopper: beforeState.moneyCopper,
          mpCurrent: beforeState.mpCurrent,
          activeMissionIds: beforeState.activeMissionIds,
          inventoryCount: beforeState.inventory.length,
        },
        afterState: {
          currentDay: afterState.currentDay,
          time: afterState.time,
          locationId: afterState.locationId,
          moneyCopper: afterState.moneyCopper,
          mpCurrent: afterState.mpCurrent,
          activeMissionIds: afterState.activeMissionIds,
          inventoryCount: afterState.inventory.length,
        },
        activeCombatsBefore: (activeCombatsBefore.encounters || []).length,
        activeCombatsAfter: (activeCombatsAfter.encounters || []).length,
      },
      null,
      2
    )
  );

  assertEqual(issues, "day", beforeState.currentDay, EXPECTED_STATE.day);
  assertEqual(issues, "time", beforeState.time, EXPECTED_STATE.time);
  assertEqual(issues, "locationId", beforeState.locationId, EXPECTED_STATE.locationId);
  assertEqual(issues, "moneyCopper", beforeState.moneyCopper, EXPECTED_STATE.moneyCopper);
  assertEqual(issues, "mp current", beforeState.mpCurrent, EXPECTED_STATE.mpCurrent);
  assertEqual(issues, "activeMissionIds count", beforeState.activeMissionIds.length, EXPECTED_STATE.activeMissionCount);
  assertEqual(issues, "active combats before", (activeCombatsBefore.encounters || []).length, EXPECTED_STATE.activeCombatCount);
  assertEqual(issues, "active combats after", (activeCombatsAfter.encounters || []).length, EXPECTED_STATE.activeCombatCount);
  assertEqual(issues, "post-preview time unchanged", afterState.time, beforeState.time);
  assertEqual(issues, "post-preview money unchanged", afterState.moneyCopper, beforeState.moneyCopper);
  assertEqual(issues, "post-preview MP unchanged", afterState.mpCurrent, beforeState.mpCurrent);
  assertEqual(issues, "post-preview inventory count unchanged", afterState.inventory.length, beforeState.inventory.length);

  section("Combat Action API Coverage");
  const actionTypes = new Set((actionsEndpoint.actions || []).map((action) => action.actionType));
  const expectedActions = [
    "attack",
    "defend",
    "dodge",
    "retreat",
    "intimidate",
    "use_item",
    "cast_magic_preview",
    "surrender",
    "protect",
  ];

  assertTrue(
    issues,
    "actions endpoint exposes all expected actions",
    expectedActions.every((actionType) => actionTypes.has(actionType)),
    `${actionTypes.size} actions`
  );
  assertEqual(issues, "missing encounter preview blocked", missingPreview.preview?.canAct, false);
  assertTrue(issues, "missing encounter has blocked reason", Boolean(missingPreview.preview?.blockedReason));
  assertEqual(issues, "fixture attack canAct", attackPreview.preview?.canAct, true);
  assertEqual(issues, "fixture attack dryRun", attackPreview.preview?.dryRun, true);
  assertEqual(issues, "fixture attack will mutate state", attackPreview.preview?.mutation?.willMutateGameState, false);
  assertEqual(issues, "fixture attack grants loot", attackPreview.preview?.mutation?.willGrantLoot, false);
  assertTrue(issues, "fixture attack has outcomes", (attackPreview.preview?.possibleOutcomes || []).length > 0);
  assertEqual(issues, "fixture defend canAct", defendPreview.preview?.canAct, true);
  assertEqual(issues, "fixture retreat canAct", retreatPreview.preview?.canAct, true);
  assertTrue(issues, "fixture retreat warns or estimates risk", (retreatPreview.preview?.possibleOutcomes || []).length > 0);

  await assertMongoAvailable();

  section("Canon State From MongoDB");
  const [gameState, activeCombatCount, itemCount] = await Promise.all([
    GameState.findOne({ gameId: "isekai_lucas_main" }).lean(),
    CombatEncounter.countDocuments({ gameId: "isekai_lucas_main", status: "active" }),
    Item.countDocuments({}),
  ]);

  assertEqual(issues, "db day", gameState.currentDay, EXPECTED_STATE.day);
  assertEqual(issues, "db time", gameState.time, EXPECTED_STATE.time);
  assertEqual(issues, "db locationId", gameState.locationId, EXPECTED_STATE.locationId);
  assertEqual(issues, "db moneyCopper", gameState.moneyCopper, EXPECTED_STATE.moneyCopper);
  assertEqual(issues, "db MP current", gameState.lucasStatus?.mp?.current, EXPECTED_STATE.mpCurrent);
  assertEqual(issues, "db activeMissionIds count", (gameState.activeMissionIds || []).length, EXPECTED_STATE.activeMissionCount);
  assertEqual(issues, "db active combat count", activeCombatCount, EXPECTED_STATE.activeCombatCount);
  assertTrue(issues, "item catalog still present", itemCount >= 36, `${itemCount} items`);

  section("Safety Checks");
  assertEqual(issues, "attack preview closes combat", attackPreview.preview?.mutation?.willCloseCombat, false);
  assertEqual(issues, "defend preview mutates encounter", defendPreview.preview?.mutation?.willMutateEncounter, false);
  assertEqual(issues, "retreat preview mutates state", retreatPreview.preview?.mutation?.willMutateGameState, false);

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Combat advanced audit FAILED:");
    for (const issue of issues) console.error(`- ${issue}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("Combat advanced audit OK. No state was mutated.");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Combat advanced audit failed unexpectedly:", error.message);
  if (error.response) console.error(JSON.stringify(error.response, null, 2));
  await mongoose.disconnect();
  process.exit(1);
});
