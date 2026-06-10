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

const REQUIRED_FILES = [
  "rules_engine.md",
  "world_bible.md",
  "coverage-map.md",
  "openapi-gpt-action.json",
  "openapi-gpt-action-admin-extra.json",
  "gpt-builder-final-checklist.md",
  "gpt-playtest-script.md",
  "gpt-response-rubric.md",
].map((fileName) => path.join(DOCS_DIR, fileName));

const EXPECTED_STATE = {
  day: 10,
  time: "12:00",
  locationId: "loc_hoshimori_grulla_azul_comedor",
  moneyCopper: 1470,
  mpCurrent: 200,
  activeMissionCount: 0,
  activeCombatCount: 0,
};

const PLAYTEST_PROMPTS = {
  readOnly: [
    "Mostrame el estado actual de Lucas.",
    "Busca informacion de Fern.",
    "Mostrame la cartelera del gremio de Hoshimori.",
    "Mostrame rumores cercanos.",
    "Mostrame el stock de Pavo.",
    "Mostrame rutas desde La Grulla Azul.",
    "Mostrame tecnicas magicas basicas seguras.",
    "Mostrame el clima actual.",
  ],
  previews: [
    "Lucas piensa si le conviene ir al mercado a comprar una racion normal.",
    "Previsualiza el viaje de La Grulla Azul al mercado.",
    "Previsualiza practica de respiracion de mana 30 minutos.",
    "Previsualiza coste de entrenar moderado 1 hora.",
    "Previsualiza world tick de 12:00 a 14:00.",
    "Previsualiza accion de combate solo si hay encuentro activo.",
  ],
  controlledMutations: [
    "Crear checkpoint test.",
    "Aceptar mision simple y rollback manual externo.",
    "Comprar racion y rollback manual externo.",
    "Almorzar comida de contrato y rollback manual externo.",
  ],
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

function relative(filePath) {
  return path.relative(ROOT_DIR, filePath).replace(/\\/g, "/");
}

function readOpenApi() {
  const openApiPath = path.join(DOCS_DIR, "openapi-gpt-action.json");
  return JSON.parse(fs.readFileSync(openApiPath, "utf8"));
}

function validateOpenApi(issues) {
  const openapi = readOpenApi();
  const paths = openapi.paths || {};
  const excluded = new Set(openapi["x-deliberately-excluded"] || []);

  assertCondition(issues, "OpenAPI title exists", Boolean(openapi.info?.title), openapi.info?.title || "");
  assertCondition(issues, "OpenAPI uses ApiKeyAuth", Boolean(openapi.components?.securitySchemes?.ApiKeyAuth));
  assertCondition(issues, "OpenAPI includes context", Boolean(paths["/api/context/full"]?.get));
  assertCondition(issues, "OpenAPI includes weather", Boolean(paths["/api/weather/current"]?.get));
  assertCondition(issues, "OpenAPI includes world events list", Boolean(paths["/api/world/events"]?.get));
  assertCondition(issues, "OpenAPI includes world event detail", Boolean(paths["/api/world/events/{eventId}"]?.get));
  assertCondition(issues, "OpenAPI includes world tick preview", Boolean(paths["/api/world/tick/preview"]?.post));
  assertCondition(issues, "OpenAPI excludes rollback path", !paths["/api/checkpoints/{checkpointId}/rollback"]);
  assertCondition(
    issues,
    "OpenAPI documents rollback as deliberately excluded",
    excluded.has("POST /api/checkpoints/{checkpointId}/rollback")
  );
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

async function checkCriticalEndpoints(issues) {
  const [
    health,
    context,
    searchDocs,
    searchDb,
    missions,
    pavoStock,
    routes,
    magicTechniques,
    weather,
    activeCombats,
  ] = await Promise.all([
    request("/api/health"),
    request("/api/context/full"),
    request("/api/search/docs?q=romance"),
    request("/api/search/db?q=Fern"),
    request("/api/missions/board"),
    request("/api/economy/shops/shop_pavo_food_stall/stock"),
    request("/api/travel/routes"),
    request("/api/magic/techniques"),
    request("/api/weather/current?regionId=region_hoshimori"),
    request("/api/combat/encounters/active"),
  ]);

  section("Critical Endpoints");
  assertCondition(issues, "health OK", health.ok === true);
  assertCondition(issues, "context/full OK", context.ok === true);
  assertCondition(issues, "search/docs returns docs", (searchDocs.results || []).length > 0);
  assertCondition(issues, "search/db returns Fern", (searchDb.results?.npcs || []).length > 0);
  assertCondition(issues, "missions board has missions", (missions.missions || []).length >= 5);
  assertCondition(issues, "Pavo stock has rows", (pavoStock.stocks || []).length > 0);
  assertCondition(issues, "travel routes has routes", (routes.routes || []).length >= 20);
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

function printPlaytestPrompts() {
  section("Suggested GPT Builder Prompts");
  console.log(JSON.stringify(PLAYTEST_PROMPTS, null, 2));
}

async function main() {
  const issues = [];

  console.log("GPT Builder readiness audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: read-only file/API checks.");

  section("Required Files");
  for (const filePath of REQUIRED_FILES) {
    assertCondition(issues, relative(filePath), fs.existsSync(filePath));
  }

  section("OpenAPI");
  validateOpenApi(issues);

  await checkCriticalEndpoints(issues);
  printPlaytestPrompts();

  section("Audit Result");
  if (issues.length > 0) {
    console.error("GPT readiness audit FAILED:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log("GPT readiness audit OK. No state was mutated.");
}

main().catch((error) => {
  console.error("GPT readiness audit failed unexpectedly:", error.message);
  if (error.response) console.error(JSON.stringify(error.response, null, 2));
  process.exit(1);
});
