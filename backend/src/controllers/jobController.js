const {
  completeShift,
  getActiveJobContract,
  getAvailableShifts,
  previewShift,
} = require("../services/jobService");

async function getActiveJobContractController(req, res) {
  try {
    const contract = await getActiveJobContract({
      characterId: req.query.characterId || "char_lucas",
      contractId: req.query.contractId || "",
    });

    return res.json({
      ok: true,
      contract,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function getAvailableShiftsController(req, res) {
  try {
    const result = await getAvailableShifts({
      gameId: req.query.gameId || "isekai_lucas_main",
      characterId: req.query.characterId || "char_lucas",
      contractId: req.query.contractId || "",
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function previewShiftController(req, res) {
  try {
    const body = req.body || {};
    const result = await previewShift({
      shiftId: req.params.shiftId,
      gameId: body.gameId || "isekai_lucas_main",
      characterId: body.characterId || "char_lucas",
      contractId: body.contractId || "",
    });

    return res.json({
      ok: true,
      preview: result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
      details: error.details || undefined,
    });
  }
}

async function completeShiftController(req, res) {
  try {
    const body = req.body || {};
    const result = await completeShift({
      shiftId: req.params.shiftId,
      gameId: body.gameId || "isekai_lucas_main",
      characterId: body.characterId || "char_lucas",
      contractId: body.contractId || "",
      alreadyConsumedMealIds: body.alreadyConsumedMealIds || [],
      consumeIncludedMealIds: body.consumeIncludedMealIds || [],
      skipMealIds: body.skipMealIds || [],
      completionSummary: body.completionSummary || "",
      allowLateCompletion: Boolean(body.allowLateCompletion),
    });

    return res.json({
      ok: true,
      result,
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
  completeShiftController,
  getActiveJobContractController,
  getAvailableShiftsController,
  previewShiftController,
};
