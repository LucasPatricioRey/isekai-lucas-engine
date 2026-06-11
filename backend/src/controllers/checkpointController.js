const mongoose = require("mongoose");

const Checkpoint = require("../models/Checkpoint");
const GameState = require("../models/GameState");
const {
  RESTORE_COLLECTIONS,
  checkpointReference,
  createCheckpointFromCurrentState,
} = require("../services/checkpointService");

async function createCheckpoint(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        ok: false,
        error: "MongoDB no está conectado.",
      });
    }

    const gameId = req.body.gameId || "isekai_lucas_main";
    const checkpoint = await createCheckpointFromCurrentState({
      checkpointId: req.body.checkpointId || "",
      gameId,
      title: req.body.title || "",
      reason: req.body.reason || "Checkpoint manual.",
      notes: req.body.notes || "",
      metadata: req.body.metadata || {},
    });

    return res.json({
      ok: true,
      message: "Checkpoint creado correctamente.",
      checkpoint: checkpointReference(checkpoint),
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
    .select("checkpointId title reason day time auto triggerKey createdAt")
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
