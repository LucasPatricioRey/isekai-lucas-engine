try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional; MONGODB_URI is still required below.
}

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const GameState = require("../models/GameState");
const WorldEvent = require("../models/WorldEvent");
const {
  ensureDailyEventForGameState,
  mainEventQuery,
  reconcileDailyEventsForGameState,
} = require("../services/dailyEventSchedulerService");

const GAME_ID = process.env.GAME_ID || "isekai_lucas_main";
const WRITE = process.argv.includes("--write") || process.env.WRITE_DAILY_EVENT === "true";

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for ensure:daily-event.");
  }

  await connectDB();

  const gameState = await GameState.findOne({ gameId: GAME_ID });
  if (!gameState) {
    throw new Error(`No existe GameState para gameId: ${GAME_ID}`);
  }

  console.log("Daily event ensure");
  console.log(`GameId: ${GAME_ID}`);
  console.log(`Mode: ${WRITE ? "WRITE" : "DRY-RUN"}`);
  console.log(
    JSON.stringify(
      {
        day: gameState.currentDay,
        time: gameState.time,
        block: gameState.block,
        activeEventIds: gameState.activeEventIds || [],
      },
      null,
      2
    )
  );

  if (!WRITE) {
    const existing = await WorldEvent.find({
      gameId: GAME_ID,
      $and: [
        mainEventQuery(),
        { tags: `daily_event_day_${gameState.currentDay}` },
      ],
    }).lean();
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          existingDailyEventsForDay: existing.map((event) => ({
            eventId: event.eventId,
            title: event.title,
            status: event.status,
            startDay: event.startDay,
            startTime: event.startTime,
            endDay: event.endDay,
            endTime: event.endTime,
            severity: event.severity,
            tags: event.tags || [],
          })),
        },
        null,
        2
      )
    );
    console.log("Dry-run only. Re-run with --write or WRITE_DAILY_EVENT=true to create/update.");
    await mongoose.disconnect();
    return;
  }

  const session = await mongoose.startSession();
  let result = null;

  await session.withTransaction(async () => {
    const liveGameState = await GameState.findOne({ gameId: GAME_ID }).session(session);
    const reconciled = await reconcileDailyEventsForGameState(liveGameState, { session });
    const ensured = reconciled.generated
      ? reconciled.generated
      : await ensureDailyEventForGameState(liveGameState, { session });

    await liveGameState.save({ session });
    result = {
      reconciled,
      ensured,
      gameState: {
        day: liveGameState.currentDay,
        time: liveGameState.time,
        activeEventIds: liveGameState.activeEventIds || [],
      },
    };
  });

  await session.endSession();

  console.log(JSON.stringify(result, null, 2));
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Daily event ensure failed:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
