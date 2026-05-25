const mongoose = require("mongoose");

const GameState = require("../models/GameState");
const Character = require("../models/Character");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const WorldEvent = require("../models/WorldEvent");
const Rumor = require("../models/Rumor");
const Mission = require("../models/Mission");
const EventLog = require("../models/EventLog");

async function getFullContext(req, res) {
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

  const [
    lucas,
    currentLocation,
    nearbyNpcs,
    activeEvents,
    activeRumors,
    activeMissions,
    recentEventLogs,
  ] = await Promise.all([
    Character.findOne({ characterId: gameState.characterId }).lean(),

    Location.findOne({ locationId: currentLocationId }).lean(),

    Npc.find({
      currentLocationId,
    })
      .sort({ name: 1 })
      .lean(),

    WorldEvent.find({
      eventId: { $in: activeEventIds },
    }).lean(),

    Rumor.find({
      status: "active",
      locationIds: currentLocationId,
    })
      .sort({ createdDay: -1, createdTime: -1 })
      .limit(20)
      .lean(),

    Mission.find({
      $or: [
        { missionId: { $in: activeMissionIds } },
        { status: "available", locationId: currentLocationId },
      ],
    })
      .sort({ postedDay: -1, postedTime: -1 })
      .limit(20)
      .lean(),

    EventLog.find({
      day: { $gte: Math.max(1, gameState.currentDay - 3) },
    })
      .sort({ day: -1, timeStart: -1 })
      .limit(30)
      .lean(),
  ]);

  return res.json({
    ok: true,
    context: {
      gameState,
      lucas,
      currentLocation,
      nearbyNpcs,
      activeEvents,
      activeRumors,
      activeMissions,
      recentEventLogs,
      coherenceWarnings: [],
    },
  });
}

module.exports = {
  getFullContext,
};
