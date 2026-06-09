const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const { getNpcFull, previewSocialImpactController } = require("../controllers/npcController");

const router = express.Router();

router.post("/social/impact/preview", requireApiKey, previewSocialImpactController);
router.get("/:npcId/full", requireApiKey, getNpcFull);

module.exports = router;
