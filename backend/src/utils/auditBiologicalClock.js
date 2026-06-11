try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for API-only checks, but MongoDB is required for full G9 checks.
}

const mongoose = require("mongoose");

const CombatEncounter = require("../models/CombatEncounter");
const GameState = require("../models/GameState");
const {
  calculateActivityCost,
  getEnergyLabel,
  getSatietyLabel,
  previewBiologicalClockBlock,
} = require("../services/biologicalClockService");

const BASE_URL =
  process.env.AUDIT_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  "https://isekai-lucas-engine.onrender.com";

const API_KEY = process.env.API_KEY || process.env.AUDIT_API_KEY || "dev-secret";

const EXPECTED_STATE = {
  minDay: 10,
  activeCombatCount: 0,
};

const EXPECTED_COSTS = [
  ["actividad_normal", 60, -3, -4],
  ["trabajo_normal", 60, -3, -6],
  ["viaje_caminata_suave", 60, -3, -5],
  ["trabajo_fuerte", 60, -7, -11],
  ["entreno_moderado", 60, -5, -8],
  ["entreno_intenso", 60, -8, -14],
  ["trabajo_normal", 30, -2, -3],
  ["sueno_profundo", 60, -1, 12],
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

function assertCondition(issues, label, condition, evidence = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${evidence ? `: ${evidence}` : ""}`);
  if (!condition) issues.push(label);
}

async function assertMongoAvailable() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:biological-clock.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
}

function summarizeGameState(context) {
  const gameState = context.context?.gameState || {};
  return {
    currentDay: gameState.currentDay,
    time: gameState.time,
    locationId: gameState.locationId,
    moneyCopper: gameState.moneyCopper,
    satiety: gameState.lucasStatus?.satiety?.current,
    energy: gameState.lucasStatus?.energy?.current,
  };
}

async function main() {
  const issues = [];

  console.log("Biological clock audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: read-only API and MongoDB queries.");

  section("Service Cost Table");
  for (const [category, minutes, expectedSatiety, expectedEnergy] of EXPECTED_COSTS) {
    const result = calculateActivityCost({
      category,
      minutes,
      currentSatiety: 30,
      currentEnergy: 59,
    });

    assertEqual(issues, `${category}/${minutes} satiety`, result.delta.satiety, expectedSatiety);
    assertEqual(issues, `${category}/${minutes} energy`, result.delta.energy, expectedEnergy);
  }

  section("Labels");
  assertEqual(issues, "satiety 30 label", getSatietyLabel(30), "hambre fuerte");
  assertEqual(issues, "satiety 0 label", getSatietyLabel(0), "inanicion/riesgo de vida");
  assertEqual(issues, "energy 59 label", getEnergyLabel(59), "cansancio leve/energia media");
  assertEqual(issues, "energy 0 label", getEnergyLabel(0), "colapso");

  const preview = previewBiologicalClockBlock({
    currentStatus: { satiety: 30, energy: 59 },
    activities: [
      { category: "trabajo_normal", minutes: 60 },
      { category: "comer_tranquilo", minutes: 30 },
    ],
  });

  assertEqual(issues, "block preview satiety", preview.totalDelta.satiety, -4);
  assertEqual(issues, "block preview energy", preview.totalDelta.energy, -5);
  assertEqual(issues, "block preview after satiety", preview.after.satiety.current, 26);
  assertEqual(issues, "block preview after energy", preview.after.energy.current, 54);

  const [beforeContext, activeCombats, apiPreview] = await Promise.all([
    request("/api/context/full"),
    request("/api/combat/encounters/active"),
    post("/api/needs/activity-cost/preview", {
      category: "trabajo_normal",
      minutes: 60,
    }),
  ]);
  const afterContext = await request("/api/context/full");
  const beforeState = summarizeGameState(beforeContext);
  const afterState = summarizeGameState(afterContext);
  const activeCombatList = activeCombats.encounters || [];

  section("API Preview");
  console.log(
    JSON.stringify(
      {
        beforeState,
        afterState,
        apiPreview: apiPreview.preview?.totalDelta,
        activeCombatCount: activeCombatList.length,
      },
      null,
      2
    )
  );

  assertEqual(issues, "api preview satiety", apiPreview.preview?.totalDelta?.satiety, -3);
  assertEqual(issues, "api preview energy", apiPreview.preview?.totalDelta?.energy, -6);
  assertCondition(issues, "api day is playable canon", beforeState.currentDay >= EXPECTED_STATE.minDay, String(beforeState.currentDay));
  assertCondition(issues, "api time has HH:MM format", /^([01]\d|2[0-3]):[0-5]\d$/.test(beforeState.time), beforeState.time);
  assertCondition(issues, "api locationId exists", Boolean(beforeState.locationId), beforeState.locationId);
  assertCondition(
    issues,
    "api moneyCopper is non-negative number",
    Number.isFinite(beforeState.moneyCopper) && beforeState.moneyCopper >= 0,
    String(beforeState.moneyCopper)
  );
  assertEqual(issues, "api active combat count", activeCombatList.length, EXPECTED_STATE.activeCombatCount);
  assertEqual(issues, "post-preview time unchanged", afterState.time, beforeState.time);
  assertEqual(issues, "post-preview satiety unchanged", afterState.satiety, beforeState.satiety);
  assertEqual(issues, "post-preview energy unchanged", afterState.energy, beforeState.energy);
  assertEqual(issues, "post-preview money unchanged", afterState.moneyCopper, beforeState.moneyCopper);

  await assertMongoAvailable();

  const [dbGameState, dbActiveCombatCount] = await Promise.all([
    GameState.findOne({ gameId: "isekai_lucas_main" }).lean(),
    CombatEncounter.countDocuments({ gameId: "isekai_lucas_main", status: "active" }),
  ]);

  section("Canon State From MongoDB");
  assertCondition(issues, "db day is playable canon", dbGameState?.currentDay >= EXPECTED_STATE.minDay, String(dbGameState?.currentDay));
  assertCondition(issues, "db time has HH:MM format", /^([01]\d|2[0-3]):[0-5]\d$/.test(dbGameState?.time || ""), dbGameState?.time);
  assertCondition(issues, "db locationId exists", Boolean(dbGameState?.locationId), dbGameState?.locationId);
  assertEqual(issues, "db moneyCopper matches API", dbGameState?.moneyCopper, beforeState.moneyCopper);
  assertEqual(issues, "db active combat count", dbActiveCombatCount, EXPECTED_STATE.activeCombatCount);

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Biological clock audit failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  await mongoose.disconnect();
  console.log("Biological clock audit OK. No state was mutated.");
}

main().catch(async (error) => {
  console.error("\nBiological clock audit crashed:");
  console.error(error.message);
  if (error.response) console.error(JSON.stringify(error.response, null, 2));
  await mongoose.disconnect();
  process.exit(1);
});
