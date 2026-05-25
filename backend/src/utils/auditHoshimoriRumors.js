try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for API-only checks, but MongoDB is required for full G5 checks.
}

const mongoose = require("mongoose");

const CombatEncounter = require("../models/CombatEncounter");
const Faction = require("../models/Faction");
const GameState = require("../models/GameState");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const Rumor = require("../models/Rumor");
const { MARKER_TAGS, SOURCE, rumors: EXPECTED_RUMORS } = require("../seeds/seedHoshimoriRumors");

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
};
const EXPECTED_RUMOR_IDS = EXPECTED_RUMORS.map((rumor) => rumor.rumorId);

const VALID_STATUSES = new Set(["active", "faded", "debunked", "confirmed"]);
const VALID_CERTAINTIES = new Set(["probable", "rumor", "doubtful"]);
const MAX_KNOWN_NPCS_PER_RUMOR = 4;
const FORBIDDEN_TEXT = /romance|romantico|romantica|secreto|secret|privado|private/i;

function endpoint(path) {
  return `${BASE_URL}${path}`;
}

async function request(path) {
  const response = await fetch(endpoint(path), {
    method: "GET",
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
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

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function assertEqual(issues, label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual} (expected ${expected})`);

  if (!ok) {
    issues.push(`${label}: got ${actual}, expected ${expected}`);
  }
}

function assertTrue(issues, label, condition, evidence = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${evidence ? `: ${evidence}` : ""}`);

  if (!condition) {
    issues.push(label);
  }
}

async function assertMongoAvailable() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:hoshimori-rumors.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
}

