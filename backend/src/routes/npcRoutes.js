const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const { getNpcFull } = require("../controllers/npcController");

const router = express.Router();

router.get("/:npcId/full", requireApiKey, getNpcFull);

module.exports = router;
