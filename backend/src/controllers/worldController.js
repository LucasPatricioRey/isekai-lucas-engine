const GameState = require("../models/GameState");
const { syncNpcRoutines } = require("../services/routineService");

async function syncRoutines(req, res) {
  try {
    const body = req.body || {};
    const query = req.query || {};

    const gameId = body.gameId || query.gameId || "isekai_lucas_main";

    const gameState = await GameState.findOne({ gameId }).lean();

    if (!gameState) {
      return res.status(404).json({
        ok: false,
        error: `No existe GameState para gameId: ${gameId}`,
      });
    }

    const result = await syncNpcRoutines({
      day: gameState.currentDay,
      time: gameState.time,
    });

    return res.json({
      ok: true,
      message: "Rutinas sincronizadas correctamente.",
      result,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error sincronizando rutinas.",
      details: error.message,
    });
  }
}

module.exports = {
  syncRoutines,
};
