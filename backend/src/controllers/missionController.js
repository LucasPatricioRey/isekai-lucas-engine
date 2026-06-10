const {
  getMissionBoard,
  getMissionDetail,
  acceptMission,
  submitMissionReport,
  expireAvailableMissions,
} = require("../services/missionService");

async function getMissionBoardController(req, res) {
  try {
    const missions = await getMissionBoard({
      status: req.query.status,
      locationId: req.query.locationId,
      rank: req.query.rank,
      riskLevel: req.query.riskLevel,
      sourceFactionId: req.query.sourceFactionId,
      gameId: req.query.gameId || "isekai_lucas_main",
      includeExpiredAvailable: ["1", "true", "yes"].includes(
        String(req.query.includeExpiredAvailable || "").toLowerCase()
      ),
    });

    return res.json({
      ok: true,
      missions,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function getMissionDetailController(req, res) {
  try {
    const mission = await getMissionDetail(req.params.missionId);

    return res.json({
      ok: true,
      mission,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function acceptMissionController(req, res) {
  try {
    const body = req.body || {};

    const result = await acceptMission({
      missionId: req.params.missionId,
      gameId: body.gameId || "isekai_lucas_main",
      characterId: body.characterId || "char_lucas",
    });

    return res.json({
      ok: true,
      message: "Misión aceptada correctamente.",
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function submitMissionReportController(req, res) {
  try {
    const body = req.body || {};

    const mission = await submitMissionReport({
      missionId: req.params.missionId,
      gameId: body.gameId || "isekai_lucas_main",
      characterId: body.characterId || "char_lucas",
      reportSummary: body.reportSummary || "",
    });

    return res.json({
      ok: true,
      message: "Reporte de misión presentado correctamente.",
      mission,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function expireAvailableMissionsController(req, res) {
  try {
    const body = req.body || {};

    const result = await expireAvailableMissions({
      gameId: body.gameId || "isekai_lucas_main",
    });

    return res.json({
      ok: true,
      message: "Expiración de misiones disponibles procesada.",
      result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

module.exports = {
  getMissionBoardController,
  getMissionDetailController,
  acceptMissionController,
  submitMissionReportController,
  expireAvailableMissionsController,
};
