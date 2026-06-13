const GameState = require("../models/GameState");
const { previewSkillProgression } = require("../services/skillProgressionService");

async function getSkillFromBodyOrState(body) {
  if (body.skill) return body.skill;

  const gameId = body.gameId || "isekai_lucas_main";
  const skillId = body.skillId;

  if (!skillId) {
    const error = new Error("skillId es obligatorio cuando no se envia skill.");
    error.statusCode = 400;
    throw error;
  }

  const gameState = await GameState.findOne({ gameId }).lean();

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const skill = (gameState.skills || []).find((entry) => entry.skillId === skillId);

  if (!skill) {
    const error = new Error(`No existe la habilidad: ${skillId}`);
    error.statusCode = 404;
    throw error;
  }

  return {
    ...skill,
    currentEnergy: gameState.lucasStatus?.energy?.current,
    gameState: {
      gameId: gameState.gameId,
      currentDay: gameState.currentDay,
      time: gameState.time,
      locationId: gameState.locationId,
      moneyCopper: gameState.moneyCopper,
    },
  };
}

async function previewSkillController(req, res) {
  try {
    const body = req.body || {};
    const skillResult = await getSkillFromBodyOrState(body);
    const { currentEnergy, gameState, ...skill } = skillResult;
    const preview = previewSkillProgression({
      skill,
      expDelta: body.expDelta,
      reason: body.reason || "",
      category: body.category || "",
      modifiers: body.modifiers || {},
      currentEnergy: body.currentEnergy ?? currentEnergy ?? null,
      durationMinutes: body.durationMinutes ?? null,
      antiFarmingContext: {
        previousSimilarCount: Number.isInteger(body.previousSimilarCount) ? body.previousSimilarCount : 0,
      },
    });

    return res.json({
      ok: true,
      dryRun: true,
      gameState: gameState || null,
      preview,
      mutation: {
        willMutateGameState: false,
        reason: "G10 solo calcula preview; applyTurn aun no queda reemplazado por este servicio.",
      },
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
      details: error.details || undefined,
    });
  }
}

module.exports = {
  previewSkillController,
};
