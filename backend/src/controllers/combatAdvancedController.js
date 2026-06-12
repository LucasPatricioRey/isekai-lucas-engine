const {
  ADVANCED_ACTIONS,
  previewStartEncounter,
  startEncounterAdvanced,
  listActiveAdvancedEncounters,
  getAdvancedEncounter,
  listAvailableAdvancedActions,
  previewAdvancedAction,
  applyAdvancedAction,
  resolveNextNpcTurn,
  previewEndEncounter,
  endEncounterAdvanced,
  previewCombatLoot,
  claimCombatLoot,
  previewInjuryTreatment,
  applyInjuryTreatment,
} = require("../services/combatAdvancedService");

function sendCombatAdvancedError(res, error) {
  return res.status(error.statusCode || 500).json({
    ok: false,
    error: error.message,
    details: error.details || null,
  });
}

async function combatAdvancedListActionsController(req, res) {
  try {
    return res.json({
      ok: true,
      actions: ADVANCED_ACTIONS,
    });
  } catch (error) {
    return sendCombatAdvancedError(res, error);
  }
}

async function combatAdvancedPreviewStartEncounterController(req, res) {
  try {
    const body = req.body || {};
    const preview = await previewStartEncounter({
      gameId: body.gameId || "isekai_lucas_main",
      enemyId: body.enemyId,
      reason: body.reason || "",
      sourceEventId: body.sourceEventId || "",
      sourceMissionId: body.sourceMissionId || "",
      sourceCommitmentId: body.sourceCommitmentId || "",
    });

    return res.json({
      ok: true,
      preview,
    });
  } catch (error) {
    return sendCombatAdvancedError(res, error);
  }
}

async function combatAdvancedStartEncounterController(req, res) {
  try {
    const body = req.body || {};
    const result = await startEncounterAdvanced({
      gameId: body.gameId || "isekai_lucas_main",
      enemyId: body.enemyId,
      reason: body.reason || "",
      sourceEventId: body.sourceEventId || "",
      sourceMissionId: body.sourceMissionId || "",
      sourceCommitmentId: body.sourceCommitmentId || "",
      terrainTags: body.terrainTags || [],
      visibility: body.visibility || "unknown",
      noiseLevel: body.noiseLevel || "unknown",
      surpriseState: body.surpriseState || "unknown",
    });

    return res.json({
      ok: true,
      message: "Combate avanzado iniciado correctamente.",
      ...result,
    });
  } catch (error) {
    return sendCombatAdvancedError(res, error);
  }
}

async function combatAdvancedListActiveEncountersController(req, res) {
  try {
    const encounters = await listActiveAdvancedEncounters({
      gameId: req.query.gameId || "isekai_lucas_main",
    });

    return res.json({
      ok: true,
      encounters,
    });
  } catch (error) {
    return sendCombatAdvancedError(res, error);
  }
}

async function combatAdvancedGetEncounterController(req, res) {
  try {
    const encounter = await getAdvancedEncounter(req.params.encounterId);

    return res.json({
      ok: true,
      encounter,
    });
  } catch (error) {
    return sendCombatAdvancedError(res, error);
  }
}

