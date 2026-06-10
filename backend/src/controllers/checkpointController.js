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
const CombatEncounter = require("../models/CombatEncounter");
const NpcRelationship = require("../models/NpcRelationship");
const NpcSocialLedger = require("../models/NpcSocialLedger");
const CharacterMagicKnowledge = require("../models/CharacterMagicKnowledge");
const MagicDiscipline = require("../models/MagicDiscipline");
const MagicTechnique = require("../models/MagicTechnique");
const TravelRoute = require("../models/TravelRoute");
const WeatherState = require("../models/WeatherState");

const RESTORE_COLLECTIONS = [
  ["characters", Character],
  ["npcs", Npc],
  ["npcMemories", NpcMemory],
  ["rumors", Rumor],
  ["locations", Location],
  ["worldEvents", WorldEvent],
  ["missions", Mission],
  ["eventLogs", EventLog],
  ["shops", Shop],
  ["shopStocks", ShopStock],
  ["items", Item],
  ["factions", Faction],
  ["routineOverrides", RoutineOverride],
  ["combatEncounters", CombatEncounter],
  ["npcRelationships", NpcRelationship],
  ["npcSocialLedger", NpcSocialLedger],
  ["characterMagicKnowledge", CharacterMagicKnowledge],
  ["magicDisciplines", MagicDiscipline],
  ["magicTechniques", MagicTechnique],
  ["travelRoutes", TravelRoute],
  ["weatherStates", WeatherState],
];

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
    combatEncounters,
    npcRelationships,
    npcSocialLedger,
    characterMagicKnowledge,
    magicDisciplines,
    magicTechniques,
    travelRoutes,
    weatherStates,
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
    CombatEncounter.find({}).lean(),
    NpcRelationship.find({}).lean(),
    NpcSocialLedger.find({}).lean(),
    CharacterMagicKnowledge.find({}).lean(),
    MagicDiscipline.find({}).lean(),
    MagicTechnique.find({}).lean(),
    TravelRoute.find({}).lean(),
    WeatherState.find({}).lean(),
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
      combatEncounters,
      npcRelationships,
      npcSocialLedger,
      characterMagicKnowledge,
      magicDisciplines,
      magicTechniques,
      travelRoutes,
      weatherStates,
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

function getSnapshotDocId(collectionKey, doc) {
  return (
    doc.gameId ||
    doc.characterId ||
    doc.npcId ||
    doc.memoryId ||
    doc.rumorId ||
    doc.locationId ||
    doc.eventId ||
    doc.missionId ||
    doc.logId ||
    doc.shopId ||
    doc.stockId ||
    doc.itemId ||
    doc.factionId ||
    doc.overrideId ||
    doc.encounterId ||
    doc.relationshipId ||
    doc.ledgerId ||
    doc.knowledgeId ||
    doc.disciplineId ||
    doc.techniqueId ||
    doc.routeId ||
    doc.weatherId ||
    doc._id ||
    `${collectionKey}:unknown`
  );
}

function formatValidationError(collectionKey, doc, error) {
  return {
    collection: collectionKey,
    documentId: String(getSnapshotDocId(collectionKey, doc)),
    message: error.message,
  };
}

function validateSnapshotDocs(Model, collectionKey, docs) {
  if (docs === undefined || docs === null) {
    return [];
  }

  if (!Array.isArray(docs)) {
    return [
      {
        collection: collectionKey,
        documentId: collectionKey,
        message: "Snapshot collection is not an array.",
      },
    ];
  }

  const issues = [];

  for (const doc of docs) {
    const validationError = new Model(doc).validateSync();
    if (validationError) {
      issues.push(formatValidationError(collectionKey, doc, validationError));
    }
  }

  return issues;
}

function validateRollbackSnapshot(gameStateSnapshot, snapshot) {
  const issues = [];

  if (!gameStateSnapshot || !gameStateSnapshot.gameId) {
    issues.push({
      collection: "gameState",
      documentId: "gameStateSnapshot",
      message: "Checkpoint invalido: falta gameStateSnapshot.",
    });
    return issues;
  }

  const gameStateError = new GameState(gameStateSnapshot).validateSync();
  if (gameStateError) {
    issues.push(formatValidationError("gameState", gameStateSnapshot, gameStateError));
  }

  for (const [collectionKey, Model] of RESTORE_COLLECTIONS) {
    issues.push(...validateSnapshotDocs(Model, collectionKey, snapshot[collectionKey]));
  }

  return issues;
}

async function restoreCollection(Model, collectionKey, docs, session) {
  if (docs === undefined || docs === null) {
    return {
      collection: collectionKey,
      action: "preserved_missing_from_snapshot",
      restoredCount: null,
    };
  }

  await Model.deleteMany({}).session(session);

  if (docs.length > 0) {
    await Model.insertMany(docs, { session, ordered: true });
  }

  return {
    collection: collectionKey,
    action: "restored",
    restoredCount: docs.length,
  };
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

    const validationIssues = validateRollbackSnapshot(gameStateSnapshot, snapshot);

    if (validationIssues.length > 0) {
      return res.status(400).json({
        ok: false,
        error: "Checkpoint incompatible con el schema actual.",
        details: validationIssues.slice(0, 20),
      });
    }

    const session = await mongoose.startSession();
    const restoreSummary = [];

    try {
      await session.withTransaction(async () => {
        await GameState.deleteMany({ gameId: gameStateSnapshot.gameId }).session(session);
        await GameState.create([gameStateSnapshot], { session });

        for (const [collectionKey, Model] of RESTORE_COLLECTIONS) {
          restoreSummary.push(
            await restoreCollection(Model, collectionKey, snapshot[collectionKey], session)
          );
        }
      });
    } finally {
      await session.endSession();
    }

    return res.json({
      ok: true,
      message: "Rollback aplicado correctamente.",
      restoredCheckpoint: {
        checkpointId: checkpoint.checkpointId,
        title: checkpoint.title,
        day: checkpoint.day,
        time: checkpoint.time,
      },
      restoreSummary,
    });
  } catch (error) {
    console.error("Rollback checkpoint failed:", error.stack || error.message);

    return res.status(500).json({
      ok: false,
      error: "Error aplicando rollback.",
      details: {
        message: error.message,
        name: error.name,
      },
    });
  }
}

module.exports = {
  createCheckpoint,
  listCheckpoints,
  getCheckpoint,
  rollbackCheckpoint,
};
