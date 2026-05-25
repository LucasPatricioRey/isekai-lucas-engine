const mongoose = require("mongoose");

const Checkpoint = require("../models/Checkpoint");
const GameState = require("../models/GameState");
const Character = require("../models/Character");
const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const Rumor = require("../models/Rumor");
const Location = require("../models/Location");
const WorldEvent = require("../models/WorldEvent");
const Mission = require("../models/Mission");
const EventLog = require("../models/EventLog");
const Shop = require("../models/Shop");
const ShopStock = require("../models/ShopStock");
const Item = require("../models/Item");
const Faction = require("../models/Faction");
const RoutineOverride = require("../models/RoutineOverride");

function createCheckpointId(gameState) {
  const safeTime = String(gameState.time || "0000").replace(":", "");
  return `checkpoint_d${gameState.currentDay}_${safeTime}_${Date.now()}`;
}

async function buildFullSnapshot(gameId) {
  const gameState = await GameState.findOne({ gameId }).lean();

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const [
    characters,
    npcs,
    npcMemories,
    rumors,
    locations,
    worldEvents,
    missions,
    eventLogs,
    shops,
    shopStocks,
    items,
    factions,
    routineOverrides,
  ] = await Promise.all([
    Character.find({}).lean(),
    Npc.find({}).lean(),
    NpcMemory.find({}).lean(),
    Rumor.find({}).lean(),
    Location.find({}).lean(),
    WorldEvent.find({}).lean(),
    Mission.find({}).lean(),
    EventLog.find({}).lean(),
    Shop.find({}).lean(),
    ShopStock.find({}).lean(),
    Item.find({}).lean(),
    Faction.find({}).lean(),
    RoutineOverride.find({}).lean(),
  ]);

  return {
    gameState,
    collections: {
      characters,
      npcs,
      npcMemories,
      rumors,
      locations,
      worldEvents,
      missions,
      eventLogs,
      shops,
      shopStocks,
      items,
      factions,
      routineOverrides,
    },
  };
}

async function createCheckpoint(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        ok: false,
        error: "MongoDB no está conectado.",
      });
    }

    const gameId = req.body.gameId || "isekai_lucas_main";
    const snapshot = await buildFullSnapshot(gameId);
    const gameState = snapshot.gameState;

    const checkpoint = await Checkpoint.create({
      checkpointId: req.body.checkpointId || createCheckpointId(gameState),
      gameId,
      title: req.body.title || `Checkpoint Día ${gameState.currentDay} ${gameState.time}`,
      reason: req.body.reason || "Checkpoint manual.",
      day: gameState.currentDay,
      time: gameState.time,
      gameStateSnapshot: snapshot.gameState,
      changedCollectionsSnapshot: snapshot.collections,
      notes: req.body.notes || "",
    });

    return res.json({
      ok: true,
      message: "Checkpoint creado correctamente.",
      checkpoint: {
        checkpointId: checkpoint.checkpointId,
        title: checkpoint.title,
        reason: checkpoint.reason,
        day: checkpoint.day,
        time: checkpoint.time,
        createdAt: checkpoint.createdAt,
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function listCheckpoints(req, res) {
  const checkpoints = await Checkpoint.find({})
    .sort({ createdAt: -1 })
    .limit(30)
    .select("checkpointId title reason day time createdAt")
    .lean();

  return res.json({
    ok: true,
    checkpoints,
  });
}

async function getCheckpoint(req, res) {
  const checkpoint = await Checkpoint.findOne({
    checkpointId: req.params.checkpointId,
  }).lean();

  if (!checkpoint) {
    return res.status(404).json({
      ok: false,
      error: `No existe checkpoint: ${req.params.checkpointId}`,
    });
  }

  return res.json({
    ok: true,
    checkpoint,
  });
}

async function restoreCollection(Model, docs) {
  if (!Array.isArray(docs)) return;

  await Model.deleteMany({});

  if (docs.length > 0) {
    await Model.insertMany(docs);
  }
}

async function rollbackCheckpoint(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        ok: false,
        error: "MongoDB no está conectado.",
      });
    }

    const { checkpointId } = req.params;

    const checkpoint = await Checkpoint.findOne({ checkpointId }).lean();

    if (!checkpoint) {
      return res.status(404).json({
        ok: false,
        error: `No existe checkpoint: ${checkpointId}`,
      });
    }

    const snapshot = checkpoint.changedCollectionsSnapshot || {};
    const gameStateSnapshot = checkpoint.gameStateSnapshot;

    if (!gameStateSnapshot || !gameStateSnapshot.gameId) {
      return res.status(400).json({
        ok: false,
        error: "Checkpoint inválido: falta gameStateSnapshot.",
      });
    }

    await GameState.deleteMany({ gameId: gameStateSnapshot.gameId });
    await GameState.create(gameStateSnapshot);

    await restoreCollection(Character, snapshot.characters);
    await restoreCollection(Npc, snapshot.npcs);
    await restoreCollection(NpcMemory, snapshot.npcMemories);
    await restoreCollection(Rumor, snapshot.rumors);
    await restoreCollection(Location, snapshot.locations);
    await restoreCollection(WorldEvent, snapshot.worldEvents);
    await restoreCollection(Mission, snapshot.missions);
    await restoreCollection(EventLog, snapshot.eventLogs);
    await restoreCollection(Shop, snapshot.shops);
    await restoreCollection(ShopStock, snapshot.shopStocks);
    await restoreCollection(Item, snapshot.items);
    await restoreCollection(Faction, snapshot.factions);
    await restoreCollection(RoutineOverride, snapshot.routineOverrides);

    return res.json({
      ok: true,
      message: "Rollback aplicado correctamente.",
      restoredCheckpoint: {
        checkpointId: checkpoint.checkpointId,
        title: checkpoint.title,
        day: checkpoint.day,
        time: checkpoint.time,
      },
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error aplicando rollback.",
      details: error.message,
    });
  }
}

module.exports = {
  createCheckpoint,
  listCheckpoints,
  getCheckpoint,
  rollbackCheckpoint,
};
