try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for API-only checks, but MongoDB is required for social graph checks.
}

const mongoose = require("mongoose");

const GameState = require("../models/GameState");
const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const NpcRelationship = require("../models/NpcRelationship");
const Rumor = require("../models/Rumor");

const BASE_URL =
  process.env.AUDIT_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  "https://isekai-lucas-engine.onrender.com";

const API_KEY = process.env.API_KEY || process.env.AUDIT_API_KEY || "dev-secret";
const SOURCE = "g4_hoshimori_social_seed";
const MARKER_TAGS = ["g4", "hoshimori", "social_graph"];

const EXPECTED_STATE = {
  day: 10,
  time: "12:00",
  locationId: "loc_hoshimori_grulla_azul_comedor",
  moneyCopper: 1470,
  activeCombatCount: 0,
};

const EXPECTED_PAIRS = [
  ["npc_roberto_valen", "npc_fern"],
  ["npc_roberto_valen", "npc_yara_mils"],
  ["npc_fern", "npc_yara_mils"],
  ["npc_yara_mils", "npc_brann"],
  ["npc_garrick_thorne", "npc_mara_vell"],
  ["npc_garrick_thorne", "npc_eddan_rusk"],
  ["npc_pavo", "npc_irma"],
  ["npc_pavo", "npc_sella"],
  ["npc_pavo", "npc_liora"],
  ["npc_narek", "npc_maelis"],
  ["npc_kael", "npc_rulan_veck"],
  ["npc_celia_dorn", "npc_kael"],
];

const EXPECTED_MEMORY_IDS = [
  "memory_g4_roberto_lucas_grulla_worker",
  "memory_g4_fern_lucas_magic_awakened",
  "memory_g4_yara_lucas_grulla_worker",
  "memory_g4_garrick_lucas_volunteer",
];

const MIN_RELATIONSHIPS_WITH_LUCAS = {
  npc_roberto_valen: { trust: 56, respect: 35 },
  npc_fern: { trust: 24 },
  npc_yara_mils: { trust: 15, jealousy: 5 },
  npc_garrick_thorne: { trust: 36, respect: 25 },
};

function normalizePair(npcAId, npcBId) {
  return [npcAId, npcBId].sort();
}

function pairQuery(left, right) {
  const [npcAId, npcBId] = normalizePair(left, right);
  return { npcAId, npcBId };
}

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

async function assertMongoAvailable() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:hoshimori-social.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
}

