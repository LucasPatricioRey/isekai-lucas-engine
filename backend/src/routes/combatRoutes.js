const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const {
  listCombatActionsController,
  listEnemiesController,
  getEnemyController,
  startEncounterController,
  listActiveEncountersController,
  getEncounterController,
  applyCombatRoundController,
  previewCombatActionController,
} = require("../controllers/combatController");

const router = express.Router();

router.get("/actions", requireApiKey, listCombatActionsController);

router.get("/enemies", requireApiKey, listEnemiesController);
router.get("/enemies/:enemyId", requireApiKey, getEnemyController);

router.post("/encounters/start", requireApiKey, startEncounterController);
router.get("/encounters/active", requireApiKey, listActiveEncountersController);
router.get("/encounters/:encounterId", requireApiKey, getEncounterController);
router.post("/encounters/:encounterId/actions/preview", requireApiKey, previewCombatActionController);
router.post("/encounters/:encounterId/round", requireApiKey, applyCombatRoundController);

module.exports = router;
