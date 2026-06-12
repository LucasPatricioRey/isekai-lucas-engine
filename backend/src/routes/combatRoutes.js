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
const {
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
} = require("../controllers/combatAdvancedController");

const router = express.Router();

router.get("/advanced/actions", requireApiKey, combatAdvancedListActionsController);
router.post("/advanced/encounters/start/preview", requireApiKey, combatAdvancedPreviewStartEncounterController);
router.post("/advanced/encounters/start", requireApiKey("gameplay"), combatAdvancedStartEncounterController);
router.get("/advanced/encounters/active", requireApiKey, combatAdvancedListActiveEncountersController);
router.get("/advanced/encounters/:encounterId", requireApiKey, combatAdvancedGetEncounterController);
router.get("/advanced/encounters/:encounterId/actions", requireApiKey, combatAdvancedListAvailableActionsController);
router.post("/advanced/encounters/:encounterId/actions/preview", requireApiKey, combatAdvancedPreviewActionController);
router.post("/advanced/actions/apply", requireApiKey("gameplay"), combatAdvancedApplyActionController);
router.post("/advanced/encounters/:encounterId/npc-turn/resolve", requireApiKey("gameplay"), combatAdvancedResolveNextNpcTurnController);
router.post("/advanced/encounters/:encounterId/loot/preview", requireApiKey, combatAdvancedPreviewLootController);
router.post("/advanced/encounters/:encounterId/loot/claim", requireApiKey("gameplay"), combatAdvancedClaimLootController);
router.post("/advanced/encounters/:encounterId/end/preview", requireApiKey, combatAdvancedPreviewEndEncounterController);
router.post("/advanced/encounters/:encounterId/end", requireApiKey("gameplay"), combatAdvancedEndEncounterController);
router.post("/advanced/injuries/:injuryId/treatment/preview", requireApiKey, combatAdvancedPreviewTreatmentController);
router.post("/advanced/injuries/:injuryId/treatment/apply", requireApiKey("gameplay"), combatAdvancedApplyTreatmentController);

router.get("/actions", requireApiKey, listCombatActionsController);

router.get("/enemies", requireApiKey, listEnemiesController);
router.get("/enemies/:enemyId", requireApiKey, getEnemyController);

router.post("/encounters/start", requireApiKey("admin-write"), startEncounterController);
router.get("/encounters/active", requireApiKey, listActiveEncountersController);
router.get("/encounters/:encounterId", requireApiKey, getEncounterController);
router.post("/encounters/:encounterId/actions/preview", requireApiKey, previewCombatActionController);
router.post("/encounters/:encounterId/round", requireApiKey("admin-write"), applyCombatRoundController);

module.exports = router;
