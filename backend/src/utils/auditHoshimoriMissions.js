try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for API-only checks, but MongoDB is required for full G7 checks.
}

const mongoose = require("mongoose");

const CombatEncounter = require("../models/CombatEncounter");
const EnemyTemplate = require("../models/EnemyTemplate");
const Faction = require("../models/Faction");
const GameState = require("../models/GameState");
const Item = require("../models/Item");
const Location = require("../models/Location");
const Mission = require("../models/Mission");
const Npc = require("../models/Npc");
const Rumor = require("../models/Rumor");
const Shop = require("../models/Shop");
const ShopStock = require("../models/ShopStock");
const { MARKER_TAGS, SOURCE, missions: EXPECTED_MISSIONS } = require("../seeds/seedHoshimoriMissions");

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

const ORIGINAL_MISSION_ID = "mission_d10_cleanup_post_rain";
const DETAIL_MISSION_ID = "mission_d10_grulla_delivery_guild";

const EXPECTED_MISSION_IDS = EXPECTED_MISSIONS.map((mission) => mission.missionId);
const VALID_STATUSES = new Set([
  "available",
  "accepted",
  "completed",
  "failed",
  "expired",
  "withdrawn",
  "blocked",
]);
const VALID_RANKS = new Set(["Porcelana", "Cobre", "Bronce", "Plata", "Oro"]);
const VALID_RISKS = new Set(["none", "low", "medium", "high", "extreme"]);
const VALID_PROOF_STATUSES = new Set(["not_required", "pending", "submitted", "verified", "rejected"]);
const ALLOWED_AVAILABLE_RISKS = new Set(["none", "low", "medium"]);
const FORBIDDEN_ROMANCE = /romance|romantico|romantica|pareja|cita|noviazgo/i;
const FORBIDDEN_SECRET = /secreto\s+privado|secret\s+private|confidencia\s+privada|privado\s+de\s+npc/i;
const FORBIDDEN_MAGIC_REWARD = /hechizo|magia|magico|magica|mana|arcano|arcana|spell/i;

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

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function textForMission(mission) {
  return [
    mission.missionId,
    mission.templateId,
    mission.title,
    mission.description,
    ...(mission.requirements || []),
    mission.reward?.other || "",
    ...(mission.consequencesIfIgnored || []),
    ...(mission.relatedEventIds || []),
    ...(mission.flags?.tags || []),
    mission.flags?.missionType || "",
  ].join(" ");
}

async function assertMongoAvailable() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:hoshimori-missions.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
}

