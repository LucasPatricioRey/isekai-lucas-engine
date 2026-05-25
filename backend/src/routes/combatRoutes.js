const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const {
  listEnemiesController,
  getEnemyController,
  startEncounterController,
  getEncounterController,
  applyCombatRoundController,
} = require("../controllers/combatController");

const router = express.Router();

router.get("/enemies", requireApiKey, listEnemiesController);
router.get("/enemies/:enemyId", requireApiKey, getEnemyController);

router.post("/encounters/start", requireApiKey, startEncounterController);
router.get("/encounters/:encounterId", requireApiKey, getEncounterController);
router.post("/encounters/:encounterId/round", requireApiKey, applyCombatRoundController);

module.exports = router;
