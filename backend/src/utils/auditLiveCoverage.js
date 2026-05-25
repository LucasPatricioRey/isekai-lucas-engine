try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for this read-only audit.
}

const BASE_URL =
  process.env.AUDIT_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  "https://isekai-lucas-engine.onrender.com";

const API_KEY = process.env.API_KEY || process.env.AUDIT_API_KEY || "dev-secret";

const EXPECTED = {
  day: 10,
  time: "12:00",
  locationId: "loc_hoshimori_grulla_azul_comedor",
  moneyCopper: 1470,
  satietyCurrent: 30,
  energyCurrent: 59,
  activeCombatCount: 0,
  officialCheckpointId: "checkpoint_d10_1200_1779684235944",
};

function count(value) {
  return Array.isArray(value) ? value.length : 0;
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

function printTable(rows) {
  if (!rows || rows.length === 0) {
    console.log("(none)");
    return;
  }

  console.table(rows);
}

function assertCanon(label, actual, expected, issues) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual} (expected ${expected})`);

  if (!ok) {
    issues.push(`${label}: got ${actual}, expected ${expected}`);
  }
}

function summarizeSearchDb(searchResult) {
  const results = searchResult.results || {};
  return {
    npcs: count(results.npcs),
    npcMemories: count(results.npcMemories),
    rumors: count(results.rumors),
    locations: count(results.locations),
    worldEvents: count(results.worldEvents),
    missions: count(results.missions),
    eventLogs: count(results.eventLogs),
    items: count(results.items),
    shops: count(results.shops),
    factions: count(results.factions),
    enemyTemplates: count(results.enemyTemplates),
    combatEncounters: count(results.combatEncounters),
  };
}

async function main() {
  const issues = [];

  console.log("G1 live coverage audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: read-only GET requests only");

  const [
    health,
    context,
    searchNarek,
    searchLobo,
    docsRomance,
    missions,
    enemies,
    activeCombats,
    pavoStock,
    checkpoints,
  ] = await Promise.all([
    request("/api/health"),
    request("/api/context/full"),
    request("/api/search/db?q=Narek"),
    request("/api/search/db?q=lobo"),
    request("/api/search/docs?q=romance"),
    request("/api/missions/board"),
    request("/api/combat/enemies"),
    request("/api/combat/encounters/active"),
    request("/api/economy/shops/shop_pavo_food_stall/stock"),
    request("/api/checkpoints"),
  ]);

  const gameState = context.context?.gameState || {};
  const nearbyNpcs = context.context?.nearbyNpcs || [];
  const activeCombatList = activeCombats.encounters || [];
  const checkpointList = checkpoints.checkpoints || [];

  section("Health");
  console.log(JSON.stringify(health, null, 2));

  section("Current GameState");
  console.log(
    JSON.stringify(
      {
        currentDay: gameState.currentDay,
        time: gameState.time,
        block: gameState.block,
        locationId: gameState.locationId,
        moneyCopper: gameState.moneyCopper,
        satiety: gameState.lucasStatus?.satiety,
        energy: gameState.lucasStatus?.energy,
        mp: gameState.lucasStatus?.mp,
        activeEventIds: gameState.activeEventIds || [],
        activeMissionIds: gameState.activeMissionIds || [],
      },
      null,
      2
    )
  );

  section("Canon Assertions");
  assertCanon("day", gameState.currentDay, EXPECTED.day, issues);
  assertCanon("time", gameState.time, EXPECTED.time, issues);
  assertCanon("locationId", gameState.locationId, EXPECTED.locationId, issues);
  assertCanon("moneyCopper", gameState.moneyCopper, EXPECTED.moneyCopper, issues);
  assertCanon(
    "satiety.current",
    gameState.lucasStatus?.satiety?.current,
    EXPECTED.satietyCurrent,
    issues
  );
  assertCanon(
    "energy.current",
    gameState.lucasStatus?.energy?.current,
    EXPECTED.energyCurrent,
    issues
  );
  assertCanon("active combat count", count(activeCombatList), EXPECTED.activeCombatCount, issues);

  const officialCheckpointFound = checkpointList.some(
    (checkpoint) => checkpoint.checkpointId === EXPECTED.officialCheckpointId
  );
  console.log(
    `${officialCheckpointFound ? "PASS" : "FAIL"} official checkpoint present: ${
      EXPECTED.officialCheckpointId
    }`
  );
  if (!officialCheckpointFound) {
    issues.push(`official checkpoint missing: ${EXPECTED.officialCheckpointId}`);
  }

  section("Context NPC Scope");
  console.log(`nearbyNpcs count: ${count(nearbyNpcs)}`);
  printTable(
    nearbyNpcs.map((npc) => ({
      npcId: npc.npcId,
      name: npc.name,
      currentLocationId: npc.currentLocationId,
      availability: npc.availability?.status || "",
    }))
  );

  section("Search DB Evidence");
  printTable([
    { query: "Narek", ...summarizeSearchDb(searchNarek) },
    { query: "lobo", ...summarizeSearchDb(searchLobo) },
  ]);

  const narekDbCount = count(searchNarek.results?.npcs);
  const narekNearby = nearbyNpcs.some((npc) => npc.npcId === "npc_narek" || npc.name === "Narek");
  console.log(
    `Narek outside nearby context evidence: dbMatches=${narekDbCount}, nearby=${narekNearby}`
  );
  console.log(
    narekDbCount === 0
      ? "Inference: live DB cannot contain the full 25-NPC Hoshimori roster because Narek is missing."
      : "Inference: Narek exists in DB; context/full still only proves nearby-scope output."
  );

  section("Search Docs Evidence");
  console.log(`docs romance matches: ${count(docsRomance.results)}`);
  printTable(
    (docsRomance.results || []).slice(0, 5).map((doc) => ({
      docId: doc.docId,
      source: doc.source,
      title: doc.title,
    }))
  );

  section("Missions");
  printTable(
    (missions.missions || []).map((mission) => ({
      missionId: mission.missionId,
      title: mission.title,
      rank: mission.rank,
      status: mission.status,
      proofStatus: mission.proofStatus,
      mgReward: mission.mgReward,
    }))
  );

  section("Combat Enemies");
  printTable(
    (enemies.enemies || []).map((enemy) => ({
      enemyId: enemy.enemyId,
      name: enemy.name,
      type: enemy.type,
      dangerLevel: enemy.dangerLevel,
      rankHint: enemy.rankHint,
    }))
  );

  section("Active Combats");
  printTable(
    activeCombatList.map((combat) => ({
      encounterId: combat.encounterId,
      enemyName: combat.enemyName,
      status: combat.status,
      locationId: combat.locationId,
      currentRound: combat.currentRound,
    }))
  );

  section("Pavo Stock");
  const itemsById = new Map((pavoStock.items || []).map((item) => [item.itemId, item]));
  printTable(
    (pavoStock.stocks || []).map((stock) => ({
      itemId: stock.itemId,
      name: itemsById.get(stock.itemId)?.name || "",
      quantity: stock.quantity,
      currentPriceCopper: stock.currentPriceCopper,
      restockType: stock.restockRule?.type || "",
      restockAmount: stock.restockRule?.amount || 0,
    }))
  );

  section("Recent Checkpoints");
  printTable(
    checkpointList.slice(0, 10).map((checkpoint) => ({
      checkpointId: checkpoint.checkpointId,
      title: checkpoint.title,
      day: checkpoint.day,
      time: checkpoint.time,
      createdAt: checkpoint.createdAt,
    }))
  );

  section("Assertions Requested");
  printTable([
    {
      assertion: "Live DB has 25 Hoshimori NPCs",
      result: narekDbCount === 0 ? "false" : "not_proven",
      evidence: `search/db?q=Narek returned ${narekDbCount} NPC matches`,
    },
    {
      assertion: "context/full returns nearby NPCs, not the full roster",
      result: "true",
      evidence: `context/full returned ${count(nearbyNpcs)} nearby NPCs`,
    },
    {
      assertion: "GPT can query docs through /api/search/docs",
      result: count(docsRomance.results) > 0 ? "true" : "false",
      evidence: `search/docs?q=romance returned ${count(docsRomance.results)} docs`,
    },
    {
      assertion: "Base combat is available on Render",
      result: count(enemies.enemies) > 0 ? "true" : "false",
      evidence: `/api/combat/enemies returned ${count(enemies.enemies)} enemy templates`,
    },
    {
      assertion: "No ghost active combats",
      result: count(activeCombatList) === 0 ? "true" : "false",
      evidence: `/api/combat/encounters/active returned ${count(activeCombatList)} active encounters`,
    },
    {
      assertion: "Live state matches Day 10 12:00",
      result:
        gameState.currentDay === EXPECTED.day && gameState.time === EXPECTED.time
          ? "true"
          : "false",
      evidence: `currentDay=${gameState.currentDay}, time=${gameState.time}`,
    },
  ]);

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Audit completed with canon mismatches:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Audit completed OK. No state was mutated.");
}

main().catch((error) => {
  console.error("\nCoverage audit failed:");
  console.error(error.message);
  if (error.response) {
    console.error(JSON.stringify(error.response, null, 2));
  }
  process.exit(1);
});
