const {
  listEnemies,
  getEnemy,
  startEncounter,
  listActiveEncounters,
  getEncounter,
  applyCombatRound,
} = require("../services/combatService");
const {
  listCombatActions,
  previewCombatAction,
} = require("../services/combatActionService");

async function listCombatActionsController(req, res) {
  try {
    const actions = await listCombatActions();

    return res.json({
      ok: true,
      actions,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function listEnemiesController(req, res) {
  try {
    const enemies = await listEnemies({
      type: req.query.type,
      dangerLevel: req.query.dangerLevel,
    });

    return res.json({
      ok: true,
      enemies,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function getEnemyController(req, res) {
  try {
    const enemy = await getEnemy(req.params.enemyId);

    return res.json({
      ok: true,
      enemy,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function startEncounterController(req, res) {
  try {
    const body = req.body || {};

    const encounter = await startEncounter({
      gameId: body.gameId || "isekai_lucas_main",
      enemyId: body.enemyId,
      reason: body.reason || "",
    });

    return res.json({
      ok: true,
      message: "Combate iniciado correctamente.",
      encounter,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
      details: error.details || null,
    });
  }
}

async function listActiveEncountersController(req, res) {
  try {
    const encounters = await listActiveEncounters({
      gameId: req.query.gameId || "isekai_lucas_main",
    });

    return res.json({
      ok: true,
      encounters,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function getEncounterController(req, res) {
  try {
    const encounter = await getEncounter(req.params.encounterId);

    return res.json({
      ok: true,
      encounter,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function applyCombatRoundController(req, res) {
  try {
    const body = req.body || {};

    const result = await applyCombatRound({
      encounterId: req.params.encounterId,
      gameId: body.gameId || "isekai_lucas_main",
      summary: body.summary,
      enemyDamage: body.enemyDamage || 0,
      moraleDamage: body.moraleDamage || 0,
      lucasPatch: body.lucasPatch || {},
      addInjuries: body.addInjuries || [],
      endStatus: body.endStatus || "",
    });

    return res.json({
      ok: true,
      message: "Ronda de combate aplicada correctamente.",
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function previewCombatActionController(req, res) {
  try {
    const body = req.body || {};

    const preview = await previewCombatAction({
      encounterId: req.params.encounterId,
      gameId: body.gameId || "isekai_lucas_main",
      actionType: body.actionType,
      params: body.params || {},
    });

    return res.json({
      ok: true,
      preview,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

module.exports = {
  listCombatActionsController,
  listEnemiesController,
  getEnemyController,
  startEncounterController,
  listActiveEncountersController,
  getEncounterController,
  applyCombatRoundController,
  previewCombatActionController,
};
