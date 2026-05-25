const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const { previewActivityCostController } = require("../controllers/needsController");

const router = express.Router();

router.post("/activity-cost/preview", requireApiKey, previewActivityCostController);

module.exports = router;
