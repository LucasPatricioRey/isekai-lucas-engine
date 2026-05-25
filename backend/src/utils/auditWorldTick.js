try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for API-only checks, but MongoDB is required for full G14 checks.
}

const mongoose = require("mongoose");

const CombatEncounter = require("../models/CombatEncounter");
const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");
const Mission = require("../models/Mission");
const NpcRelationship = require("../models/NpcRelationship");
const Rumor = require("../models/Rumor");
const WorldEvent = require("../models/WorldEvent");

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
    throw new Error("MONGODB_URI is required for audit:world-tick.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
}

async function countSafetyCollections() {
  const [rumorCount, romanceCount, eventCount, eventLogCount, activeCombatCount] = await Promise.all([
    Rumor.countDocuments({}),
    NpcRelationship.countDocuments({
      $or: [
        { type: /romance/i },
        { tags: /romance/i },
        { publicSummary: /romance/i },
      ],
    }),
    WorldEvent.countDocuments({}),
    EventLog.countDocuments({}),
    CombatEncounter.countDocuments({ gameId: "isekai_lucas_main", status: "active" }),
  ]);

  return {
    rumorCount,
    romanceCount,
    eventCount,
    eventLogCount,
    activeCombatCount,
  };
}

async function main() {
  const issues = [];

  console.log("World tick audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: read-only API and MongoDB queries.");

  await assertMongoAvailable();
  const safetyBefore = await countSafetyCollections();

  const [beforeContext, preview, activeCombatsBefore] = await Promise.all([
    request("/api/context/full"),
    post("/api/world/tick/preview", {
      fromDay: 10,
      fromTime: "12:00",
      toDay: 10,
      toTime: "14:00",
      dryRun: true,
    }),
    request("/api/combat/encounters/active"),
  ]);

  const [afterContext, activeCombatsAfter] = await Promise.all([
    request("/api/context/full"),
    request("/api/combat/encounters/active"),
  ]);
  const safetyAfter = await countSafetyCollections();

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

  section("World Tick Preview");
  const tick = preview.preview || {};
  console.log(
    JSON.stringify(
      {
        dryRun: tick.dryRun,
        elapsedMinutes: tick.elapsedMinutes,
        routineUpdates: tick.routines?.updateCount,
        missionExpiring: tick.missionExpiry?.expiringCount,
        activeRumorCandidates: tick.rumors?.candidateCount,
        eventsEnding: tick.events?.endingCount,
        activeCombats: tick.combats?.activeCount,
      },
      null,
      2
    )
  );

  assertEqual(issues, "world tick dryRun", tick.dryRun, true);
  assertEqual(issues, "world tick mutates state", tick.willMutateGameState, false);
  assertEqual(issues, "elapsed minutes 12:00 -> 14:00", tick.elapsedMinutes, 120);
  assertTrue(issues, "routine preview checked NPCs", (tick.routines?.checkedNpcCount || 0) >= 25);
  assertTrue(issues, "routine preview lists possible changes", (tick.routines?.updateCount || 0) >= 1);
  assertEqual(issues, "mission expiry before 18:00", tick.missionExpiry?.expiringCount, 0);
  assertEqual(issues, "world tick active combat count", tick.combats?.activeCount, 0);
  assertEqual(issues, "world tick creates rumors", tick.generatedContent?.willCreateRumors, false);
  assertEqual(issues, "world tick creates romance", tick.generatedContent?.willCreateRomance, false);
  assertEqual(issues, "world tick creates major events", tick.generatedContent?.willCreateMajorEvents, false);
  assertEqual(issues, "world tick grants rewards", tick.generatedContent?.willGrantRewards, false);

  section("Canon State From MongoDB");
  const gameState = await GameState.findOne({ gameId: "isekai_lucas_main" }).lean();
  const availableMissions = await Mission.countDocuments({ status: "available" });

  assertEqual(issues, "db day", gameState.currentDay, EXPECTED_STATE.day);
  assertEqual(issues, "db time", gameState.time, EXPECTED_STATE.time);
  assertEqual(issues, "db locationId", gameState.locationId, EXPECTED_STATE.locationId);
  assertEqual(issues, "db moneyCopper", gameState.moneyCopper, EXPECTED_STATE.moneyCopper);
  assertEqual(issues, "db MP current", gameState.lucasStatus?.mp?.current, EXPECTED_STATE.mpCurrent);
  assertEqual(issues, "db activeMissionIds count", (gameState.activeMissionIds || []).length, EXPECTED_STATE.activeMissionCount);
  assertEqual(issues, "db active combat count", safetyAfter.activeCombatCount, EXPECTED_STATE.activeCombatCount);
  assertTrue(issues, "available missions still present", availableMissions >= 11, `${availableMissions} available`);

  section("Safety Collection Counts");
  console.log(JSON.stringify({ safetyBefore, safetyAfter }, null, 2));

  assertEqual(issues, "rumor count unchanged", safetyAfter.rumorCount, safetyBefore.rumorCount);
  assertEqual(issues, "romance relationship count unchanged", safetyAfter.romanceCount, safetyBefore.romanceCount);
  assertEqual(issues, "world event count unchanged", safetyAfter.eventCount, safetyBefore.eventCount);
  assertEqual(issues, "event log count unchanged", safetyAfter.eventLogCount, safetyBefore.eventLogCount);

  section("Audit Result");
  if (issues.length > 0) {
    console.error("World tick audit FAILED:");
    for (const issue of issues) console.error(`- ${issue}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log("World tick audit OK. No state was mutated.");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("World tick audit failed unexpectedly:", error.message);
  if (error.response) console.error(JSON.stringify(error.response, null, 2));
  await mongoose.disconnect();
  process.exit(1);
});
