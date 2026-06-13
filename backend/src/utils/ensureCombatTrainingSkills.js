require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");
const GameState = require("../models/GameState");

const GAME_ID = process.env.GAME_ID || "isekai_lucas_main";

const BASE_COMBAT_TRAINING_SKILLS = [
  { skillId: "skill_esquiva", name: "Esquiva", phase: "Principiante", level: 1, exp: 0, expToNext: 100 },
  { skillId: "skill_bloqueo", name: "Bloqueo", phase: "Principiante", level: 1, exp: 0, expToNext: 100 },
  { skillId: "skill_retirada", name: "Retirada", phase: "Principiante", level: 1, exp: 0, expToNext: 100 },
  { skillId: "skill_pelea_sin_armas", name: "Pelea sin armas", phase: "Principiante", level: 1, exp: 0, expToNext: 100 },
  { skillId: "skill_daga", name: "Daga", phase: "Principiante", level: 1, exp: 0, expToNext: 100 },
  { skillId: "skill_tactica_basica", name: "Tactica basica", phase: "Principiante", level: 1, exp: 0, expToNext: 100 },
];

async function ensureCombatTrainingSkills() {
  await connectDB();

  const gameState = await GameState.findOne({ gameId: GAME_ID });
  if (!gameState) throw new Error(`No existe GameState para ${GAME_ID}.`);

  const existing = new Set((gameState.skills || []).map((skill) => skill.skillId));
  const added = [];

  for (const skill of BASE_COMBAT_TRAINING_SKILLS) {
    if (existing.has(skill.skillId)) continue;
    gameState.skills.push(skill);
    added.push(skill.skillId);
  }

  if (added.length > 0) await gameState.save();

  console.log(
    JSON.stringify(
      {
        ok: true,
        gameId: GAME_ID,
        added,
        totalSkills: gameState.skills.length,
      },
      null,
      2
    )
  );
}

ensureCombatTrainingSkills()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

