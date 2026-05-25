const GameState = require("../models/GameState");
const Shop = require("../models/Shop");
const ShopStock = require("../models/ShopStock");
const Item = require("../models/Item");
const Location = require("../models/Location");
const WorldEvent = require("../models/WorldEvent");

function isSupplyBlocked(stock, activeEvents) {
  const scarcityFlags = stock.scarcityFlags || [];

  if (!scarcityFlags.includes("supply_delay_active")) {
    return false;
  }

  return activeEvents.some((event) =>
    event.status === "active" &&
    (
      event.type === "supply_delay" ||
      (event.tags || []).includes("supplies") ||
      (event.tags || []).includes("weather_aftereffect")
    )
  );
}

async function getShopStock(shopId) {
  const shop = await Shop.findOne({ shopId }).lean();

  if (!shop) {
    const error = new Error(`No existe shop con id: ${shopId}`);
    error.statusCode = 404;
    throw error;
  }

  const stocks = await ShopStock.find({ shopId })
    .sort({ itemId: 1 })
    .lean();

  const itemIds = stocks.map((stock) => stock.itemId);
  const items = await Item.find({ itemId: { $in: itemIds } })
    .sort({ name: 1 })
    .lean();

  return {
    shop,
    stocks,
    items,
  };
}

async function listShops({ locationId = "", regionId = "", status = "" } = {}) {
  const query = {};

  if (locationId) {
    query.locationId = locationId;
  }

  if (status) {
    query.status = status;
  }

  if (regionId) {
    const locations = await Location.find({ regionId }).select("locationId").lean();
    const locationIds = locations.map((location) => location.locationId);
    query.locationId = locationId ? locationId : { $in: locationIds };
  }

  const shops = await Shop.find(query).sort({ locationId: 1, name: 1 }).lean();

  return { shops };
}

async function getItem(itemId) {
  const item = await Item.findOne({ itemId }).lean();

  if (!item) {
    const error = new Error(`No existe item con id: ${itemId}`);
    error.statusCode = 404;
    throw error;
  }

  return { item };
}

async function restockDaily({ gameId = "isekai_lucas_main", dryRun = true, force = false }) {
  const gameState = await GameState.findOne({ gameId }).lean();

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const activeEvents = await WorldEvent.find({
    status: "active",
  }).lean();

  const stocks = await ShopStock.find({}).exec();

  const updates = [];
  const skipped = [];

  for (const stock of stocks) {
    const rule = stock.restockRule || {};

    if (rule.type !== "daily") {
      skipped.push({
        shopId: stock.shopId,
        itemId: stock.itemId,
        reason: "restockRule no es daily",
      });
      continue;
    }

    if (!force && stock.lastRestockedDay !== null && stock.lastRestockedDay >= gameState.currentDay) {
      skipped.push({
        shopId: stock.shopId,
        itemId: stock.itemId,
        reason: "ya fue repuesto este dia",
      });
      continue;
    }

    if (isSupplyBlocked(stock, activeEvents)) {
      skipped.push({
        shopId: stock.shopId,
        itemId: stock.itemId,
        reason: "bloqueado por evento activo de suministros",
      });
      continue;
    }

    const amount = Number(rule.amount || 0);

    if (amount <= 0) {
      skipped.push({
        shopId: stock.shopId,
        itemId: stock.itemId,
        reason: "amount invalido o cero",
      });
      continue;
    }

    const before = stock.quantity;
    const after = before + amount;

    updates.push({
      shopId: stock.shopId,
      itemId: stock.itemId,
      before,
      amount,
      after,
      dryRun,
    });

    if (!dryRun) {
      stock.quantity = after;
      stock.lastRestockedDay = gameState.currentDay;
      await stock.save();
    }
  }

  return {
    day: gameState.currentDay,
    time: gameState.time,
    dryRun,
    force,
    updatedCount: updates.length,
    skippedCount: skipped.length,
    updates,
    skipped,
  };
}

module.exports = {
  getShopStock,
  listShops,
  getItem,
  restockDaily,
};
