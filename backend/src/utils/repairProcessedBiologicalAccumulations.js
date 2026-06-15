require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const BiologicalAccumulationArchive = require("../models/BiologicalAccumulationArchive");
const GameState = require("../models/GameState");

function isProcessedAccumulation(entry) {
  return entry && (entry.status === "processed" || entry.processedAt);
}

function buildArchivePayload(gameId, entry) {
  const raw = typeof entry.toObject === "function" ? entry.toObject() : { ...entry };
  const accumulationId = raw.accumulationId || "";

  return {
    archiveId: `${gameId}:${accumulationId}`,
    gameId,
    accumulationId,
    characterId: raw.characterId || "char_lucas",
    day: Number.isInteger(raw.day) ? raw.day : null,
    blockStart: raw.blockStart || "",
    blockEnd: raw.blockEnd || "",
    category: raw.category || "",
    minutes: Number(raw.minutes) || 0,
    reason: raw.reason || "",
    sourceActionSummary: raw.sourceActionSummary || "",
    sourceEventLogId: raw.sourceEventLogId || "",
    status: raw.status || "processed",
    createdAtOriginal: raw.createdAt || null,
    processedAt: raw.processedAt || null,
    processedDay: Number.isInteger(raw.processedDay) ? raw.processedDay : null,
    processedTime: raw.processedTime || "",
    raw,
  };
}

async function repairProcessedBiologicalAccumulations({ gameId = "isekai_lucas_main", dryRun = false } = {}) {
  const gameState = await GameState.findOne({ gameId });
  if (!gameState) {
    throw new Error(`No existe GameState para gameId: ${gameId}`);
  }

  const pending = gameState.biologicalClock?.pendingAccumulations || [];
  const processed = pending.filter(isProcessedAccumulation);
  const live = pending.filter((entry) => !isProcessedAccumulation(entry));

  const result = {
    gameId,
    dryRun,
    beforeCount: pending.length,
    processedCount: processed.length,
    liveCount: live.length,
    archivedUpserts: 0,
    removedFromGameState: 0,
  };

  if (dryRun || processed.length === 0) {
    return result;
  }

  for (const entry of processed) {
    const payload = buildArchivePayload(gameId, entry);
    if (!payload.accumulationId) continue;
    await BiologicalAccumulationArchive.updateOne(
      { archiveId: payload.archiveId },
      { $set: payload },
      { upsert: true }
    );
    result.archivedUpserts += 1;
  }

  gameState.biologicalClock.pendingAccumulations = live;
  gameState.markModified("biologicalClock");
  await gameState.save();
  result.removedFromGameState = processed.length;

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const gameIdArg = args.find((arg) => arg.startsWith("--gameId="));
  const gameId = gameIdArg ? gameIdArg.slice("--gameId=".length) : "isekai_lucas_main";
  const dryRun = args.includes("--dry-run");

  await connectDB();
  const result = await repairProcessedBiologicalAccumulations({ gameId, dryRun });
  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error(error && error.stack ? error.stack : error);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exitCode = 1;
  });
}

module.exports = {
  repairProcessedBiologicalAccumulations,
};
