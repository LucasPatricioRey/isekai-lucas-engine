try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional; MONGODB_URI can come from the host environment.
}

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const Commitment = require("../models/Commitment");
const GameState = require("../models/GameState");

const CANON_GAME_ID = "isekai_lucas_main";

function timeToMinutes(time = "00:00") {
  const [hours = "0", minutes = "0"] = String(time || "00:00").split(":");
  return Number(hours) * 60 + Number(minutes);
}

function nextAdministrativeCheck(gameState) {
  const currentMinutes = timeToMinutes(gameState.time || "00:00");
  if (currentMinutes < timeToMinutes("12:00")) {
    return { day: gameState.currentDay || 1, time: "12:00" };
  }
  if (currentMinutes < timeToMinutes("16:00")) {
    return { day: gameState.currentDay || 1, time: "16:00" };
  }
  return { day: Number(gameState.currentDay || 1) + 1, time: "09:00" };
}

async function repairGuildRegistrationCommitments({ gameId, gameState, dryRun }) {
  const review = nextAdministrativeCheck(gameState);
  const commitments = await Commitment.find({
    gameId,
    status: { $in: ["pending", "active"] },
    tags: "guild_registration",
    dueDay: null,
    nextCheckDay: null,
  });
  const changes = [];

  for (const commitment of commitments) {
    const before = {
      commitmentId: commitment.commitmentId,
      title: commitment.title,
      nextCheckDay: commitment.nextCheckDay,
      nextCheckTime: commitment.nextCheckTime || "",
      promiseType: commitment.promiseType || "none",
      promiseStrength: commitment.promiseStrength || "none",
    };

    commitment.promiseType = "administrative_process";
    commitment.promiseStrength = "soft";
    commitment.speakerNpcId = commitment.speakerNpcId || "npc_mara_vell";
    commitment.responsibleNpcId = commitment.responsibleNpcId || "npc_mara_vell";
    commitment.responsibleFactionId = commitment.responsibleFactionId || "faction_hoshimori_guild";
    commitment.nextCheckDay = review.day;
    commitment.nextCheckTime = review.time;
    commitment.blockerSummary =
      commitment.blockerSummary ||
      "Cierre administrativo interno pendiente; en la proxima revision Mara/Garrick deben completarlo o explicar el bloqueo concreto.";

    if (!dryRun) await commitment.save();
    changes.push({
      kind: "guild_registration_review",
      before,
      after: {
        nextCheckDay: commitment.nextCheckDay,
        nextCheckTime: commitment.nextCheckTime,
        promiseType: commitment.promiseType,
        promiseStrength: commitment.promiseStrength,
        responsibleNpcId: commitment.responsibleNpcId,
      },
    });
  }

  return changes;
}

async function repairConditionalPromises({ gameId, dryRun }) {
  const commitments = await Commitment.find({
    gameId,
    status: { $in: ["pending", "active"] },
    dueDay: null,
    nextCheckDay: null,
    $or: [
      { tags: "conditional" },
      { tags: "future_clients" },
      { title: /condicional/i },
    ],
  });
  const changes = [];

  for (const commitment of commitments) {
    if (commitment.conditionSummary) continue;
    const before = {
      commitmentId: commitment.commitmentId,
      title: commitment.title,
      promiseType: commitment.promiseType || "none",
      promiseStrength: commitment.promiseStrength || "none",
      conditionSummary: commitment.conditionSummary || "",
    };

    commitment.promiseType =
      commitment.promiseType && commitment.promiseType !== "none" ? commitment.promiseType : "debt_or_favor";
    commitment.promiseStrength =
      commitment.promiseStrength && commitment.promiseStrength !== "none" ? commitment.promiseStrength : "soft";
    commitment.conditionSummary =
      "Se activa si Lucas obtiene fama o reconocimiento suficiente como aventurero para atraer clientes de forma creible.";

    if (!dryRun) await commitment.save();
    changes.push({
      kind: "conditional_promise_dormant",
      before,
      after: {
        promiseType: commitment.promiseType,
        promiseStrength: commitment.promiseStrength,
        conditionSummary: commitment.conditionSummary,
      },
    });
  }

  return changes;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for repair:commitment-followups.");
  }

  await connectDB();
  const gameId = process.env.REPAIR_GAME_ID || CANON_GAME_ID;
  const dryRun = process.argv.includes("--dry-run");
  const gameState = await GameState.findOne({ gameId }).lean();
  if (!gameState) throw new Error(`No existe GameState para gameId: ${gameId}`);

  const changes = [
    ...(await repairGuildRegistrationCommitments({ gameId, gameState, dryRun })),
    ...(await repairConditionalPromises({ gameId, dryRun })),
  ];

  console.log(`Commitment follow-up repair ${dryRun ? "DRY RUN" : "APPLIED"}`);
  console.log(`GameId: ${gameId}`);
  console.log(`Changes: ${changes.length}`);
  for (const change of changes) {
    console.log(JSON.stringify(change));
  }

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Commitment follow-up repair failed:", error.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
