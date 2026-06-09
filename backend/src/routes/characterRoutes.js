const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const { getCharacterState } = require("../controllers/characterController");

const router = express.Router();

router.get("/:characterId/state", requireApiKey, getCharacterState);

module.exports = router;
