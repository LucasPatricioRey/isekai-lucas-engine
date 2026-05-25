try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional; API checks need API_KEY from environment when protected.
}

const fs = require("fs");
const path = require("path");

const BASE_URL =
  process.env.AUDIT_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  "https://isekai-lucas-engine.onrender.com";

const API_KEY = process.env.API_KEY || process.env.AUDIT_API_KEY || "dev-secret";

const ROOT_DIR = path.resolve(__dirname, "../..");
const DOCS_DIR = path.join(ROOT_DIR, "docs");
const COMPACT_OPENAPI_PATH = path.join(DOCS_DIR, "openapi-gpt-action-compact.json");
const ADMIN_OPENAPI_PATH = path.join(DOCS_DIR, "openapi-gpt-action-admin.json");
const MATRIX_PATH = path.join(DOCS_DIR, "gpt-actions-operation-matrix.md");

const EXPECTED_STATE = {
  day: 10,
  time: "12:00",
  locationId: "loc_hoshimori_grulla_azul_comedor",
  moneyCopper: 1470,
  mpCurrent: 200,
  activeMissionCount: 0,
  activeCombatCount: 0,
};

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function collectOperations(openapi) {
  const operations = [];
  for (const [routePath, item] of Object.entries(openapi.paths || {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (item[method]) operations.push(`${method.toUpperCase()} ${routePath}`);
    }
  }
  return operations;
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
  };
}

async function checkCompactEndpoints(issues) {
  const [
    context,
    fern,
    docs,
    pavoStock,
    missionBoard,
    routes,
    travelPreview,
    activityPreview,
    magicTechniques,
    weather,
    activeCombats,
  ] = await Promise.all([
    request("/api/context/full"),
    request("/api/search/db?q=Fern"),
    request("/api/search/docs?q=romance"),
    request("/api/economy/shops/shop_pavo_food_stall/stock"),
    request("/api/missions/board"),
    request("/api/travel/routes"),
    request("/api/travel/preview", {
      method: "POST",
      body: JSON.stringify({
        fromLocationId: "loc_hoshimori_grulla_azul",
        toLocationId: "loc_hoshimori_guild",
        conditions: {
          ignoreCurrentWeather: true,
          startTime: "12:40",
        },
      }),
    }),
    request("/api/needs/activity-cost/preview", {
      method: "POST",
      body: JSON.stringify({
        category: "viaje_caminata_suave",
        minutes: 20,
      }),
    }),
    request("/api/magic/techniques"),
    request("/api/weather/current?regionId=region_hoshimori"),
    request("/api/combat/encounters/active"),
  ]);

  section("Compact Critical Endpoints");
  assertCondition(issues, "context/full OK", context.ok === true);
  assertCondition(issues, "search/db returns Fern", (fern.results?.npcs || []).length > 0);
  assertCondition(issues, "search/docs returns docs", (docs.results || []).length > 0);
  assertCondition(issues, "Pavo stock has rows", (pavoStock.stocks || []).length > 0);
  assertCondition(issues, "mission board has missions", (missionBoard.missions || []).length >= 5);
  assertCondition(issues, "routes has rows", (routes.routes || []).length >= 20);
  assertEqual(issues, "travel preview Grulla->Guild minutes", travelPreview.preview?.timing?.finalMinutes, 20);
  assertEqual(issues, "travel preview satiety delta", travelPreview.preview?.biologicalCostPreview?.satietyDelta, -1);
  assertEqual(issues, "travel preview energy delta", travelPreview.preview?.biologicalCostPreview?.energyDelta, -2);
  assertEqual(issues, "activity preview satiety delta", activityPreview.preview?.totalDelta?.satiety, -1);
  assertEqual(issues, "activity preview energy delta", activityPreview.preview?.totalDelta?.energy, -2);
  assertCondition(issues, "magic techniques has entries", (magicTechniques.techniques || []).length >= 6);
  assertCondition(issues, "weather current exists", Boolean(weather.weather?.weatherId));

  const gameState = summarizeGameState(context);
  const activeCombatList = activeCombats.encounters || [];

  section("Canon State");
  console.log(
    JSON.stringify(
      {
        gameState,
        activeCombatCount: activeCombatList.length,
      },
      null,
      2
    )
  );

  assertEqual(issues, "day", gameState.currentDay, EXPECTED_STATE.day);
  assertEqual(issues, "time", gameState.time, EXPECTED_STATE.time);
  assertEqual(issues, "locationId", gameState.locationId, EXPECTED_STATE.locationId);
  assertEqual(issues, "moneyCopper", gameState.moneyCopper, EXPECTED_STATE.moneyCopper);
  assertEqual(issues, "MP current", gameState.mpCurrent, EXPECTED_STATE.mpCurrent);
  assertEqual(issues, "activeMissionIds count", gameState.activeMissionIds.length, EXPECTED_STATE.activeMissionCount);
  assertEqual(issues, "active combat count", activeCombatList.length, EXPECTED_STATE.activeCombatCount);
}

async function main() {
  const issues = [];

  console.log("GPT Builder compact readiness audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: compact OpenAPI + read-only/preview endpoint checks.");

  section("Files");
  for (const filePath of [COMPACT_OPENAPI_PATH, ADMIN_OPENAPI_PATH, MATRIX_PATH]) {
    assertCondition(issues, path.relative(ROOT_DIR, filePath).replace(/\\/g, "/"), fs.existsSync(filePath));
  }

  const compact = readJson(COMPACT_OPENAPI_PATH);
  const admin = readJson(ADMIN_OPENAPI_PATH);
  const compactOps = collectOperations(compact);
  const adminOps = collectOperations(admin);

  section("Schema Shape");
  assertEqual(issues, "compact operation count", compactOps.length, 30);
  assertCondition(issues, "compact has missionPatch", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.missionPatch));
  assertCondition(issues, "compact has shopStockPatches", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.shopStockPatches));
  assertCondition(issues, "compact has npcMemoryPatches", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.npcMemoryPatches));
  assertCondition(issues, "compact excludes rollback", !compact.paths?.["/api/checkpoints/{checkpointId}/rollback"]);
  assertCondition(issues, "compact excludes direct accept mission", !compact.paths?.["/api/missions/{missionId}/accept"]);
  assertCondition(issues, "compact excludes direct report mission", !compact.paths?.["/api/missions/{missionId}/report"]);
  assertCondition(issues, "admin schema has only GET operations", adminOps.every((operation) => operation.startsWith("GET ")));

  await checkCompactEndpoints(issues);

  section("Audit Result");
  if (issues.length > 0) {
    console.error("GPT compact readiness audit FAILED:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log("GPT compact readiness audit OK. No state was mutated.");
}

main().catch((error) => {
  console.error("GPT compact readiness audit failed unexpectedly:", error.message);
  if (error.response) console.error(JSON.stringify(error.response, null, 2));
  process.exit(1);
});
