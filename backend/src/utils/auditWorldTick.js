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
  minDay: 10,
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

function isTimeString(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function addMinutes(day, time, minutesToAdd) {
  const base = (Number(day || 1) - 1) * 1440 + timeToMinutes(time || "00:00");
  const target = base + Number(minutesToAdd || 0);
  const targetDay = Math.floor(target / 1440) + 1;
  const minutesInDay = ((target % 1440) + 1440) % 1440;
  const hours = String(Math.floor(minutesInDay / 60)).padStart(2, "0");
  const minutes = String(minutesInDay % 60).padStart(2, "0");

  return {
    day: targetDay,
    time: `${hours}:${minutes}`,
  };
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

  const [beforeContext, activeCombatsBefore] = await Promise.all([
    request("/api/context/full"),
    request("/api/combat/encounters/active"),
  ]);

  const beforeState = summarizeGameState(beforeContext);
  const previewTarget = addMinutes(beforeState.currentDay, beforeState.time, 120);
  const preview = await post("/api/world/tick/preview", {
    fromDay: beforeState.currentDay,
    fromTime: beforeState.time,
    toDay: previewTarget.day,
    toTime: previewTarget.time,
    dryRun: true,
  });

  const [afterContext, activeCombatsAfter] = await Promise.all([
    request("/api/context/full"),
    request("/api/combat/encounters/active"),
  ]);
  const safetyAfter = await countSafetyCollections();

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

  assertTrue(issues, "day is playable canon", beforeState.currentDay >= EXPECTED_STATE.minDay, String(beforeState.currentDay));
  assertTrue(issues, "time has HH:MM format", isTimeString(beforeState.time), beforeState.time);
  assertTrue(issues, "locationId exists", Boolean(beforeState.locationId), beforeState.locationId);
  assertTrue(
    issues,
    "moneyCopper is non-negative number",
    Number.isFinite(beforeState.moneyCopper) && beforeState.moneyCopper >= 0,
    String(beforeState.moneyCopper)
  );
  assertTrue(
    issues,
    "mp current is non-negative number",
    Number.isFinite(beforeState.mpCurrent) && beforeState.mpCurrent >= 0,
    String(beforeState.mpCurrent)
  );
  assertTrue(issues, "activeMissionIds is an array", Array.isArray(beforeState.activeMissionIds));
  assertTrue(issues, "active combats endpoint returns array", Array.isArray(activeCombatsBefore.encounters || []));
  assertEqual(
    issues,
    "active combats unchanged",
    (activeCombatsAfter.encounters || []).length,
    (activeCombatsBefore.encounters || []).length
  );
  assertEqual(issues, "post-preview day unchanged", afterState.currentDay, beforeState.currentDay);
  assertEqual(issues, "post-preview time unchanged", afterState.time, beforeState.time);
  assertEqual(issues, "post-preview location unchanged", afterState.locationId, beforeState.locationId);
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
        commitmentReviewsDue: tick.commitmentReviews?.dueCount,
        commitmentReviewPlans: tick.commitmentReviews?.plans?.length,
      },
      null,
      2
    )
  );

  assertEqual(issues, "world tick dryRun", tick.dryRun, true);
  assertEqual(issues, "world tick mutates state", tick.willMutateGameState, false);
  assertEqual(
    issues,
    `${beforeState.currentDay} ${beforeState.time} -> ${previewTarget.day} ${previewTarget.time} elapsed minutes`,
    tick.elapsedMinutes,
    120
  );
  assertTrue(issues, "routine preview checked NPCs", (tick.routines?.checkedNpcCount || 0) >= 1);
  assertTrue(issues, "routine preview has numeric update count", Number.isFinite(tick.routines?.updateCount || 0));
  assertTrue(
    issues,
    "mission expiry preview has numeric expiring count",
    Number.isFinite(tick.missionExpiry?.expiringCount || 0),
    String(tick.missionExpiry?.expiringCount)
  );
  assertEqual(issues, "world tick active combat count matches API", tick.combats?.activeCount, (activeCombatsBefore.encounters || []).length);
  if (tick.commitmentReviews) {
    assertEqual(issues, "commitment review preview mutates state", tick.commitmentReviews.willMutateGameState, false);
    assertTrue(issues, "commitment review plans is an array", Array.isArray(tick.commitmentReviews.plans));
    assertTrue(
      issues,
      "commitment review due count is non-negative",
      Number.isFinite(tick.commitmentReviews.dueCount) && tick.commitmentReviews.dueCount >= 0,
      String(tick.commitmentReviews.dueCount)
    );
  }
  assertEqual(issues, "world tick creates rumors", tick.generatedContent?.willCreateRumors, false);
  assertEqual(issues, "world tick creates romance", tick.generatedContent?.willCreateRomance, false);
  assertEqual(issues, "world tick creates major events", tick.generatedContent?.willCreateMajorEvents, false);
  assertEqual(issues, "world tick grants rewards", tick.generatedContent?.willGrantRewards, false);

  section("Canon State From MongoDB");
  const gameState = await GameState.findOne({ gameId: "isekai_lucas_main" }).lean();
  const availableMissions = await Mission.countDocuments({ status: "available" });

  assertEqual(issues, "db day matches API", gameState.currentDay, beforeState.currentDay);
  assertEqual(issues, "db time matches API", gameState.time, beforeState.time);
  assertEqual(issues, "db locationId matches API", gameState.locationId, beforeState.locationId);
  assertEqual(issues, "db moneyCopper matches API", gameState.moneyCopper, beforeState.moneyCopper);
  assertEqual(issues, "db MP current matches API", gameState.lucasStatus?.mp?.current, beforeState.mpCurrent);
  assertEqual(issues, "db activeMissionIds count matches API", (gameState.activeMissionIds || []).length, beforeState.activeMissionIds.length);
  assertEqual(issues, "db active combat count matches API", safetyAfter.activeCombatCount, (activeCombatsBefore.encounters || []).length);
  assertTrue(issues, "available missions query returns count", availableMissions >= 0, `${availableMissions} available`);

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
