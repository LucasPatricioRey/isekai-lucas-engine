const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const { syncRoutines } = require("../controllers/worldController");

const router = express.Router();

router.post("/sync-routines", requireApiKey, syncRoutines);

module.exports = router;
