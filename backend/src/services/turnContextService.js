const CharacterMagicKnowledge = require("../models/CharacterMagicKnowledge");
const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");
const Item = require("../models/Item");
const Location = require("../models/Location");
const MagicTechnique = require("../models/MagicTechnique");
const Shop = require("../models/Shop");
const ShopStock = require("../models/ShopStock");
const WorldEvent = require("../models/WorldEvent");

const DEFAULT_GAME_ID = "isekai_lucas_main";
const SCHEMA_VERSION = "turn_context_v1";

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function compactError(message, statusCode = 500) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeNpcId(value = "") {
  const text = String(value || "").trim();
  return text.startsWith("npc_") ? text : "";
}

function locationScopeIdsFrom({ gameState = {}, location = null, parentLocation = null } = {}) {
  return unique([
    gameState.locationId,
    location?.locationId,
    location?.parentLocationId,
    parentLocation?.locationId,
  ]);
}

async function buildTurnContext({ gameId = DEFAULT_GAME_ID, lastTargetNpcId = "" } = {}) {
  const gameState = await GameState.findOne({ gameId })
    .select("gameId currentDay diegeticDate block time locationId characterId lucasStatus moneyCopper activeEventIds activeMissionIds")
    .lean();
  if (!gameState) {
    throw compactError(`No existe GameState para gameId: ${gameId}`, 404);
  }

  const [location, latestLogs, activeEvents, locationCatalog] = await Promise.all([
    Location.findOne({ locationId: gameState.locationId })
      .select("locationId name type regionId parentLocationId dangerLevel currentStatus visibleNpcIds probableNpcIds tags")
      .lean(),
    EventLog.find({ gameId })
      .select("logId gameId day timeStart timeEnd locationId type summary visibility source tags involvedNpcIds")
      .sort({ day: -1, timeStart: -1, createdAt: -1 })
      .limit(8)
      .lean(),
    WorldEvent.find({
      gameId,
      eventId: { $in: gameState.activeEventIds || [] },
      status: { $in: ["active", "scheduled"] },
    })
      .select("eventId title status visibility affectedLocationIds")
      .limit(5)
      .lean(),
    Location.find({})
      .select("locationId name type regionId parentLocationId currentStatus tags")
      .limit(150)
      .lean(),
  ]);

  const parentLocation = location?.parentLocationId
    ? await Location.findOne({ locationId: location.parentLocationId }).select("locationId name type tags").lean()
    : null;

  return {
    schemaVersion: SCHEMA_VERSION,
    gameId,
    gameState,
    location,
    parentLocation,
    latestLogs,
    activeEvents,
    locationCatalog,
    locationScopeIds: locationScopeIdsFrom({ gameState, location, parentLocation }),
    continuityNpcId: normalizeNpcId(lastTargetNpcId),
    slotCatalogsLoaded: false,
    shops: [],
    shopStocks: [],
    items: [],
    magicKnowledge: [],
    magicTechniques: [],
  };
}

async function hydrateTurnSlotCatalogs(context = {}) {
  if (context.slotCatalogsLoaded) return context;

  const gameState = context.gameState || {};
  const locationIds = context.locationScopeIds?.length
    ? context.locationScopeIds
    : locationScopeIdsFrom({ gameState, location: context.location, parentLocation: context.parentLocation });
  const characterId = gameState.characterId || "char_lucas";

  const [shops, magicKnowledge] = await Promise.all([
    Shop.find({
      locationId: { $in: locationIds },
      status: { $nin: ["closed", "blocked", "restricted"] },
    })
      .select("shopId name locationId ownerNpcId type status services tags")
      .limit(20)
      .lean(),
    CharacterMagicKnowledge.find({
      characterId,
      status: { $in: ["practicing", "known", "mastered"] },
    })
      .select("knowledgeId characterId techniqueId status tags")
      .limit(50)
      .lean(),
  ]);

  const shopIds = shops.map((shop) => shop.shopId);
  const shopStocks = shopIds.length
    ? await ShopStock.find({ shopId: { $in: shopIds }, quantity: { $gt: 0 } })
        .select("stockId shopId itemId quantity basePriceCopper currentPriceCopper quality tags scarcityFlags")
        .limit(80)
        .lean()
    : [];
  const itemIds = unique(shopStocks.map((stock) => stock.itemId));
  const knownTechniqueIds = unique(magicKnowledge.map((entry) => entry.techniqueId));

  const [items, magicTechniques] = await Promise.all([
    itemIds.length
      ? Item.find({ itemId: { $in: itemIds } })
          .select("itemId name type subtype description basePriceCopper satietyBonus energyBonus mpBonus rarity tags")
          .limit(80)
          .lean()
      : Promise.resolve([]),
    MagicTechnique.find({
      status: "available",
      $or: [
        { techniqueId: { $in: knownTechniqueIds } },
        { kind: { $in: ["practice", "exercise", "theory"] } },
      ],
    })
      .select(
        "techniqueId name disciplineId kind status defaultMinutes minMinutes maxMinutes activityCategory difficulty isRealSpell isOffensive effectProfile tags"
      )
      .limit(80)
      .lean(),
  ]);

  context.shops = shops;
  context.shopStocks = shopStocks;
  context.items = items;
  context.magicKnowledge = magicKnowledge;
  context.magicTechniques = magicTechniques;
  context.slotCatalogsLoaded = true;
  return context;
}

module.exports = {
  DEFAULT_GAME_ID,
  SCHEMA_VERSION,
  buildTurnContext,
  hydrateTurnSlotCatalogs,
};
