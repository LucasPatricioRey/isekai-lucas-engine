const mongoose = require("mongoose");

const GameState = require("../models/GameState");
const Character = require("../models/Character");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const WorldEvent = require("../models/WorldEvent");
const Rumor = require("../models/Rumor");
const Mission = require("../models/Mission");
const EventLog = require("../models/EventLog");
const Shop = require("../models/Shop");
const ShopStock = require("../models/ShopStock");
const Item = require("../models/Item");
const Faction = require("../models/Faction");
const RoutineOverride = require("../models/RoutineOverride");

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function getFullContext(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        ok: false,
        error: "MongoDB no está conectado. Configurá MONGODB_URI para usar /api/context/full.",
      });
    }

    const gameId = req.query.gameId || "isekai_lucas_main";

    const gameState = await GameState.findOne({ gameId }).lean();

    if (!gameState) {
      return res.status(404).json({
        ok: false,
        error: `No existe GameState para gameId: ${gameId}`,
      });
    }

    const currentLocationId = gameState.locationId;
    const activeEventIds = gameState.activeEventIds || [];
    const activeMissionIds = gameState.activeMissionIds || [];

    const [lucas, currentLocation] = await Promise.all([
      Character.findOne({ characterId: gameState.characterId }).lean(),
      Location.findOne({ locationId: currentLocationId }).lean(),
    ]);

    const parentLocation = currentLocation?.parentLocationId
      ? await Location.findOne({ locationId: currentLocation.parentLocationId }).lean()
      : null;

    const locationIds = unique([
      currentLocationId,
      currentLocation?.parentLocationId,
      parentLocation?.parentLocationId,
    ]);

    const locationNpcIds = unique([
      ...(currentLocation?.visibleNpcIds || []),
      ...(currentLocation?.probableNpcIds || []),
      ...(parentLocation?.visibleNpcIds || []),
      ...(parentLocation?.probableNpcIds || []),
    ]);

    const nearbyNpcs = await Npc.find({
      $or: [
        { currentLocationId: { $in: locationIds } },
        { npcId: { $in: locationNpcIds } },
      ],
    })
      .sort({ name: 1 })
      .limit(40)
      .lean();

    const nearbyNpcIds = nearbyNpcs.map((npc) => npc.npcId);

    const shops = await Shop.find({
      locationId: { $in: locationIds },
    })
      .sort({ name: 1 })
      .lean();

    const shopIds = shops.map((shop) => shop.shopId);

    const [
      shopStocks,
      relevantNpcMemories,
      activeEvents,
      activeRumors,
      missions,
      recentEventLogs,
      routineOverrides,
    ] = await Promise.all([
      ShopStock.find({
        shopId: { $in: shopIds },
      })
        .sort({ shopId: 1, itemId: 1 })
        .lean(),

      NpcMemory.find({
        npcId: { $in: nearbyNpcIds },
        importance: { $in: ["normal", "important", "critical"] },
      })
        .sort({ importance: -1, createdDay: -1, createdTime: -1 })
        .limit(50)
        .lean(),

      WorldEvent.find({
        $or: [
          { eventId: { $in: activeEventIds } },
          { status: { $in: ["active", "scheduled"] }, affectedLocationIds: { $in: locationIds } },
          { status: { $in: ["active", "scheduled"] }, affectedNpcIds: { $in: nearbyNpcIds } },
        ],
      })
        .sort({ startDay: 1, startTime: 1 })
        .limit(30)
        .lean(),

      Rumor.find({
        status: "active",
        $or: [
          { locationIds: { $in: locationIds } },
          { knownByNpcIds: { $in: nearbyNpcIds } },
        ],
      })
        .sort({ createdDay: -1, createdTime: -1 })
        .limit(30)
        .lean(),

      Mission.find({
        $or: [
          { missionId: { $in: activeMissionIds } },
          { status: "available" },
          { status: "accepted", acceptedByCharacterId: gameState.characterId },
        ],
      })
        .sort({ postedDay: -1, postedTime: -1 })
        .limit(30)
        .lean(),

      EventLog.find({
        day: { $gte: Math.max(1, gameState.currentDay - 3) },
        type: { $not: /^test_/i },
        summary: { $not: /prueba|rollback|entreno cortando/i },
      })
        .sort({ day: -1, timeStart: -1 })
        .limit(30)
        .lean(),

      RoutineOverride.find({
        npcId: { $in: nearbyNpcIds },
        day: gameState.currentDay,
        status: { $in: ["scheduled", "active"] },
      })
        .sort({ timeStart: 1 })
        .limit(30)
        .lean(),
    ]);

    const itemIds = unique(shopStocks.map((stock) => stock.itemId));

    const stockItems = itemIds.length
      ? await Item.find({ itemId: { $in: itemIds } }).sort({ name: 1 }).lean()
      : [];

    const factionIds = unique([
      currentLocation?.controllingFactionId,
      parentLocation?.controllingFactionId,
      ...shops.map((shop) => shop.factionId),
      ...nearbyNpcs.flatMap((npc) => (npc.factionLinks || []).map((link) => link.factionId)),
      ...missions.map((mission) => mission.sourceFactionId),
    ]);

    const factionSummaries = factionIds.length
      ? await Faction.find({ factionId: { $in: factionIds } }).sort({ name: 1 }).lean()
      : [];

    return res.json({
      ok: true,
      context: {
        gameState,
        lucas,
        currentLocation,
        parentLocation,
        locationScope: locationIds,
        nearbyNpcs,
        relevantNpcMemories,
        activeEvents,
        activeRumors,
        missions,
        shops,
        shopStocks,
        stockItems,
        factionSummaries,
        routineOverrides,
        recentEventLogs,
        coherenceWarnings: [],
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error obteniendo contexto completo.",
      details: error.message,
    });
  }
}

module.exports = {
  getFullContext,
};
