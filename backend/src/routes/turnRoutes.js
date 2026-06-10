const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const { applyTurn } = require("../controllers/turnController");

const router = express.Router();

router.post("/apply", requireApiKey("gameplay"), applyTurn);

module.exports = router;
