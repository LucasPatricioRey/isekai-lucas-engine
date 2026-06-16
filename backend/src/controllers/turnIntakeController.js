const { buildNarratorPacket } = require("../services/turnIntakeService");

async function intakeTurn(req, res) {
  try {
    const body = req.body || {};
    const payload = await buildNarratorPacket({
      gameId: body.gameId || "isekai_lucas_main",
      text: body.text || body.playerText || body.userText || "",
      aiClassification: body.aiClassification || body.classification || null,
      lastTargetNpcId:
        body.lastTargetNpcId ||
        body.sceneFocusNpcId ||
        body.conversationContext?.lastTargetNpcId ||
        body.conversationContext?.sceneFocusNpcId ||
        "",
    });

    return res.json(payload);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
      details: error.details || undefined,
    });
  }
}

module.exports = {
  intakeTurn,
};