async function main() {
  const issues = [];

  console.log("Hoshimori missions audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: read-only API and MongoDB queries.");

  const [context, activeCombats, missionBoard, detailMission] = await Promise.all([
    request("/api/context/full"),
    request("/api/combat/encounters/active"),
    request("/api/missions/board"),
    request(`/api/missions/${DETAIL_MISSION_ID}`),
  ]);

  const gameState = context.context?.gameState || {};
  const activeCombatList = activeCombats.encounters || [];
  const boardMissions = missionBoard.missions || [];

  section("Canon State From API");
  console.log(
    JSON.stringify(
      {
        currentDay: gameState.currentDay,
        time: gameState.time,
        locationId: gameState.locationId,
        moneyCopper: gameState.moneyCopper,
        activeMissionIds: gameState.activeMissionIds || [],
        activeCombatCount: activeCombatList.length,
        boardMissionCount: boardMissions.length,
        detailMissionId: detailMission.mission?.missionId,
      },
      null,
      2
    )
  );

  assertEqual(issues, "day", gameState.currentDay, EXPECTED_STATE.day);
  assertEqual(issues, "time", gameState.time, EXPECTED_STATE.time);
  assertEqual(issues, "locationId", gameState.locationId, EXPECTED_STATE.locationId);
  assertEqual(issues, "moneyCopper", gameState.moneyCopper, EXPECTED_STATE.moneyCopper);
  assertEqual(issues, "active combat count", activeCombatList.length, EXPECTED_STATE.activeCombatCount);
  assertEqual(
    issues,
    "activeMissionIds count",
    Array.isArray(gameState.activeMissionIds) ? gameState.activeMissionIds.length : 0,
    EXPECTED_STATE.activeMissionCount
  );

  section("Mission Board API Coverage");
  const boardMissionIds = new Set(boardMissions.map((mission) => mission.missionId));
  assertTrue(
    issues,
    "mission board returns several missions",
    boardMissions.length >= 5,
    `${boardMissions.length} missions returned`
  );
  assertTrue(
    issues,
    "mission board includes original mission",
    boardMissionIds.has(ORIGINAL_MISSION_ID),
    ORIGINAL_MISSION_ID
  );
  assertEqual(issues, "stable detail mission", detailMission.mission?.missionId, DETAIL_MISSION_ID);

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
  assertEqual(
    issues,
    "db activeMissionIds count",
    Array.isArray(dbGameState?.activeMissionIds) ? dbGameState.activeMissionIds.length : 0,
    EXPECTED_STATE.activeMissionCount
  );

  section("G7 Mission Coverage");
  const liveMissions = await Mission.find({ missionId: { $in: EXPECTED_MISSION_IDS } })
    .sort({ missionId: 1 })
    .lean();
  const g7MarkerCount = await Mission.countDocuments({
    "flags.source": SOURCE,
    "flags.tags": { $all: MARKER_TAGS },
  });

  console.table(
    liveMissions.map((mission) => ({
      missionId: mission.missionId,
      rank: mission.rank,
      riskLevel: mission.riskLevel,
      status: mission.status,
      moneyCopper: mission.reward?.moneyCopper ?? 0,
      mgReward: mission.mgReward,
      proofStatus: mission.proofStatus,
      expiresDay: mission.expiresDay,
      expiresTime: mission.expiresTime,
      hasMarker:
        mission.flags?.source === SOURCE &&
        MARKER_TAGS.every((tag) => Array.isArray(mission.flags?.tags) && mission.flags.tags.includes(tag)),
    }))
  );

  assertEqual(issues, "expected G7 mission count by id", liveMissions.length, EXPECTED_MISSION_IDS.length);
  assertEqual(issues, "G7 missions with marker", g7MarkerCount, EXPECTED_MISSION_IDS.length);

  const liveMissionIdSet = new Set(liveMissions.map((mission) => mission.missionId));
  const missingMissionIds = EXPECTED_MISSION_IDS.filter((missionId) => !liveMissionIdSet.has(missionId));
  if (missingMissionIds.length > 0) {
    issues.push(`Missing G7 missions: ${missingMissionIds.join(", ")}`);
  }

  const duplicateMissionIds = await Mission.aggregate([
    { $group: { _id: "$missionId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 }, _id: { $in: EXPECTED_MISSION_IDS } } },
  ]);
  assertEqual(issues, "duplicate expected missionId count", duplicateMissionIds.length, 0);

  section("Reference Checks");
  const sourceFactionIds = unique(liveMissions.map((mission) => mission.sourceFactionId));
  const clientNpcIds = unique(liveMissions.map((mission) => mission.clientNpcId));
  const locationIds = unique(liveMissions.map((mission) => mission.locationId));
  const rewardItemIds = unique(liveMissions.flatMap((mission) => mission.reward?.items || []));
  const flagItemIds = unique(
    liveMissions.flatMap((mission) => [
      ...(mission.flags?.requiredItemIds || []),
      ...(mission.flags?.relatedItemIds || []),
    ])
  );
  const enemyTemplateIds = unique(liveMissions.flatMap((mission) => mission.flags?.enemyTemplateIds || []));
  const relatedRumorIds = unique(liveMissions.flatMap((mission) => mission.flags?.rumorIds || []));
  const relatedShopIds = unique(liveMissions.flatMap((mission) => mission.flags?.relatedShopIds || []));
  const itemIds = unique([...rewardItemIds, ...flagItemIds]);

  const [factions, npcs, locations, items, enemies, rumors, shops, stocks] = await Promise.all([
    Faction.find({ factionId: { $in: sourceFactionIds } }).select("factionId").lean(),
    Npc.find({ npcId: { $in: clientNpcIds } }).select("npcId").lean(),
    Location.find({ locationId: { $in: locationIds } }).select("locationId").lean(),
    Item.find({ itemId: { $in: itemIds } }).select("itemId type name tags rarity").lean(),
    EnemyTemplate.find({ enemyId: { $in: enemyTemplateIds } }).select("enemyId").lean(),
    Rumor.find({ rumorId: { $in: relatedRumorIds } }).select("rumorId").lean(),
    Shop.find({ shopId: { $in: relatedShopIds } }).select("shopId").lean(),
    ShopStock.find({ itemId: { $in: itemIds } }).select("itemId").lean(),
  ]);

  const existingFactionIds = new Set(factions.map((entry) => entry.factionId));
  const existingNpcIds = new Set(npcs.map((entry) => entry.npcId));
  const existingLocationIds = new Set(locations.map((entry) => entry.locationId));
  const existingItemIds = new Set(items.map((entry) => entry.itemId));
  const existingEnemyIds = new Set(enemies.map((entry) => entry.enemyId));
  const existingRumorIds = new Set(rumors.map((entry) => entry.rumorId));
  const existingShopIds = new Set(shops.map((entry) => entry.shopId));
  const stockedItemIds = new Set(stocks.map((entry) => entry.itemId));

  const missingFactions = sourceFactionIds.filter((id) => !existingFactionIds.has(id));
  const missingNpcs = clientNpcIds.filter((id) => !existingNpcIds.has(id));
  const missingLocations = locationIds.filter((id) => !existingLocationIds.has(id));
  const missingItems = itemIds.filter((id) => !existingItemIds.has(id));
  const missingEnemies = enemyTemplateIds.filter((id) => !existingEnemyIds.has(id));
  const missingRumors = relatedRumorIds.filter((id) => !existingRumorIds.has(id));
  const missingShops = relatedShopIds.filter((id) => !existingShopIds.has(id));
  const unstockedItems = itemIds.filter((id) => !stockedItemIds.has(id));

  assertEqual(issues, "missing sourceFactionId refs", missingFactions.length, 0);
  assertEqual(issues, "missing clientNpcId refs", missingNpcs.length, 0);
  assertEqual(issues, "missing locationId refs", missingLocations.length, 0);
  assertEqual(issues, "missing item refs", missingItems.length, 0);
  assertEqual(issues, "missing enemyTemplate refs", missingEnemies.length, 0);
  assertEqual(issues, "missing rumor refs", missingRumors.length, 0);
  assertEqual(issues, "missing shop refs", missingShops.length, 0);
  assertEqual(issues, "mission item refs without stock", unstockedItems.length, 0);

  section("Safety Checks");
  let invalidStatusCount = 0;
  let invalidRankCount = 0;
  let invalidRiskCount = 0;
  let invalidProofStatusCount = 0;
  let missingProofCount = 0;
  let negativeRewardCount = 0;
  let unavailableHighRiskCount = 0;
  let acceptedG7Count = 0;
  let romanceCount = 0;
  let privateSecretCount = 0;
  let magicRewardCount = 0;
  let nonHoshimoriLocationCount = 0;
  let missingMarkerCount = 0;

  const itemById = new Map(items.map((item) => [item.itemId, item]));

  for (const mission of liveMissions) {
    if (!VALID_STATUSES.has(mission.status)) invalidStatusCount += 1;
    if (!VALID_RANKS.has(mission.rank)) invalidRankCount += 1;
    if (!VALID_RISKS.has(mission.riskLevel)) invalidRiskCount += 1;
    if (!VALID_PROOF_STATUSES.has(mission.proofStatus)) invalidProofStatusCount += 1;
    if (!mission.proofRequired) missingProofCount += 1;
    if ((mission.reward?.moneyCopper ?? 0) < 0 || (mission.mgReward ?? 0) < 0) negativeRewardCount += 1;
    if (mission.status === "available" && !ALLOWED_AVAILABLE_RISKS.has(mission.riskLevel)) {
      unavailableHighRiskCount += 1;
    }
    if (mission.status === "accepted") acceptedG7Count += 1;
    if (!String(mission.locationId || "").startsWith("loc_hoshimori")) nonHoshimoriLocationCount += 1;

    const missionText = textForMission(mission);
    if (FORBIDDEN_ROMANCE.test(missionText)) romanceCount += 1;
    if (FORBIDDEN_SECRET.test(missionText)) privateSecretCount += 1;
    if (FORBIDDEN_MAGIC_REWARD.test([mission.reward?.other || "", ...(mission.reward?.items || [])].join(" "))) {
      magicRewardCount += 1;
    }

    for (const itemId of mission.reward?.items || []) {
      const item = itemById.get(itemId);
      const itemText = [
        itemId,
        item?.name || "",
        item?.type || "",
        item?.rarity || "",
        ...(item?.tags || []),
      ].join(" ");

      if (FORBIDDEN_MAGIC_REWARD.test(itemText)) {
        magicRewardCount += 1;
      }
    }

    if (
      mission.flags?.source !== SOURCE ||
      !MARKER_TAGS.every((tag) => Array.isArray(mission.flags?.tags) && mission.flags.tags.includes(tag))
    ) {
      missingMarkerCount += 1;
    }
  }

  assertEqual(issues, "invalid status count", invalidStatusCount, 0);
  assertEqual(issues, "invalid rank count", invalidRankCount, 0);
  assertEqual(issues, "invalid riskLevel count", invalidRiskCount, 0);
  assertEqual(issues, "invalid proofStatus count", invalidProofStatusCount, 0);
  assertEqual(issues, "missing proofRequired count", missingProofCount, 0);
  assertEqual(issues, "negative reward/mgReward count", negativeRewardCount, 0);
  assertEqual(issues, "available high/extreme risk count", unavailableHighRiskCount, 0);
  assertEqual(issues, "accepted G7 missions count", acceptedG7Count, 0);
  assertEqual(issues, "romance mission text count", romanceCount, 0);
  assertEqual(issues, "private-secret mission text count", privateSecretCount, 0);
  assertEqual(issues, "magic reward count", magicRewardCount, 0);
  assertEqual(issues, "non-Hoshimori mission location count", nonHoshimoriLocationCount, 0);
  assertEqual(issues, "missing marker count", missingMarkerCount, 0);

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Hoshimori missions audit failed:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    await mongoose.disconnect();
    process.exit(1);
  }

  await mongoose.disconnect();
  console.log("Hoshimori missions audit OK. No state was mutated.");
}

main().catch(async (error) => {
  console.error("\nHoshimori missions audit crashed:");
  console.error(error.message);
  if (error.response) {
    console.error(JSON.stringify(error.response, null, 2));
  }
  await mongoose.disconnect();
  process.exit(1);
});
