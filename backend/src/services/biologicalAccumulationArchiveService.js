const BiologicalAccumulationArchive = require("../models/BiologicalAccumulationArchive");

function toPlainAccumulation(entry) {
  if (!entry) return {};
  return typeof entry.toObject === "function" ? entry.toObject() : { ...entry };
}

function isProcessedAccumulation(entry) {
  return entry && (entry.status === "processed" || entry.processedAt);
}

function archivePayload(gameId, entry) {
  const raw = toPlainAccumulation(entry);
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

async function archiveProcessedBiologicalAccumulations(gameState, { session = null } = {}) {
  const clock = gameState?.biologicalClock;
  const all = clock?.pendingAccumulations || [];
  if (!Array.isArray(all) || all.length === 0) {
    return {
      archivedCount: 0,
      removedFromGameState: 0,
    };
  }

  const processed = all.filter(isProcessedAccumulation);
  if (processed.length === 0) {
    return {
      archivedCount: 0,
      removedFromGameState: 0,
    };
  }

  const live = all.filter((entry) => !isProcessedAccumulation(entry));
  let archivedCount = 0;

  for (const entry of processed) {
    const payload = archivePayload(gameState.gameId || entry.gameId || "isekai_lucas_main", entry);
    if (!payload.accumulationId) continue;
    await BiologicalAccumulationArchive.updateOne(
      { archiveId: payload.archiveId },
      { $set: payload },
      { upsert: true, session }
    );
    archivedCount += 1;
  }

  clock.pendingAccumulations = live;
  if (typeof gameState.markModified === "function") {
    gameState.markModified("biologicalClock");
  }

  return {
    archivedCount,
    removedFromGameState: processed.length,
  };
}

module.exports = {
  archiveProcessedBiologicalAccumulations,
  isProcessedAccumulation,
};
