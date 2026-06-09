try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional; MONGODB_URI is still required below.
}

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const WorldEvent = require("../models/WorldEvent");

const DEFAULT_GAME_ID = process.env.DEFAULT_GAME_ID || "isekai_lucas_main";
const WRITE = process.argv.includes("--write") || process.env.WRITE_WORLDEVENT_GAMEID === "true";

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for migrate:worldevent-gameid.");
  }

  await connectDB();

  const missingGameIdQuery = {
    $or: [
      { gameId: { $exists: false } },
      { gameId: "" },
      { gameId: null },
    ],
  };

  const [missingCount, byGameId, sample] = await Promise.all([
    WorldEvent.countDocuments(missingGameIdQuery),
    WorldEvent.aggregate([
      {
        $group: {
          _id: "$gameId",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]),
    WorldEvent.find(missingGameIdQuery).sort({ startDay: 1, startTime: 1 }).limit(10).lean(),
  ]);

  console.log("WorldEvent gameId migration");
  console.log(`Default gameId: ${DEFAULT_GAME_ID}`);
  console.log(`Mode: ${WRITE ? "WRITE" : "DRY-RUN"}`);
  console.log(`Missing gameId: ${missingCount}`);
  console.log("Counts by gameId:");
  console.log(JSON.stringify(byGameId, null, 2));

  if (sample.length > 0) {
    console.log("Sample missing:");
    console.log(
      JSON.stringify(
        sample.map((event) => ({
          eventId: event.eventId,
          title: event.title,
          status: event.status,
          startDay: event.startDay,
          startTime: event.startTime,
        })),
        null,
        2
      )
    );
  }

  if (WRITE && missingCount > 0) {
    const result = await WorldEvent.updateMany(missingGameIdQuery, {
      $set: { gameId: DEFAULT_GAME_ID },
    });
    console.log(`Updated: ${result.modifiedCount}`);
  } else if (!WRITE) {
    console.log("Dry-run only. Re-run with --write or WRITE_WORLDEVENT_GAMEID=true to update WorldEvent.gameId.");
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("WorldEvent gameId migration failed:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
