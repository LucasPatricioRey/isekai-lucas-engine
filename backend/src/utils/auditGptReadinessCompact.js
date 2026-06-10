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
const ADMIN_EXTRA_OPENAPI_PATH = path.join(DOCS_DIR, "openapi-gpt-action-admin-extra.json");
const MATRIX_PATH = path.join(DOCS_DIR, "gpt-actions-operation-matrix.md");

const EXPECTED_STATE = {
  minDay: 10,
};

const EXPECTED_MONEY_COPPER =
  process.env.EXPECTED_MONEY_COPPER !== undefined ? Number(process.env.EXPECTED_MONEY_COPPER) : null;
const EXPECTED_MP_CURRENT =
  process.env.EXPECTED_MP_CURRENT !== undefined ? Number(process.env.EXPECTED_MP_CURRENT) : null;
const EXPECTED_ACTIVE_COMBAT_COUNT =
  process.env.EXPECTED_ACTIVE_COMBAT_COUNT !== undefined
    ? Number(process.env.EXPECTED_ACTIVE_COMBAT_COUNT)
    : null;

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
  const lucas = context.context?.lucas || {};
  return {
    currentDay: gameState.currentDay,
    time: gameState.time,
    locationId: gameState.locationId,
    moneyCopper: lucas.money?.totalCopper,
    mpCurrent: lucas.mp?.current,
    activeMissionIds: gameState.activeMissionIds || [],
  };
}

function collectOperationIds(openapi) {
  const operationIds = [];
  for (const pathItem of Object.values(openapi.paths || {})) {
    for (const method of ["get", "post", "put", "patch", "delete"]) {
      if (pathItem[method]?.operationId) operationIds.push(pathItem[method].operationId);
    }
  }
  return operationIds;
}

async function checkCompactEndpoints(issues) {
  const [
    context,
    characterState,
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
    socialImpact,
  ] = await Promise.all([
    request("/api/context/compact"),
    request("/api/characters/char_lucas/state"),
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
    request("/api/npcs/social/impact/preview", {
      method: "POST",
      body: JSON.stringify({
        npcId: "npc_yara_mils",
        actionSummary: "Lucas ayuda a Yara respetando su espacio durante el turno.",
        factors: {
          witnessedByNpc: true,
          mattersToNpc: true,
          fitsPersonality: true,
          helpedNpc: true,
          respectsBoundaries: true,
          practicalConsequence: true,
          withinExpectedDuty: true,
          importance: "meaningful",
        },
      }),
    }),
  ]);

  section("Compact Critical Endpoints");
  assertCondition(issues, "context/compact OK", context.ok === true && context.compact === true);
  assertCondition(issues, "context/compact stays under GPT Actions response budget", JSON.stringify(context).length < 100000);
  assertCondition(issues, "character state has HP", Boolean(characterState.state?.life?.max));
  assertCondition(issues, "character state has MP", Boolean(characterState.state?.mp?.max));
  assertCondition(issues, "search/db returns Fern", (fern.results?.npcs || []).length > 0);
  assertCondition(issues, "search/docs returns docs", (docs.results || []).length > 0);
  assertCondition(issues, "Pavo stock has rows", (pavoStock.stocks || []).length > 0);
  assertCondition(issues, "mission board has playable missions", (missionBoard.missions || []).length >= 1);
  assertCondition(issues, "routes has rows", (routes.routes || []).length >= 20);
  assertEqual(issues, "travel preview Grulla->Guild minutes", travelPreview.preview?.timing?.finalMinutes, 20);
  assertEqual(issues, "travel preview satiety delta", travelPreview.preview?.biologicalCostPreview?.satietyDelta, -1);
  assertEqual(issues, "travel preview energy delta", travelPreview.preview?.biologicalCostPreview?.energyDelta, -2);
  assertEqual(issues, "activity preview satiety delta", activityPreview.preview?.totalDelta?.satiety, -1);
  assertEqual(issues, "activity preview energy delta", activityPreview.preview?.totalDelta?.energy, -2);
  assertCondition(issues, "magic techniques has entries", (magicTechniques.techniques || []).length >= 6);
  assertCondition(issues, "weather current exists", Boolean(weather.weather?.weatherId));
  assertCondition(issues, "social impact preview suggests patch", Boolean(socialImpact.preview?.suggestedPatch?.npcId));
  assertCondition(issues, "social impact preview is dryRun", socialImpact.dryRun === true);

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

  assertCondition(issues, "day is playable canon", gameState.currentDay >= EXPECTED_STATE.minDay, String(gameState.currentDay));
  assertCondition(issues, "time has HH:MM format", /^([01]\d|2[0-3]):[0-5]\d$/.test(gameState.time || ""), gameState.time);
  assertCondition(issues, "locationId exists", Boolean(gameState.locationId), gameState.locationId);
  if (EXPECTED_MONEY_COPPER === null) {
    assertCondition(issues, "moneyCopper is non-negative number", Number.isFinite(gameState.moneyCopper) && gameState.moneyCopper >= 0, String(gameState.moneyCopper));
  } else {
    assertEqual(issues, "moneyCopper", gameState.moneyCopper, EXPECTED_MONEY_COPPER);
  }

  if (EXPECTED_MP_CURRENT === null) {
    assertCondition(issues, "MP current is non-negative number", Number.isFinite(gameState.mpCurrent) && gameState.mpCurrent >= 0, String(gameState.mpCurrent));
  } else {
    assertEqual(issues, "MP current", gameState.mpCurrent, EXPECTED_MP_CURRENT);
  }

  assertCondition(issues, "activeMissionIds is array", Array.isArray(gameState.activeMissionIds), String(gameState.activeMissionIds?.length || 0));
  if (EXPECTED_ACTIVE_COMBAT_COUNT === null) {
    assertCondition(issues, "active combat count is non-negative", activeCombatList.length >= 0, String(activeCombatList.length));
  } else {
    assertEqual(issues, "active combat count", activeCombatList.length, EXPECTED_ACTIVE_COMBAT_COUNT);
  }
}

