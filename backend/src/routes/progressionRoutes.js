const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const { previewSkillController } = require("../controllers/progressionController");

const router = express.Router();

router.post("/skills/preview", requireApiKey, previewSkillController);

module.exports = router;
