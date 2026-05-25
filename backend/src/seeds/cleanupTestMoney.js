require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const GameState = require("../models/GameState");
const EventLog = require("../models/EventLog");

async function cleanupTestMoney() {
  await connectDB();

  await GameState.updateOne(
    { gameId: "isekai_lucas_main" },
    {
      $set: {
        moneyCopper: 1470,
      },
    }
  );

  await EventLog.deleteMany({
    type: "test_money",
  });

  console.log("Prueba limpiada. Dinero restaurado a 1470 cobre y logs test_money eliminados.");

  await mongoose.disconnect();
}

cleanupTestMoney().catch(async (error) => {
  console.error("Error limpiando prueba:", error);
  await mongoose.disconnect();
  process.exit(1);
});
