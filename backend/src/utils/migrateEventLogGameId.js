try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for hosted environments.
}

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const EventLog = require("../models/EventLog");

const MAIN_GAME_ID = process.env.MAIN_GAME_ID || "isekai_lucas_main";
const NON_CANON_GAME_ID = process.env.NON_CANON_EVENTLOG_GAME_ID || "legacy_non_canon";
const WRITE = process.argv.includes("--write") || process.env.WRITE_EVENTLOG_GAMEID === "true";

function normalize(value) {
  return String(value || "").toLowerCase();
}

function hasAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function isClearlyNonCanon(log) {
  const tags = log.tags || [];
  const haystack = normalize([
    log.logId,
    log.type,
    log.summary,
    log.source,
    ...tags,
  ].join(" "));

  if (normalize(log.type).startsWith("test_")) return true;
  if (tags.some((tag) => normalize(tag).startsWith("test_"))) return true;

  return hasAny(haystack, [
    /\btest\b/i,
    /prueba/i,
    /rollback/i,
    /hardening/i,
    /bio[_ -]?accumulator/i,
    /test biologic/i,
    /test biolog/i,
    /entreno cortando/i,
  ]);
}

function classify(log) {
  return isClearlyNonCanon(log) ? NON_CANON_GAME_ID : MAIN_GAME_ID;
}

function groupByGameId(logs) {
  const groups = new Map();
  for (const log of logs) {
    const gameId = classify(log);
    if (!groups.has(gameId)) groups.set(gameId, []);
    groups.get(gameId).push(log);
  }
  return groups;
}

function sampleLogs(logs) {
  return logs.slice(0, 8).map((log) => ({
    logId: log.logId,
    day: log.day,
    timeStart: log.timeStart,
    type: log.type,
    summary: log.summary,
    source: log.source,
    tags: log.tags || [],
    targetGameId: classify(log),
  }));
}

async function main() {
  await connectDB();

  const missingGameIdQuery = {
    $or: [
      { gameId: { $exists: false } },
      { gameId: null },
      { gameId: "" },
    ],
  };

  const [missingGameIdLogs, existingByGameId] = await Promise.all([
    EventLog.find(missingGameIdQuery).sort({ day: 1, timeStart: 1, createdAt: 1 }).lean(),
    EventLog.aggregate([
      {
        $group: {
          _id: "$gameId",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
  ]);

  const groups = groupByGameId(missingGameIdLogs);
  const planned = Array.from(groups.entries()).map(([gameId, logs]) => ({
    gameId,
    count: logs.length,
    sample: sampleLogs(logs),
  }));

  console.log(JSON.stringify({
    mode: WRITE ? "write" : "dry-run",
    mainGameId: MAIN_GAME_ID,
    nonCanonGameId: NON_CANON_GAME_ID,
    existingByGameId,
    missingGameIdCount: missingGameIdLogs.length,
    planned,
  }, null, 2));

  if (!WRITE) {
    console.log("Dry-run only. Re-run with --write or WRITE_EVENTLOG_GAMEID=true to update EventLog.gameId.");
    return;
  }

  for (const [gameId, logs] of groups.entries()) {
    const ids = logs.map((log) => log._id);
    if (ids.length === 0) continue;

    const result = await EventLog.updateMany(
      { _id: { $in: ids }, ...missingGameIdQuery },
      { $set: { gameId } }
    );

    console.log(JSON.stringify({
      gameId,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    }));
  }
}

main()
  .catch((error) => {
    console.error("EventLog gameId migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
