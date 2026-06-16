const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const { applyTurn } = require("../controllers/turnController");
const { executeActionPlanController } = require("../controllers/turnActionPlanController");
const { intakeTurn } = require("../controllers/turnIntakeController");
const { playTurn } = require("../controllers/turnPlayController");
const {
  applyResolvedTurn,
  previewResolvedTurn,
} = require("../controllers/turnResolverController");

const router = express.Router();

router.post("/play", requireApiKey("gameplay"), playTurn);
router.post("/intake", requireApiKey, intakeTurn);
router.post("/action-plan/execute", requireApiKey("gameplay"), executeActionPlanController);
router.post("/apply", requireApiKey("gameplay"), applyTurn);
router.post("/resolve/preview", requireApiKey, previewResolvedTurn);
router.post("/resolve", requireApiKey("gameplay"), applyResolvedTurn);

module.exports = router;
