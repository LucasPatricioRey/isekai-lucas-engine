const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const { applyTurn } = require("../controllers/turnController");
const {
  applyResolvedTurn,
  previewResolvedTurn,
} = require("../controllers/turnResolverController");

const router = express.Router();

router.post("/apply", requireApiKey("gameplay"), applyTurn);
router.post("/resolve/preview", requireApiKey, previewResolvedTurn);
router.post("/resolve", requireApiKey("gameplay"), applyResolvedTurn);

module.exports = router;
