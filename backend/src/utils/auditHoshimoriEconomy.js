try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for API-only checks, but MongoDB is required for full G6 checks.
}

const mongoose = require("mongoose");

const CombatEncounter = require("../models/CombatEncounter");
const Faction = require("../models/Faction");
const GameState = require("../models/GameState");
const Item = require("../models/Item");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const Shop = require("../models/Shop");
const ShopStock = require("../models/ShopStock");
const { MARKER_TAGS, SOURCE, items: EXPECTED_ITEMS, shops: EXPECTED_SHOPS, stocks: EXPECTED_STOCKS } = require("../seeds/seedHoshimoriEconomy");

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

const CONSULTABLE_STOCK_SHOPS = [
  "shop_pavo_food_stall",
  "shop_borin_smithy",
  "shop_liora_herbs",
  "shop_sella_workshop",
  "shop_hilda_bakery",
  "shop_merek_tannery",
];

const MAGIC_ITEM_REGEX = /magia|mana|hechizo|arcano|magico|magica|magic|spell/i;

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

async function assertMongoAvailable() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:hoshimori-economy.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
}

async function main() {
  const issues = [];

  console.log("Hoshimori economy audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: read-only API and MongoDB queries.");

  const [context, activeCombats, shopsEndpoint, borinStock, lioraStock, itemEndpoint] =
    await Promise.all([
      request("/api/context/full"),
      request("/api/combat/encounters/active"),
      request("/api/economy/shops"),
      request("/api/economy/shops/shop_borin_smithy/stock"),
      request("/api/economy/shops/shop_liora_herbs/stock"),
      request("/api/economy/items/item_daga_simple"),
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

  section("Economy API Coverage");
  const expectedShopIds = EXPECTED_SHOPS.map((shop) => shop.shopId);
  const apiShopIds = new Set((shopsEndpoint.shops || []).map((shop) => shop.shopId));

  assertTrue(
    issues,
    "GET /api/economy/shops contains expected shops",
    expectedShopIds.every((shopId) => apiShopIds.has(shopId)),
    `${apiShopIds.size} shops returned`
  );
  assertTrue(
    issues,
    "GET /api/economy/shops/shop_borin_smithy/stock has stock",
    Array.isArray(borinStock.stocks) && borinStock.stocks.length > 0,
    `${borinStock.stocks?.length || 0} stock rows`
  );
  assertTrue(
    issues,
    "GET /api/economy/shops/shop_liora_herbs/stock has stock",
    Array.isArray(lioraStock.stocks) && lioraStock.stocks.length > 0,
    `${lioraStock.stocks?.length || 0} stock rows`
  );
  assertEqual(issues, "GET /api/economy/items/item_daga_simple", itemEndpoint.item?.itemId, "item_daga_simple");

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

  section("Catalog Coverage");
  const expectedItemIds = EXPECTED_ITEMS.map((item) => item.itemId);
  const liveItems = await Item.find({ itemId: { $in: expectedItemIds } }).sort({ itemId: 1 }).lean();
  const liveShops = await Shop.find({ shopId: { $in: expectedShopIds } }).sort({ shopId: 1 }).lean();

  console.table(
    liveShops.map((shop) => ({
      shopId: shop.shopId,
      type: shop.type,
      locationId: shop.locationId,
      ownerNpcId: shop.ownerNpcId,
      status: shop.status,
      acceptsDebt: shop.acceptsDebt,
    }))
  );

  assertEqual(issues, "expected G6 item count", liveItems.length, expectedItemIds.length);
  assertEqual(issues, "expected G6 shop count", liveShops.length, expectedShopIds.length);

  const itemIdSet = new Set(liveItems.map((item) => item.itemId));
  const shopIdSet = new Set(liveShops.map((shop) => shop.shopId));
  const missingItems = expectedItemIds.filter((itemId) => !itemIdSet.has(itemId));
  const missingShops = expectedShopIds.filter((shopId) => !shopIdSet.has(shopId));

  if (missingItems.length > 0) issues.push(`Missing G6 items: ${missingItems.join(", ")}`);
  if (missingShops.length > 0) issues.push(`Missing G6 shops: ${missingShops.join(", ")}`);

  section("Reference Checks");
  const ownerNpcIds = unique(liveShops.map((shop) => shop.ownerNpcId));
  const locationIds = unique(liveShops.map((shop) => shop.locationId));
  const factionIds = unique(liveShops.map((shop) => shop.factionId));

  const [owners, locations, factions] = await Promise.all([
    Npc.find({ npcId: { $in: ownerNpcIds } }).select("npcId").lean(),
    Location.find({ locationId: { $in: locationIds } }).select("locationId").lean(),
    Faction.find({ factionId: { $in: factionIds } }).select("factionId").lean(),
  ]);

  const existingOwners = new Set(owners.map((owner) => owner.npcId));
  const existingLocations = new Set(locations.map((location) => location.locationId));
  const existingFactions = new Set(factions.map((faction) => faction.factionId));

  const missingOwners = ownerNpcIds.filter((npcId) => !existingOwners.has(npcId));
  const missingLocations = locationIds.filter((locationId) => !existingLocations.has(locationId));
  const missingFactions = factionIds.filter((factionId) => !existingFactions.has(factionId));

  assertEqual(issues, "missing shop owners", missingOwners.length, 0);
  assertEqual(issues, "missing shop locations", missingLocations.length, 0);
  assertEqual(issues, "missing shop factions", missingFactions.length, 0);

  section("Stock Coverage");
  const expectedStockPairs = EXPECTED_STOCKS.map((stock) => ({
    shopId: stock.shopId,
    itemId: stock.itemId,
  }));
  const liveStocks = await ShopStock.find({ $or: expectedStockPairs })
    .sort({ shopId: 1, itemId: 1 })
    .lean();

  console.table(
    liveStocks.map((stock) => ({
      shopId: stock.shopId,
      itemId: stock.itemId,
      quantity: stock.quantity,
      reservedQuantity: stock.reservedQuantity,
      currentPriceCopper: stock.currentPriceCopper,
      quality: stock.quality,
    }))
  );

  assertEqual(issues, "expected G6 stock row count", liveStocks.length, expectedStockPairs.length);

  const stockPairSet = new Set(liveStocks.map((stock) => `${stock.shopId}::${stock.itemId}`));
  const missingStocks = expectedStockPairs
    .map((stock) => `${stock.shopId}::${stock.itemId}`)
    .filter((pair) => !stockPairSet.has(pair));

  if (missingStocks.length > 0) {
    issues.push(`Missing G6 stock rows: ${missingStocks.join(", ")}`);
  }

  const negativeStockRows = liveStocks.filter(
    (stock) =>
      stock.quantity < 0 ||
      stock.reservedQuantity < 0 ||
      stock.basePriceCopper < 0 ||
      stock.currentPriceCopper < 0
  );
  assertEqual(issues, "negative stock/price rows", negativeStockRows.length, 0);

  const pavoRations = liveStocks.filter(
    (stock) =>
      stock.shopId === "shop_pavo_food_stall" &&
      ["item_racion_pequena", "item_racion_normal"].includes(stock.itemId)
  );
  assertEqual(issues, "Pavo ration stock rows", pavoRations.length, 2);

  for (const shopId of CONSULTABLE_STOCK_SHOPS) {
    const rows = liveStocks.filter((stock) => stock.shopId === shopId);
    assertTrue(issues, `${shopId} has stock rows`, rows.length > 0, `${rows.length} rows`);
  }

  section("Safety Checks");
  const commonMagicItems = liveItems.filter((item) => {
    if (item.rarity !== "common") return false;
    const text = [
      item.itemId,
      item.name,
      item.type,
      item.subtype,
      item.description,
      ...(item.tags || []),
    ].join(" ");
    return MAGIC_ITEM_REGEX.test(text);
  });

  assertEqual(issues, "common magic-like item count", commonMagicItems.length, 0);

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Hoshimori economy audit failed:");
    for (const issue of issues) {
      console.error(`- ${issue}`);
    }
    await mongoose.disconnect();
    process.exit(1);
  }

  await mongoose.disconnect();
  console.log("Hoshimori economy audit OK. No state was mutated.");
}

main().catch(async (error) => {
  console.error("\nHoshimori economy audit crashed:");
  console.error(error.message);
  if (error.response) {
    console.error(JSON.stringify(error.response, null, 2));
  }
  await mongoose.disconnect();
  process.exit(1);
});
