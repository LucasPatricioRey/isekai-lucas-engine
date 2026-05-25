try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for API-only checks, but MongoDB is required for full G13 checks.
}

const mongoose = require("mongoose");

const CombatEncounter = require("../models/CombatEncounter");
const GameState = require("../models/GameState");
const WeatherState = require("../models/WeatherState");
const { MARKER_TAGS, SOURCE, weatherState: EXPECTED_WEATHER } = require("../seeds/seedHoshimoriWeather");

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
    throw new Error("MONGODB_URI is required for audit:hoshimori-weather.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
}

async function main() {
  const issues = [];

  console.log("Hoshimori weather audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: read-only API and MongoDB queries.");

  const [beforeContext, activeCombats, currentWeather, muddyPreview, fogPreview, travelPreview] =
    await Promise.all([
      request("/api/context/full"),
      request("/api/combat/encounters/active"),
      request("/api/weather/current?regionId=region_hoshimori"),
      post("/api/weather/effects/preview", {
        regionId: "region_hoshimori",
        routeType: "road",
        terrain: ["mud_road"],
      }),
      post("/api/weather/effects/preview", {
        regionId: "region_hoshimori",
        routeType: "wilderness",
        terrain: ["forest"],
        condition: "fog",
      }),
      post("/api/travel/preview", {
        fromLocationId: "loc_hoshimori_grulla_azul",
        toLocationId: "loc_hoshimori_road_to_mill",
        conditions: {},
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

  section("Weather API Coverage");
  assertEqual(issues, "current weather id", currentWeather.weather?.weatherId, EXPECTED_WEATHER.weatherId);
  assertEqual(issues, "current weather condition", currentWeather.weather?.currentCondition, "cloudy");
  assertEqual(issues, "weather effects preview dryRun", muddyPreview.preview?.dryRun, true);
  assertEqual(issues, "muddy road travel multiplier", muddyPreview.preview?.travelTimeMultiplier, 1.25);
  assertTrue(
    issues,
    "muddy road preview has configured effect",
    (muddyPreview.preview?.effects || []).some((effect) => effect.type === "travel_time_multiplier")
  );
  assertTrue(
    issues,
    "fog preview produces visibility warning",
    (fogPreview.preview?.effects || []).some((effect) => effect.type === "visibility_warning")
  );
  assertEqual(issues, "travel preview current weather rounds road to 35", travelPreview.preview?.timing?.finalMinutes, 35);
  assertEqual(issues, "travel preview mutates state", travelPreview.preview?.willMutateGameState, false);

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

  section("G13 Data Coverage");
  const markerCount = await WeatherState.countDocuments({
    source: SOURCE,
    tags: { $all: MARKER_TAGS },
  });
  const liveWeather = await WeatherState.findOne({ weatherId: EXPECTED_WEATHER.weatherId }).lean();

  assertEqual(issues, "G13 weather marker count", markerCount, 1);
  assertTrue(issues, "live weather exists", Boolean(liveWeather));
  assertEqual(issues, "live weather effect count", liveWeather?.effects?.length || 0, EXPECTED_WEATHER.effects.length);
  assertTrue(
    issues,
    "no major weather event tag present",
    (liveWeather?.tags || []).includes("no_major_event")
  );

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Hoshimori weather audit FAILED:");
    for (const issue of issues) console.error(`- ${issue}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("Hoshimori weather audit OK. No state was mutated.");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Hoshimori weather audit failed unexpectedly:", error.message);
  if (error.response) console.error(JSON.stringify(error.response, null, 2));
  await mongoose.disconnect();
  process.exit(1);
});