async function main() {
  const issues = [];

  console.log("Hoshimori rumors audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: read-only API and MongoDB queries.");

  const [context, activeCombats, barroSearch, bosqueSearch] = await Promise.all([
    request("/api/context/full"),
    request("/api/combat/encounters/active"),
    request("/api/search/db?q=barro"),
    request("/api/search/db?q=Bosque"),
  ]);

  const gameState = context.context?.gameState || {};
  const activeCombatList = activeCombats.encounters || [];
  const activeRumors = context.context?.activeRumors || [];

  section("Canon State From API");
  console.log(
    JSON.stringify(
      {
        currentDay: gameState.currentDay,
        time: gameState.time,
        locationId: gameState.locationId,
        moneyCopper: gameState.moneyCopper,
        activeCombatCount: activeCombatList.length,
        contextActiveRumorCount: activeRumors.length,
      },
      null,
      2
    )
  );

  assertEqual(issues, "day", gameState.currentDay, EXPECTED_STATE.day);
  assertEqual(issues, "time", gameState.time, EXPECTED_STATE.time);
  assertEqual(issues, "locationId", gameState.locationId, EXPECTED_STATE.locationId);
  assertEqual(issues, "moneyCopper", gameState.moneyCopper, EXPECTED_STATE.moneyCopper);
  assertEqual(
    issues,
    "active combat count",
    activeCombatList.length,
    EXPECTED_STATE.activeCombatCount
  );

  section("API Rumor Visibility");
  console.log(
    JSON.stringify(
      {
        contextActiveRumorIds: activeRumors.map((rumor) => rumor.rumorId),
        searchBarroRumors: barroSearch.results?.rumors?.map((rumor) => rumor.rumorId) || [],
        searchBosqueRumors: bosqueSearch.results?.rumors?.map((rumor) => rumor.rumorId) || [],
      },
      null,
      2
    )
  );

  assertTrue(issues, "context/full exposes relevant active rumors", activeRumors.length > 0);
  assertTrue(
    issues,
    "search/db?q=barro finds G5 rumors",
    (barroSearch.results?.rumors || []).some((rumor) =>
      EXPECTED_RUMOR_IDS.includes(rumor.rumorId)
    )
  );
  assertTrue(
    issues,
    "search/db?q=Bosque finds rumor results",
    (bosqueSearch.results?.rumors || []).length > 0
  );

  await assertMongoAvailable();

  const [dbGameState, dbActiveCombatCount] = await Promise.all([
    GameState.findOne({ gameId: "isekai_lucas_main" }).lean(),
    CombatEncounter.countDocuments({ gameId: "isekai_lucas_main", status: "active" }),
  ]);

  section("Canon State From MongoDB");
  assertEqual(issues, "db day", dbGameState?.currentDay, EXPECTED_STATE.day);
  assertEqual(issues, "db time", dbGameState?.time, EXPECTED_STATE.time);
  assertEqual(issues, "db locationId", dbGameState?.locationId, EXPECTED_STATE.locationId);
  assertEqual(issues, "db moneyCopper", dbGameState?.moneyCopper, EXPECTED_STATE.moneyCopper);
  assertEqual(issues, "db active combat count", dbActiveCombatCount, EXPECTED_STATE.activeCombatCount);

  section("G5 Rumor Coverage");
  const liveRumors = await Rumor.find({ rumorId: { $in: EXPECTED_RUMOR_IDS } })
    .sort({ rumorId: 1 })
    .lean();
  const g5RumorCount = await Rumor.countDocuments({
    source: SOURCE,
    tags: { $all: MARKER_TAGS },
  });

  console.table(
    liveRumors.map((rumor) => ({
      rumorId: rumor.rumorId,
      certainty: rumor.certainty,
      status: rumor.status,
      knownByNpcCount: rumor.knownByNpcIds?.length || 0,
      locationCount: rumor.locationIds?.length || 0,
      hasMarker:
        rumor.source === SOURCE &&
        MARKER_TAGS.every((tag) => Array.isArray(rumor.tags) && rumor.tags.includes(tag)),
    }))
  );

  assertEqual(issues, "expected G5 rumor count by id", liveRumors.length, EXPECTED_RUMOR_IDS.length);
  assertEqual(issues, "G5 rumors with marker", g5RumorCount, EXPECTED_RUMOR_IDS.length);

  const foundRumorIds = new Set(liveRumors.map((rumor) => rumor.rumorId));
  const missingRumorIds = EXPECTED_RUMOR_IDS.filter((rumorId) => !foundRumorIds.has(rumorId));
  if (missingRumorIds.length > 0) {
    issues.push(`Missing G5 rumors: ${missingRumorIds.join(", ")}`);
  }

  section("Reference And Safety Checks");
  const npcIds = Array.from(new Set(liveRumors.flatMap((rumor) => rumor.knownByNpcIds || [])));
  const locationIds = Array.from(new Set(liveRumors.flatMap((rumor) => rumor.locationIds || [])));
  const factionIds = Array.from(new Set(liveRumors.flatMap((rumor) => rumor.knownByFactionIds || [])));

  const [npcs, locations, factions] = await Promise.all([
    Npc.find({ npcId: { $in: npcIds } }).select("npcId").lean(),
    Location.find({ locationId: { $in: locationIds } }).select("locationId").lean(),
    Faction.find({ factionId: { $in: factionIds } }).select("factionId").lean(),
  ]);

  const existingNpcIds = new Set(npcs.map((entry) => entry.npcId));
  const existingLocationIds = new Set(locations.map((entry) => entry.locationId));
  const existingFactionIds = new Set(factions.map((entry) => entry.factionId));

  const missingNpcIds = npcIds.filter((id) => !existingNpcIds.has(id));
  const missingLocationIds = locationIds.filter((id) => !existingLocationIds.has(id));
  const missingFactionIds = factionIds.filter((id) => !existingFactionIds.has(id));

  assertEqual(issues, "missing knownByNpcIds", missingNpcIds.length, 0);
  assertEqual(issues, "missing locationIds", missingLocationIds.length, 0);
  assertEqual(issues, "missing knownByFactionIds", missingFactionIds.length, 0);

  let invalidStatusCount = 0;
  let invalidCertaintyCount = 0;
  let missingMarkerCount = 0;
  let forbiddenTextCount = 0;
  let overBroadKnownByCount = 0;

  for (const rumor of liveRumors) {
    if (!VALID_STATUSES.has(rumor.status)) invalidStatusCount += 1;
    if (!VALID_CERTAINTIES.has(rumor.certainty)) invalidCertaintyCount += 1;
    if (
      rumor.source !== SOURCE ||
      !MARKER_TAGS.every((tag) => Array.isArray(rumor.tags) && rumor.tags.includes(tag))
    ) {
      missingMarkerCount += 1;
    }

    const text = [
      rumor.content,
      rumor.originalContent,
      rumor.origin,
      ...(rumor.tags || []),
    ].join(" ");
    if (FORBIDDEN_TEXT.test(text)) forbiddenTextCount += 1;
    if ((rumor.knownByNpcIds || []).length > MAX_KNOWN_NPCS_PER_RUMOR) overBroadKnownByCount += 1;
  }

  assertEqual(issues, "invalid status count", invalidStatusCount, 0);
  assertEqual(issues, "invalid certainty count", invalidCertaintyCount, 0);
  assertEqual(issues, "missing marker count", missingMarkerCount, 0);
  assertEqual(issues, "romance/private-secret text count", forbiddenTextCount, 0);
  assertEqual(issues, "over-broad knownByNpcIds count", overBroadKnownByCount, 0);

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Hoshimori rumors audit failed:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    await mongoose.disconnect();
    process.exit(1);
  }

  await mongoose.disconnect();
  console.log("Hoshimori rumors audit OK. No state was mutated.");
}

main().catch(async (error) => {
  console.error("\nHoshimori rumors audit crashed:");
  console.error(error.message);
  if (error.response) {
    console.error(JSON.stringify(error.response, null, 2));
  }
  await mongoose.disconnect();
  process.exit(1);
});
