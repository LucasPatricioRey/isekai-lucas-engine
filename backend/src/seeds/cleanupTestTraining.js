require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const GameState = require("../models/GameState");
const EventLog = require("../models/EventLog");

async function cleanupTestTraining() {
  await connectDB();

  await GameState.updateOne(
    { gameId: "isekai_lucas_main" },
    {
      $set: {
        currentDay: 10,
        block: "Mediodía",
        time: "12:00",
        locationId: "loc_hoshimori_grulla_azul_comedor",
        moneyCopper: 1470,
        lucasStatus: {
          life: {
            current: 100,
            max: 100,
            label: "",
          },
          satiety: {
            current: 30,
            max: 100,
            label: "hambre fuerte",
          },
          energy: {
            current: 59,
            max: 100,
            label: "cansancio leve/energía media",
          },
          mp: {
            current: 200,
            max: 200,
            label: "",
          },
          injuries: [],
          conditions: [],
        },
        skills: [
          { skillId: "skill_fuerza", name: "Fuerza", phase: "Principiante", level: 6, exp: 10, expToNext: 100 },
          { skillId: "skill_resistencia", name: "Resistencia", phase: "Principiante", level: 6, exp: 68, expToNext: 100 },
          { skillId: "skill_vitalidad", name: "Vitalidad", phase: "Principiante", level: 6, exp: 13, expToNext: 100 },
          { skillId: "skill_agilidad", name: "Agilidad", phase: "Principiante", level: 4, exp: 69, expToNext: 100 },
          { skillId: "skill_percepcion", name: "Percepción", phase: "Principiante", level: 2, exp: 33, expToNext: 100 },
          { skillId: "skill_mana", name: "Maná", phase: "Principiante", level: 1, exp: 35, expToNext: 100 },
          { skillId: "skill_magia", name: "Magia", phase: "Principiante", level: 1, exp: 0, expToNext: 100 }
        ],
        biologicalClock: {
          lastProcessedTime: "12:00",
          currentHourBlock: "12:00-13:00",
          pendingAccumulation: [],
        },
      },
    }
  );

  await EventLog.deleteMany({
    $or: [
      { type: "training", summary: /Lucas entrenó cortando leña/i },
      { summary: /Prueba: Lucas entrena cortando leña/i }
    ],
  });

  console.log("Prueba de entrenamiento limpiada. Estado restaurado a Día 10 12:00.");

  await mongoose.disconnect();
}

cleanupTestTraining().catch(async (error) => {
  console.error("Error limpiando prueba de entrenamiento:", error);
  await mongoose.disconnect();
  process.exit(1);
});
