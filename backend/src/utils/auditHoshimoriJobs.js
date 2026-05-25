try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for API-only checks, but MongoDB is required for full G8 checks.
}

const mongoose = require("mongoose");

const CombatEncounter = require("../models/CombatEncounter");
const Faction = require("../models/Faction");
const GameState = require("../models/GameState");
const JobContract = require("../models/JobContract");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const { MARKER_TAGS, SOURCE, contract: EXPECTED_CONTRACT } = require("../seeds/seedHoshimoriJobs");

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
  activeCombatCount: 0,
  activeMissionCount: 0,
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

async function assertMongoAvailable() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:hoshimori-jobs.");
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
    activeMissionIds: gameState.activeMissionIds || [],
  };
}

async function main() {
  const issues = [];

  console.log("Hoshimori jobs audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: read-only API and MongoDB queries.");

  const [beforeContext, activeCombats, activeContract, shifts, preview] = await Promise.all([
    request("/api/context/full"),
    request("/api/combat/encounters/active"),
    request("/api/jobs/contracts/active"),
    request("/api/jobs/shifts/available"),
    post("/api/jobs/shifts/shift_grulla_afternoon_1400_2030/preview", {}),
  ]);
  const afterContext = await request("/api/context/full");

  const beforeState = summarizeGameState(beforeContext);
  const afterState = summarizeGameState(afterContext);
  const activeCombatList = activeCombats.encounters || [];

  section("Canon State From API");
  console.log(JSON.stringify({ beforeState, afterState, activeCombatCount: activeCombatList.length }, null, 2));

  assertEqual(issues, "day", beforeState.currentDay, EXPECTED_STATE.day);
  assertEqual(issues, "time", beforeState.time, EXPECTED_STATE.time);
  assertEqual(issues, "locationId", beforeState.locationId, EXPECTED_STATE.locationId);
  assertEqual(issues, "moneyCopper", beforeState.moneyCopper, EXPECTED_STATE.moneyCopper);
  assertEqual(issues, "active combat count", activeCombatList.length, EXPECTED_STATE.activeCombatCount);
  assertEqual(issues, "activeMissionIds count", beforeState.activeMissionIds.length, EXPECTED_STATE.activeMissionCount);
  assertEqual(issues, "post-preview day unchanged", afterState.currentDay, beforeState.currentDay);
  assertEqual(issues, "post-preview time unchanged", afterState.time, beforeState.time);
  assertEqual(issues, "post-preview money unchanged", afterState.moneyCopper, beforeState.moneyCopper);

  section("Job API Coverage");
  assertEqual(issues, "active contract id", activeContract.contract?.contractId, EXPECTED_CONTRACT.contractId);
  assertEqual(issues, "active contract daily pay", activeContract.contract?.pay?.dailyCopper, 140);
  assertEqual(issues, "active contract shift count", activeContract.contract?.shifts?.length || 0, 2);
  assertTrue(
    issues,
    "available shifts endpoint returns contract shifts",
    (shifts.shifts || []).length === 2,
    `${(shifts.shifts || []).length} shifts`
  );
  assertEqual(issues, "preview dryRun", preview.preview?.dryRun, true);
  assertEqual(issues, "preview does not mutate", preview.preview?.mutation?.willMutateGameState, false);
  assertEqual(issues, "afternoon preview pay", preview.preview?.payPreview?.moneyCopper, 70);
  assertEqual(issues, "afternoon biological category", preview.preview?.biologicalPreview?.activities?.[0]?.categoryId, "trabajo_normal");

  await assertMongoAvailable();

  const [dbGameState, dbActiveCombatCount, liveContract, markerCount] = await Promise.all([
    GameState.findOne({ gameId: "isekai_lucas_main" }).lean(),
    CombatEncounter.countDocuments({ gameId: "isekai_lucas_main", status: "active" }),
    JobContract.findOne({ contractId: EXPECTED_CONTRACT.contractId }).lean(),
    JobContract.countDocuments({ source: SOURCE, tags: { $all: MARKER_TAGS } }),
  ]);

  section("Canon State From MongoDB");
  assertEqual(issues, "db day", dbGameState?.currentDay, EXPECTED_STATE.day);
  assertEqual(issues, "db time", dbGameState?.time, EXPECTED_STATE.time);
  assertEqual(issues, "db locationId", dbGameState?.locationId, EXPECTED_STATE.locationId);
  assertEqual(issues, "db moneyCopper", dbGameState?.moneyCopper, EXPECTED_STATE.moneyCopper);
  assertEqual(issues, "db active combat count", dbActiveCombatCount, EXPECTED_STATE.activeCombatCount);
  assertEqual(
    issues,
    "db activeMissionIds count",
    Array.isArray(dbGameState?.activeMissionIds) ? dbGameState.activeMissionIds.length : 0,
    EXPECTED_STATE.activeMissionCount
  );

  section("G8 Contract Coverage");
  assertTrue(issues, "live contract exists", Boolean(liveContract));
  assertEqual(issues, "G8 contract marker count", markerCount, 1);
  assertEqual(issues, "live contract status", liveContract?.status, "active");
  assertEqual(issues, "live contract location", liveContract?.locationId, "loc_hoshimori_grulla_azul");
  assertEqual(issues, "live contract employer", liveContract?.employerNpcId, "npc_roberto_valen");
  assertEqual(issues, "live contract shift count", liveContract?.shifts?.length || 0, 2);

  const [location, employer, faction] = await Promise.all([
    Location.exists({ locationId: liveContract?.locationId }),
    Npc.exists({ npcId: liveContract?.employerNpcId }),
    Faction.exists({ factionId: liveContract?.factionId }),
  ]);

  assertTrue(issues, "contract location exists", Boolean(location));
  assertTrue(issues, "contract employer exists", Boolean(employer));
  assertTrue(issues, "contract faction exists", Boolean(faction));

  const morning = (liveContract?.shifts || []).find((shift) => shift.shiftId === "shift_grulla_morning_0700_1200");
  const afternoon = (liveContract?.shifts || []).find((shift) => shift.shiftId === "shift_grulla_afternoon_1400_2030");

  assertEqual(issues, "morning shift time", `${morning?.startTime}-${morning?.endTime}`, "07:00-12:00");
  assertEqual(issues, "afternoon shift time", `${afternoon?.startTime}-${afternoon?.endTime}`, "14:00-20:30");
  assertEqual(issues, "light meal satiety", liveContract?.mealBenefits?.[0]?.satietyBonus, 20);
  assertEqual(issues, "main meal satiety", liveContract?.mealBenefits?.[1]?.satietyBonus, 30);

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Hoshimori jobs audit failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  await mongoose.disconnect();
  console.log("Hoshimori jobs audit OK. No state was mutated.");
}

main().catch(async (error) => {
  console.error("\nHoshimori jobs audit crashed:");
  console.error(error.message);
  if (error.response) console.error(JSON.stringify(error.response, null, 2));
  await mongoose.disconnect();
  process.exit(1);
});
