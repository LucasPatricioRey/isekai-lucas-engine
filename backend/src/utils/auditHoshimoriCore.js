try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for this read-only audit.
}

const mongoose = require("mongoose");

const Npc = require("../models/Npc");
const Location = require("../models/Location");

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

const EXPECTED_NPCS = [
  "npc_roberto_valen",
  "npc_fern",
  "npc_yara_mils",
  "npc_garrick_thorne",
  "npc_mara_vell",
  "npc_eddan_rusk",
  "npc_brann",
  "npc_pavo",
  "npc_borin",
  "npc_sella",
  "npc_liora",
  "npc_narek",
  "npc_kael",
  "npc_celia_dorn",
  "npc_irma",
  "npc_sael_nyra",
  "npc_oren",
  "npc_tessa",
  "npc_hilda_fen",
  "npc_rulan_veck",
  "npc_merek_sol",
  "npc_nia",
  "npc_doran",
  "npc_maelis",
  "npc_joren_pell",
];

const EXPECTED_LOCATIONS = [
  "loc_hoshimori_grulla_azul",
  "loc_hoshimori_grulla_azul_comedor",
  "loc_hoshimori_grulla_azul_cocina",
  "loc_hoshimori_lucas_room",
  "loc_hoshimori_grulla_azul_entrance_stable",
  "loc_hoshimori_plaza",
  "loc_hoshimori_market",
  "loc_hoshimori_guild",
  "loc_hoshimori_guild_patio",
  "loc_hoshimori_temple_serene_flame",
  "loc_hoshimori_borin_smithy",
  "loc_hoshimori_sella_workshop",
  "loc_hoshimori_liora_stall",
  "loc_hoshimori_road_to_mill",
  "loc_hoshimori_mill",
  "loc_hoshimori_forest_whispers_edge",
  "loc_hoshimori_forest_whispers_mid",
  "loc_hoshimori_forest_whispers_deep",
  "loc_hoshimori_gray_hills_base",
  "loc_hoshimori_gray_hills_caves",
  "loc_hoshimori_bakery",
  "loc_hoshimori_guard_post",
  "loc_hoshimori_council_records",
  "loc_hoshimori_tannery",
  "loc_hoshimori_road_entrance",
];

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

  return {
    ok: response.ok,
    status: response.status,
    data,
  };
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function count(value) {
  return Array.isArray(value) ? value.length : 0;
}

async function findMissingByEndpoint(ids, buildPath) {
  const found = [];
  const missing = [];

  for (const id of ids) {
    const result = await request(buildPath(id));

    if (result.ok) {
      found.push(id);
    } else {
      missing.push({ id, status: result.status, error: result.data?.error || "" });
    }
  }

  return { found, missing };
}

async function getMongoCountsIfAvailable() {
  if (!process.env.MONGODB_URI) {
    return {
      available: false,
      reason: "MONGODB_URI not present in this environment.",
    };
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const [npcCount, locationCount] = await Promise.all([
    Npc.countDocuments({ regionId: "region_hoshimori" }),
    Location.countDocuments({ regionId: "region_hoshimori" }),
  ]);

  await mongoose.disconnect();

  return {
    available: true,
    npcCount,
    locationCount,
  };
}

function assertEqual(issues, label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual} (expected ${expected})`);

  if (!ok) {
    issues.push(`${label}: got ${actual}, expected ${expected}`);
  }
}

async function main() {
  const issues = [];

  console.log("Hoshimori core live audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: read-only GET requests; optional MongoDB counts only when MONGODB_URI exists.");

  const [context, activeCombats, narekSearch, pavoSearch, borinSearch, lioraSearch] =
    await Promise.all([
      request("/api/context/full"),
      request("/api/combat/encounters/active"),
      request("/api/search/db?q=Narek"),
      request("/api/search/db?q=Pavo"),
      request("/api/search/db?q=Borin"),
      request("/api/search/db?q=Liora"),
    ]);

  if (!context.ok) issues.push(`context/full failed with ${context.status}`);
  if (!activeCombats.ok) issues.push(`combat active failed with ${activeCombats.status}`);

  const gameState = context.data?.context?.gameState || {};
  const activeCombatList = activeCombats.data?.encounters || [];

  section("Canon State");
  console.log(
    JSON.stringify(
      {
        currentDay: gameState.currentDay,
        time: gameState.time,
        locationId: gameState.locationId,
        moneyCopper: gameState.moneyCopper,
        nearbyNpcCount: count(context.data?.context?.nearbyNpcs),
        activeCombatCount: count(activeCombatList),
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
    count(activeCombatList),
    EXPECTED_STATE.activeCombatCount
  );

  section("Expected NPC Endpoint Coverage");
  const npcCoverage = await findMissingByEndpoint(
    EXPECTED_NPCS,
    (id) => `/api/npcs/${id}/full`
  );
  console.log(`Expected NPCs: ${EXPECTED_NPCS.length}`);
  console.log(`Found NPCs by API: ${npcCoverage.found.length}`);
  console.log(`Missing NPCs by API: ${npcCoverage.missing.length}`);
  if (npcCoverage.missing.length > 0) {
    console.table(npcCoverage.missing);
    issues.push(`Missing Hoshimori NPCs: ${npcCoverage.missing.map((entry) => entry.id).join(", ")}`);
  }

  section("Expected Location Endpoint Coverage");
  const locationCoverage = await findMissingByEndpoint(
    EXPECTED_LOCATIONS,
    (id) => `/api/locations/${id}/full`
  );
  console.log(`Expected locations: ${EXPECTED_LOCATIONS.length}`);
  console.log(`Found locations by API: ${locationCoverage.found.length}`);
  console.log(`Missing locations by API: ${locationCoverage.missing.length}`);
  if (locationCoverage.missing.length > 0) {
    console.table(locationCoverage.missing);
    issues.push(
      `Missing Hoshimori locations: ${locationCoverage.missing.map((entry) => entry.id).join(", ")}`
    );
  }

  section("Named Search Evidence");
  const namedEvidence = [
    { name: "Narek", result: narekSearch },
    { name: "Pavo", result: pavoSearch },
    { name: "Borin", result: borinSearch },
    { name: "Liora", result: lioraSearch },
  ].map(({ name, result }) => ({
    name,
    ok: result.ok,
    npcMatches: count(result.data?.results?.npcs),
    locationMatches: count(result.data?.results?.locations),
    shopMatches: count(result.data?.results?.shops),
  }));
  console.table(namedEvidence);

  for (const evidence of namedEvidence) {
    if (evidence.npcMatches < 1) {
      issues.push(`${evidence.name} not found as NPC through search/db`);
    }
  }

  section("Optional MongoDB Counts");
  const mongoCounts = await getMongoCountsIfAvailable();
  console.log(JSON.stringify(mongoCounts, null, 2));
  if (mongoCounts.available) {
    if (mongoCounts.npcCount < EXPECTED_NPCS.length) {
      issues.push(`MongoDB region_hoshimori NPC count below expected: ${mongoCounts.npcCount}`);
    }
    if (mongoCounts.locationCount < EXPECTED_LOCATIONS.length) {
      issues.push(
        `MongoDB region_hoshimori location count below expected: ${mongoCounts.locationCount}`
      );
    }
  }

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Hoshimori core audit failed:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exit(1);
  }

  console.log("Hoshimori core audit OK. No state was mutated.");
}

main().catch(async (error) => {
  console.error("\nHoshimori core audit crashed:");
  console.error(error.message);
  await mongoose.disconnect();
  process.exit(1);
});