async function main() {
  const issues = [];

  console.log("GPT Builder compact readiness audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: compact OpenAPI + read-only/preview endpoint checks.");

  section("Files");
  for (const filePath of [COMPACT_OPENAPI_PATH, ADMIN_OPENAPI_PATH, ADMIN_EXTRA_OPENAPI_PATH, MATRIX_PATH]) {
    assertCondition(issues, path.relative(ROOT_DIR, filePath).replace(/\\/g, "/"), fs.existsSync(filePath));
  }

  const compact = readJson(COMPACT_OPENAPI_PATH);
  const admin = readJson(ADMIN_OPENAPI_PATH);
  const adminExtra = readJson(ADMIN_EXTRA_OPENAPI_PATH);
  const compactOps = collectOperations(compact);
  const adminOps = collectOperations(admin);
  const adminExtraOps = collectOperations(adminExtra);
  const compactOperationIds = new Set(collectOperationIds(compact));
  const adminExtraDuplicates = collectOperationIds(adminExtra).filter((operationId) =>
    compactOperationIds.has(operationId)
  );

  section("Schema Shape");
  assertCondition(issues, "compact operation count within limit", compactOps.length <= 30, String(compactOps.length));
  assertCondition(issues, "compact includes context/compact", compactOps.includes("GET /api/context/compact"));
  assertCondition(issues, "compact excludes context/full", !compactOps.includes("GET /api/context/full"));
  assertCondition(issues, "compact includes character state", compactOps.includes("GET /api/characters/{characterId}/state"));
  assertCondition(issues, "compact has missionPatch", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.missionPatch));
  assertCondition(issues, "compact has shopStockPatches", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.shopStockPatches));
  assertCondition(issues, "compact has npcMemoryPatches", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.npcMemoryPatches));
  assertCondition(issues, "compact has npcRelationshipPatches", Boolean(compact.components?.schemas?.ApplyTurnRequest?.properties?.npcRelationshipPatches));
  assertCondition(issues, "compact includes social impact preview", compactOps.includes("POST /api/npcs/social/impact/preview"));
  assertCondition(issues, "compact applyTurn is consequential", compact.paths?.["/api/turn/apply"]?.post?.["x-openai-isConsequential"] === true);
  assertCondition(issues, "compact excludes checkpoint list", !compact.paths?.["/api/checkpoints"]?.get);
  assertCondition(issues, "compact excludes checkpoint create", !compact.paths?.["/api/checkpoints"]?.post);
  assertCondition(issues, "compact excludes rollback", !compact.paths?.["/api/checkpoints/{checkpointId}/rollback"]);
  assertCondition(issues, "compact excludes direct accept mission", !compact.paths?.["/api/missions/{missionId}/accept"]);
  assertCondition(issues, "compact excludes direct report mission", !compact.paths?.["/api/missions/{missionId}/report"]);
  assertCondition(issues, "admin schema has only GET operations", adminOps.every((operation) => operation.startsWith("GET ")));
  assertEqual(issues, "admin extra operation count", adminExtraOps.length, 10);
  assertCondition(issues, "admin extra has only GET operations", adminExtraOps.every((operation) => operation.startsWith("GET ")));
  assertCondition(issues, "admin extra includes world event list", adminExtraOps.includes("GET /api/world/events"));
  assertCondition(issues, "admin extra includes world event detail", adminExtraOps.includes("GET /api/world/events/{eventId}"));
  assertCondition(issues, "admin extra operationIds do not duplicate compact", adminExtraDuplicates.length === 0, adminExtraDuplicates.join(", "));

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