async function main() {
  const issues = [];

  console.log("Hoshimori social graph audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: read-only API and MongoDB queries.");

  const [context, activeCombats] = await Promise.all([
    request("/api/context/full"),
    request("/api/combat/encounters/active"),
  ]);

  const gameState = context.context?.gameState || {};
  const activeCombatList = activeCombats.encounters || [];

  section("Canon State From API");
  console.log(
    JSON.stringify(
      {
        currentDay: gameState.currentDay,
        time: gameState.time,
        locationId: gameState.locationId,
        moneyCopper: gameState.moneyCopper,
        nearbyNpcCount: Array.isArray(context.context?.nearbyNpcs)
          ? context.context.nearbyNpcs.length
          : 0,
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
  assertEqual(
    issues,
    "active combat count",
    activeCombatList.length,
    EXPECTED_STATE.activeCombatCount
  );

  await assertMongoAvailable();

  const dbGameState = await GameState.findOne({ gameId: "isekai_lucas_main" }).lean();
  section("Canon State From MongoDB");
  assertEqual(issues, "db day", dbGameState?.currentDay, EXPECTED_STATE.day);
  assertEqual(issues, "db time", dbGameState?.time, EXPECTED_STATE.time);
  assertEqual(issues, "db locationId", dbGameState?.locationId, EXPECTED_STATE.locationId);
  assertEqual(issues, "db moneyCopper", dbGameState?.moneyCopper, EXPECTED_STATE.moneyCopper);

  section("Relationship Coverage");
  const expectedPairQueries = EXPECTED_PAIRS.map(([left, right]) => pairQuery(left, right));
  const relationshipQuery =
    expectedPairQueries.length > 0 ? { $or: expectedPairQueries } : { relationshipId: "__none__" };
  const [relationshipCount, markerRelationshipCount] = await Promise.all([
    NpcRelationship.countDocuments(relationshipQuery),
    NpcRelationship.countDocuments({
      source: SOURCE,
      tags: { $all: MARKER_TAGS },
    }),
  ]);

  assertEqual(issues, "G4 relationship pair count", relationshipCount, EXPECTED_PAIRS.length);
  console.log(`G4 relationships with marker: ${markerRelationshipCount}`);

  const missingPairs = [];
  const pairRows = [];

  for (const [left, right] of EXPECTED_PAIRS) {
    const { npcAId, npcBId } = pairQuery(left, right);
    const entry = await NpcRelationship.findOne({ npcAId, npcBId }).lean();
    const hasMarker =
      entry?.source === SOURCE &&
      MARKER_TAGS.every((tag) => Array.isArray(entry.tags) && entry.tags.includes(tag));

    pairRows.push({
      pair: `${left}<->${right}`,
      exists: Boolean(entry),
      hasMarker,
      source: entry?.source || "",
      type: entry?.type || "",
      trust: entry?.trust ?? "",
      familiarity: entry?.familiarity ?? "",
      tension: entry?.tension ?? "",
    });

    if (!entry) {
      missingPairs.push(`${left}<->${right}`);
    }
  }

  console.table(pairRows);

  if (missingPairs.length > 0) {
    issues.push(`Missing relationship pairs: ${missingPairs.join(", ")}`);
  }

  section("Memory Coverage");
  const memories = await NpcMemory.find({ memoryId: { $in: EXPECTED_MEMORY_IDS } })
    .sort({ npcId: 1 })
    .lean();

  console.table(
    memories.map((memory) => ({
      memoryId: memory.memoryId,
      npcId: memory.npcId,
      certainty: memory.certainty,
      privacyLevel: memory.privacyLevel,
      canShare: memory.canShare,
    }))
  );

  const foundMemoryIds = new Set(memories.map((memory) => memory.memoryId));
  const missingMemoryIds = EXPECTED_MEMORY_IDS.filter((memoryId) => !foundMemoryIds.has(memoryId));

  assertEqual(issues, "G4 memory count", memories.length, EXPECTED_MEMORY_IDS.length);

  if (missingMemoryIds.length > 0) {
    issues.push(`Missing G4 memories: ${missingMemoryIds.join(", ")}`);
  }

  section("Safety Checks");
  const seedRumorCount = await Rumor.countDocuments({ tags: SOURCE });
  const romanceRelationshipCount = await NpcRelationship.countDocuments({
    $or: [
      { type: /romance/i },
      { tags: /romance/i },
      { publicSummary: /romance/i },
      { privateNotes: /romance/i },
    ],
  });

  assertEqual(issues, "rumors created by G4 seed", seedRumorCount, 0);
  assertEqual(issues, "romance relationships", romanceRelationshipCount, 0);

  const lucasRelationshipRows = [];

  for (const [npcId, minimums] of Object.entries(MIN_RELATIONSHIPS_WITH_LUCAS)) {
    const npc = await Npc.findOne({ npcId }).lean();
    const relationship = npc?.relationshipWithLucas || {};

    lucasRelationshipRows.push({
      npcId,
      trust: relationship.trust ?? 0,
      respect: relationship.respect ?? 0,
      jealousy: relationship.jealousy ?? 0,
      notesPresent: Boolean(relationship.notes),
    });

    for (const [field, minimum] of Object.entries(minimums)) {
      if ((relationship[field] || 0) < minimum) {
        issues.push(`${npcId}.relationshipWithLucas.${field} dropped below ${minimum}`);
      }
    }
  }

  console.table(lucasRelationshipRows);

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Hoshimori social graph audit failed:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    await mongoose.disconnect();
    process.exit(1);
  }

  await mongoose.disconnect();
  console.log("Hoshimori social graph audit OK. No state was mutated.");
}

main().catch(async (error) => {
  console.error("\nHoshimori social graph audit crashed:");
  console.error(error.message);
  if (error.response) {
    console.error(JSON.stringify(error.response, null, 2));
  }
  await mongoose.disconnect();
  process.exit(1);
});
