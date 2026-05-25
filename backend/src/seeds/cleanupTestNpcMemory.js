require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const EventLog = require("../models/EventLog");

async function cleanupTestNpcMemory() {
  await connectDB();

  await Npc.updateOne(
    { npcId: "npc_fern" },
    {
      $set: {
        "relationshipWithLucas.trust": 24,
        "relationshipWithLucas.affection": 0,
        "relationshipWithLucas.suspicion": 0,
        "relationshipWithLucas.respect": 0,
        "relationshipWithLucas.fear": 0,
        "relationshipWithLucas.jealousy": 0,
        "relationshipWithLucas.notes":
          "Trato basico-cordial. Sabe que Lucas desperto magia/mana porque el se lo conto.",
      },
    }
  );

  await NpcMemory.deleteMany({
    npcId: "npc_fern",
    tags: "test_memory",
  });

  await EventLog.deleteMany({
    type: "test_npc_memory",
  });

  console.log("Prueba de memoria NPC limpiada. Fern restaurada al canon.");

  await mongoose.disconnect();
}

cleanupTestNpcMemory().catch(async (error) => {
  console.error("Error limpiando prueba de memoria NPC:", error);
  await mongoose.disconnect();
  process.exit(1);
});