async function combatAdvancedListAvailableActionsController(req, res) {
  try {
    const result = await listAvailableAdvancedActions({
      encounterId: req.params.encounterId,
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return sendCombatAdvancedError(res, error);
  }
}

async function combatAdvancedPreviewActionController(req, res) {
  try {
    const body = req.body || {};
    const preview = await previewAdvancedAction({
      gameId: body.gameId || "isekai_lucas_main",
      encounterId: req.params.encounterId,
      actionType: body.actionType,
      actorId: body.actorId || "",
      targetIds: body.targetIds || null,
      params: body.params || {},
    });

    return res.json({
      ok: true,
      preview,
    });
  } catch (error) {
    return sendCombatAdvancedError(res, error);
  }
}

async function combatAdvancedApplyActionController(req, res) {
  try {
    const body = req.body || {};
    const result = await applyAdvancedAction({
      gameId: body.gameId || "isekai_lucas_main",
      previewId: body.previewId,
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return sendCombatAdvancedError(res, error);
  }
}

async function combatAdvancedResolveNextNpcTurnController(req, res) {
  try {
    const body = req.body || {};
    const result = await resolveNextNpcTurn({
      gameId: body.gameId || "isekai_lucas_main",
      encounterId: req.params.encounterId,
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return sendCombatAdvancedError(res, error);
  }
}

async function combatAdvancedPreviewEndEncounterController(req, res) {
  try {
    const body = req.body || {};
    const preview = await previewEndEncounter({
      gameId: body.gameId || "isekai_lucas_main",
      encounterId: req.params.encounterId,
      endStatus: body.endStatus || "cancelled",
      reason: body.reason || "",
    });

    return res.json({
      ok: true,
      preview,
    });
  } catch (error) {
    return sendCombatAdvancedError(res, error);
  }
}

async function combatAdvancedEndEncounterController(req, res) {
  try {
    const body = req.body || {};
    const result = await endEncounterAdvanced({
      gameId: body.gameId || "isekai_lucas_main",
      encounterId: req.params.encounterId,
      endStatus: body.endStatus || "cancelled",
      reason: body.reason || "",
    });

    return res.json({
      ok: true,
      message: "Combate avanzado cerrado correctamente.",
      ...result,
    });
  } catch (error) {
    return sendCombatAdvancedError(res, error);
  }
}

async function combatAdvancedPreviewLootController(req, res) {
  try {
    const body = req.body || {};
    const preview = await previewCombatLoot({
      gameId: body.gameId || "isekai_lucas_main",
      encounterId: req.params.encounterId,
    });

    return res.json({
      ok: true,
      preview,
    });
  } catch (error) {
    return sendCombatAdvancedError(res, error);
  }
}

async function combatAdvancedClaimLootController(req, res) {
  try {
    const body = req.body || {};
    const result = await claimCombatLoot({
      gameId: body.gameId || "isekai_lucas_main",
      encounterId: req.params.encounterId,
    });

    return res.json({
      ok: true,
      message: "Consecuencias post-combate reclamadas correctamente.",
      ...result,
    });
  } catch (error) {
    return sendCombatAdvancedError(res, error);
  }
}

async function combatAdvancedPreviewTreatmentController(req, res) {
  try {
    const body = req.body || {};
    const preview = await previewInjuryTreatment({
      gameId: body.gameId || "isekai_lucas_main",
      injuryId: req.params.injuryId,
      treatmentType: body.treatmentType || "field_dressing",
      quality: body.quality || "basic",
    });

    return res.json({
      ok: true,
      preview,
    });
  } catch (error) {
    return sendCombatAdvancedError(res, error);
  }
}

async function combatAdvancedApplyTreatmentController(req, res) {
  try {
    const body = req.body || {};
    const result = await applyInjuryTreatment({
      gameId: body.gameId || "isekai_lucas_main",
      injuryId: req.params.injuryId,
      treatmentType: body.treatmentType || "field_dressing",
      quality: body.quality || "basic",
    });

    return res.json({
      ok: true,
      message: "Tratamiento aplicado correctamente.",
      ...result,
    });
  } catch (error) {
    return sendCombatAdvancedError(res, error);
  }
}

module.exports = {
  combatAdvancedListActionsController,
  combatAdvancedPreviewStartEncounterController,
  combatAdvancedStartEncounterController,
  combatAdvancedListActiveEncountersController,
  combatAdvancedGetEncounterController,
  combatAdvancedListAvailableActionsController,
  combatAdvancedPreviewActionController,
  combatAdvancedApplyActionController,
  combatAdvancedResolveNextNpcTurnController,
  combatAdvancedPreviewEndEncounterController,
  combatAdvancedEndEncounterController,
  combatAdvancedPreviewLootController,
  combatAdvancedClaimLootController,
  combatAdvancedPreviewTreatmentController,
  combatAdvancedApplyTreatmentController,
};
