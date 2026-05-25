const {
  listEnemies,
  getEnemy,
  startEncounter,
  getEncounter,
  applyCombatRound,
} = require("../services/combatService");

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

module.exports = {
  listEnemiesController,
  getEnemyController,
  startEncounterController,
  getEncounterController,
  applyCombatRoundController,
};
