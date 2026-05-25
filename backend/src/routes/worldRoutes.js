const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const { previewWorldTickController, syncRoutines } = require("../controllers/worldController");

const router = express.Router();

router.post("/sync-routines", requireApiKey, syncRoutines);
router.post("/tick/preview", requireApiKey, previewWorldTickController);

module.exports = router;
