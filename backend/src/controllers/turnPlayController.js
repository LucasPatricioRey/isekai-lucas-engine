const { playTurn: playTurnService } = require("../services/turnPlayService");

async function playTurn(req, res) {
  try {
    const payload = await playTurnService(req.body || {});
    return res.json(payload);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.statusCode === 500 ? "Error resolviendo turno de juego." : error.message,
      details: error.details || undefined,
    });
  }
}

module.exports = {
  playTurn,
};
