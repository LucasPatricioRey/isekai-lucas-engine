require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const EventLog = require("../models/EventLog");

async function cleanupTechnicalLogs() {
  await connectDB();

  const result = await EventLog.deleteMany({
    $or: [
      { type: /^test_/i },
      { summary: /prueba/i },
      { summary: /entreno cortando leña/i },
      { summary: /entrenó cortando leña/i },
      { summary: /entreno.*leña/i },
      { summary: /rollback/i }
    ],
  });

  console.log(`Logs tecnicos eliminados: ${result.deletedCount}`);

  await mongoose.disconnect();
}

cleanupTechnicalLogs().catch(async (error) => {
  console.error("Error limpiando logs tecnicos:", error);
  await mongoose.disconnect();
  process.exit(1);
});
