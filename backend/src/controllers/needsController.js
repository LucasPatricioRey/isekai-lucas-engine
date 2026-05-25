const GameState = require("../models/GameState");
const {
  calculateActivityCost,
  getEnergyLabel,
  getSatietyLabel,
  previewBiologicalClockBlock,
} = require("../services/biologicalClockService");

async function getCurrentStatus(gameId) {
  const gameState = await GameState.findOne({ gameId }).lean();

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  return {
    gameState: {
      gameId: gameState.gameId,
      currentDay: gameState.currentDay,
      time: gameState.time,
      locationId: gameState.locationId,
      moneyCopper: gameState.moneyCopper,
    },
    currentStatus: {
      satiety: gameState.lucasStatus?.satiety?.current,
      energy: gameState.lucasStatus?.energy?.current,
    },
  };
}

async function previewActivityCostController(req, res) {
  try {
    const body = req.body || {};
    const gameId = body.gameId || "isekai_lucas_main";
    const activities = Array.isArray(body.activities)
      ? body.activities
      : [{ category: body.category, minutes: body.minutes }];
    let currentStatus = body.currentStatus;
    let gameState = null;

    if (!currentStatus) {
      const live = await getCurrentStatus(gameId);
      currentStatus = live.currentStatus;
      gameState = live.gameState;
    }

    const preview = previewBiologicalClockBlock({
      activities,
      currentStatus,
    });

    return res.json({
      ok: true,
      dryRun: true,
      gameState,
      preview,
      labels: {
        satiety: getSatietyLabel(preview.after?.satiety?.current ?? currentStatus.satiety),
        energy: getEnergyLabel(preview.after?.energy?.current ?? currentStatus.energy),
      },
      singleActivity:
        activities.length === 1
          ? calculateActivityCost({
              category: activities[0].category,
              minutes: activities[0].minutes,
              currentSatiety: currentStatus.satiety,
              currentEnergy: currentStatus.energy,
            })
          : null,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

module.exports = {
  previewActivityCostController,
};
