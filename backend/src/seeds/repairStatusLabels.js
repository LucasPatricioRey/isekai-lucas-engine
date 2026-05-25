require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const GameState = require("../models/GameState");

function getSatietyLabel(current) {
  if (current >= 71) return "satisfecho";
  if (current >= 51) return "hambre leve";
  if (current >= 21) return "hambre fuerte";
  if (current >= 1) return "debilidad/mareos";
  return "inanicion/riesgo de vida";
}

function getEnergyLabel(current) {
  if (current >= 70) return "rendimiento normal";
  if (current >= 40) return "cansancio leve/energia media";
  if (current >= 20) return "cansancio serio";
  if (current >= 1) return "agotamiento peligroso";
  return "colapso";
}

async function repairStatusLabels() {
  await connectDB();

  const gameState = await GameState.findOne({ gameId: "isekai_lucas_main" });

  if (!gameState) {
    throw new Error("No existe GameState isekai_lucas_main");
  }

  const satiety = gameState.lucasStatus.satiety.current;
  const energy = gameState.lucasStatus.energy.current;

  gameState.lucasStatus.satiety.label = getSatietyLabel(satiety);
  gameState.lucasStatus.energy.label = getEnergyLabel(energy);

  await gameState.save();

  console.log("Labels reparados:");
  console.log({
    satiety,
    satietyLabel: gameState.lucasStatus.satiety.label,
    energy,
    energyLabel: gameState.lucasStatus.energy.label,
  });

  await mongoose.disconnect();
}

repairStatusLabels().catch(async (error) => {
  console.error("Error reparando labels:", error);
  await mongoose.disconnect();
  process.exit(1);
});
