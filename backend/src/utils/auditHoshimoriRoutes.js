try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for API-only checks, but MongoDB is required for full G18 checks.
}

const mongoose = require("mongoose");

const CombatEncounter = require("../models/CombatEncounter");
const GameState = require("../models/GameState");
const Location = require("../models/Location");
const TravelRoute = require("../models/TravelRoute");
const { MARKER_TAGS, SOURCE, routes: EXPECTED_ROUTES } = require("../seeds/seedHoshimoriRoutes");

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
  };
}

async function assertMongoAvailable() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:hoshimori-routes.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
}

async function main() {
  const issues = [];

  console.log("Hoshimori routes audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: read-only API and MongoDB queries.");

  const [beforeContext, activeCombats, routesEndpoint, marketPreview, guildPreview, forestPreview, rainPreview] =
    await Promise.all([
      request("/api/context/full"),
      request("/api/combat/encounters/active"),
      request("/api/travel/routes"),
      post("/api/travel/preview", {
        fromLocationId: "loc_hoshimori_grulla_azul",
        toLocationId: "loc_hoshimori_market",
        conditions: {},
      }),
      post("/api/travel/preview", {
        fromLocationId: "loc_hoshimori_grulla_azul",
        toLocationId: "loc_hoshimori_guild",
        conditions: {},
      }),
      post("/api/travel/preview", {
        fromLocationId: "loc_hoshimori_grulla_azul",
        toLocationId: "loc_hoshimori_forest_whispers_edge",
        conditions: {},
      }),
      post("/api/travel/preview", {
        fromLocationId: "loc_hoshimori_grulla_azul",
        toLocationId: "loc_hoshimori_market",
        conditions: { weather: "light_rain" },
      }),
    ]);
  const afterContext = await request("/api/context/full");

  const beforeState = summarizeGameState(beforeContext);
  const afterState = summarizeGameState(afterContext);
  const activeCombatList = activeCombats.encounters || [];

  section("Canon State From API");
  console.log(
    JSON.stringify(
      {
        beforeState,
        afterState,
        activeCombatCount: activeCombatList.length,
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
  assertEqual(issues, "active combat count", activeCombatList.length, EXPECTED_STATE.activeCombatCount);
  assertEqual(issues, "post-preview time unchanged", afterState.time, beforeState.time);
  assertEqual(issues, "post-preview money unchanged", afterState.moneyCopper, beforeState.moneyCopper);
  assertEqual(issues, "post-preview MP unchanged", afterState.mpCurrent, beforeState.mpCurrent);

  section("Travel API Coverage");
  const expectedRouteIds = EXPECTED_ROUTES.map((route) => route.routeId);
  const apiRouteIds = new Set((routesEndpoint.routes || []).map((route) => route.routeId));

  assertTrue(
    issues,
    "routes endpoint has expected G18 routes",
    expectedRouteIds.every((routeId) => apiRouteIds.has(routeId)),
    `${apiRouteIds.size} routes returned`
  );
  assertEqual(issues, "Grulla Azul -> market minutes", marketPreview.preview?.timing?.finalMinutes, 15);
  assertEqual(issues, "Grulla Azul -> guild minutes", guildPreview.preview?.timing?.finalMinutes, 20);
  assertEqual(issues, "Grulla Azul -> forest edge minutes", forestPreview.preview?.timing?.finalMinutes, 90);
  assertEqual(issues, "light rain rounds Grulla Azul -> market to 20", rainPreview.preview?.timing?.finalMinutes, 20);
  assertEqual(issues, "rain modifier count", rainPreview.preview?.appliedModifiers?.length, 1);
  assertEqual(issues, "travel preview mutates state", marketPreview.preview?.willMutateGameState, false);

  await assertMongoAvailable();

  section("Canon State From MongoDB");
  const [gameState, activeCombatCount] = await Promise.all([
    GameState.findOne({ gameId: "isekai_lucas_main" }).lean(),
    CombatEncounter.countDocuments({ gameId: "isekai_lucas_main", status: "active" }),
  ]);

  assertEqual(issues, "db day", gameState.currentDay, EXPECTED_STATE.day);
  assertEqual(issues, "db time", gameState.time, EXPECTED_STATE.time);
  assertEqual(issues, "db locationId", gameState.locationId, EXPECTED_STATE.locationId);
  assertEqual(issues, "db moneyCopper", gameState.moneyCopper, EXPECTED_STATE.moneyCopper);
  assertEqual(issues, "db MP current", gameState.lucasStatus?.mp?.current, EXPECTED_STATE.mpCurrent);
  assertEqual(issues, "db active combat count", activeCombatCount, EXPECTED_STATE.activeCombatCount);

  section("G18 Data Coverage");
  const liveRoutes = await TravelRoute.find({ routeId: { $in: expectedRouteIds } }).lean();
  const markerCount = await TravelRoute.countDocuments({
    source: SOURCE,
    tags: { $all: MARKER_TAGS },
  });
  const liveRouteIds = new Set(liveRoutes.map((route) => route.routeId));
  const missingRoutes = expectedRouteIds.filter((routeId) => !liveRouteIds.has(routeId));
  const locationIds = Array.from(new Set(EXPECTED_ROUTES.flatMap((route) => [route.fromLocationId, route.toLocationId])));
  const liveLocations = await Location.find({ locationId: { $in: locationIds } }).select("locationId").lean();
  const liveLocationIds = new Set(liveLocations.map((location) => location.locationId));
  const missingLocations = locationIds.filter((locationId) => !liveLocationIds.has(locationId));

  assertEqual(issues, "expected G18 route count by id", liveRoutes.length, EXPECTED_ROUTES.length);
  assertEqual(issues, "G18 route marker count", markerCount, EXPECTED_ROUTES.length);
  assertEqual(issues, "missing route count", missingRoutes.length, 0);
  assertEqual(issues, "missing route location refs", missingLocations.length, 0);

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Hoshimori routes audit FAILED:");
    for (const issue of issues) console.error(`- ${issue}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("Hoshimori routes audit OK. No state was mutated.");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Hoshimori routes audit failed unexpectedly:", error.message);
  if (error.response) console.error(JSON.stringify(error.response, null, 2));
  await mongoose.disconnect();
  process.exit(1);
});
