try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for API-only checks, but MongoDB is required for full checks.
}

const mongoose = require("mongoose");

const CombatEncounter = require("../models/CombatEncounter");
const EnemyTemplate = require("../models/EnemyTemplate");
const GameState = require("../models/GameState");

const BASE_URL =
  process.env.AUDIT_COMBAT_BASE_URL ||
  process.env.AUDIT_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  "https://isekai-lucas-engine-1.onrender.com";

const API_KEY = process.env.API_KEY || process.env.AUDIT_API_KEY || "dev-secret";
const GAME_ID = "isekai_lucas_main";
const EXPECTED_COMBAT_SKILLS = [
  "skill_esquiva",
  "skill_bloqueo",
  "skill_retirada",
  "skill_pelea_sin_armas",
  "skill_daga",
  "skill_tactica_basica",
];
const EXPECTED_APPLIED_ACTIONS = [
  "attack",
  "defend",
  "block",
  "dodge",
  "observe",
  "move",
  "flee",
  "surrender",
  "use_item",
  "intimidate",
  "prepare",
];

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

function collectOperations(openapi) {
  const operations = [];
  for (const [routePath, pathItem] of Object.entries(openapi.paths || {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (pathItem[method]) operations.push(`${method.toUpperCase()} ${routePath}`);
    }
  }
  return operations;
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

function summarizeGameState(contextResponse) {
  const gameState = contextResponse.data?.context?.gameState || {};
  return {
    currentDay: gameState.currentDay,
    time: gameState.time,
    locationId: gameState.locationId,
    moneyCopper: gameState.moneyCopper,
    lifeCurrent: gameState.lucasStatus?.life?.current,
    satietyCurrent: gameState.lucasStatus?.satiety?.current,
    energyCurrent: gameState.lucasStatus?.energy?.current,
    mpCurrent: gameState.lucasStatus?.mp?.current,
    inventoryCount: (gameState.inventory || []).length,
    skillIds: (gameState.skills || []).map((skill) => skill.skillId),
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
  console.log("Mode: read-only API checks, preview start only, and MongoDB verification.");

  const [beforeContext, activeBefore, actionsEndpoint, schemaResponse, previewStart, missingPreview] =
    await Promise.all([
      request("/api/context/full"),
      request(`/api/combat/advanced/encounters/active?gameId=${encodeURIComponent(GAME_ID)}`),
      request("/api/combat/advanced/actions"),
      request("/docs/openapi-gpt-action-combat.json"),
      post("/api/combat/advanced/encounters/start/preview", {
        gameId: GAME_ID,
        enemyId: "enemy_lobo_borde",
        reason: "Audit read-only preview: no iniciar combate.",
      }),
      post("/api/combat/advanced/encounters/combat_missing_for_audit/actions/preview", {
        gameId: GAME_ID,
        actionType: "attack",
      }),
    ]);

  const [afterContext, activeAfter] = await Promise.all([
    request("/api/context/full"),
    request(`/api/combat/advanced/encounters/active?gameId=${encodeURIComponent(GAME_ID)}`),
  ]);

  section("HTTP Reachability");
  assertEqual(issues, "context status", beforeContext.status, 200);
  assertEqual(issues, "advanced active status", activeBefore.status, 200);
  assertEqual(issues, "advanced actions status", actionsEndpoint.status, 200);
  assertEqual(issues, "combat schema status", schemaResponse.status, 200);
  assertEqual(issues, "preview start status", previewStart.status, 200);
  assertEqual(issues, "missing encounter preview stays blocked", missingPreview.status, 404);

  const beforeState = summarizeGameState(beforeContext);
  const afterState = summarizeGameState(afterContext);
  const activeBeforeCount = (activeBefore.data?.encounters || []).length;
  const activeAfterCount = (activeAfter.data?.encounters || []).length;

  section("No Mutation");
  assertEqual(issues, "day unchanged", afterState.currentDay, beforeState.currentDay);
  assertEqual(issues, "time unchanged", afterState.time, beforeState.time);
  assertEqual(issues, "location unchanged", afterState.locationId, beforeState.locationId);
  assertEqual(issues, "money unchanged", afterState.moneyCopper, beforeState.moneyCopper);
  assertEqual(issues, "life unchanged", afterState.lifeCurrent, beforeState.lifeCurrent);
  assertEqual(issues, "satiety unchanged", afterState.satietyCurrent, beforeState.satietyCurrent);
  assertEqual(issues, "energy unchanged", afterState.energyCurrent, beforeState.energyCurrent);
  assertEqual(issues, "MP unchanged", afterState.mpCurrent, beforeState.mpCurrent);
  assertEqual(issues, "inventory count unchanged", afterState.inventoryCount, beforeState.inventoryCount);
  assertEqual(issues, "active advanced combats before", activeBeforeCount, 0);
  assertEqual(issues, "active advanced combats after", activeAfterCount, 0);

  section("Combat Action Coverage");
  const actionTypes = new Set((actionsEndpoint.data?.actions || []).map((action) => action.actionType));
  const appliedActionTypes = new Set(
    (actionsEndpoint.data?.actions || [])
      .filter((action) => action.c4ApplySupported)
      .map((action) => action.actionType)
  );
  assertTrue(
    issues,
    "advanced actions expose expected applied action types",
    EXPECTED_APPLIED_ACTIONS.every((actionType) => appliedActionTypes.has(actionType)),
    Array.from(appliedActionTypes).sort().join(", ")
  );
  assertTrue(issues, "catalog includes unsupported future actions safely", actionTypes.has("use_magic") && actionTypes.has("protect"));
  assertEqual(issues, "preview start canStart", previewStart.data?.preview?.canStart, true);
  assertEqual(issues, "preview start does not mutate GameState", previewStart.data?.preview?.mutation?.willMutateGameState, false);
  assertEqual(issues, "preview start would create encounter only on apply", previewStart.data?.preview?.mutation?.willCreateEncounter, true);
  assertTrue(issues, "preview start exposes C12 encounter policy", Boolean(previewStart.data?.preview?.encounterDraft?.encounterPolicy?.gptBoundary));

  section("OpenAPI Combat Schema");
  const combatSchema = schemaResponse.data || {};
  const operations = collectOperations(combatSchema);
  const compactRole = combatSchema["x-action-role"];
  assertEqual(issues, "schema role", compactRole, "combat-advanced");
  assertTrue(issues, "schema operation count <= 20", operations.length <= 20, String(operations.length));
  assertTrue(issues, "schema includes applyAction", Boolean(combatSchema.paths?.["/api/combat/advanced/actions/apply"]?.post));
  assertTrue(issues, "schema includes block enum", combatSchema.components?.schemas?.PreviewActionRequest?.properties?.actionType?.enum?.includes("block"));
  assertTrue(issues, "schema includes combatMode", Boolean(combatSchema.components?.schemas?.CombatMode));
  assertTrue(issues, "schema includes encounterType", Boolean(combatSchema.components?.schemas?.EncounterType));

  await assertMongoAvailable();

  section("MongoDB Combat Readiness");
  const [gameState, lobo, activeDbCount] = await Promise.all([
    GameState.findOne({ gameId: GAME_ID }).lean(),
    EnemyTemplate.findOne({ enemyId: "enemy_lobo_borde" }).lean(),
    CombatEncounter.countDocuments({ gameId: GAME_ID, status: "active" }),
  ]);
  const dbSkillIds = new Set((gameState?.skills || []).map((skill) => skill.skillId));

  assertTrue(issues, "live GameState exists", Boolean(gameState));
  assertEqual(issues, "db day matches API", gameState?.currentDay, beforeState.currentDay);
  assertEqual(issues, "db time matches API", gameState?.time, beforeState.time);
  assertEqual(issues, "db active combat count", activeDbCount, 0);
  assertTrue(issues, "enemy_lobo_borde exists", Boolean(lobo));
  assertTrue(
    issues,
    "technical combat skills exist on Lucas",
    EXPECTED_COMBAT_SKILLS.every((skillId) => dbSkillIds.has(skillId)),
    EXPECTED_COMBAT_SKILLS.filter((skillId) => !dbSkillIds.has(skillId)).join(", ")
  );

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
  await mongoose.disconnect();
  process.exit(1);
});
