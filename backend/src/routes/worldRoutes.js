const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const {
  getWorldEvent,
  listWorldEvents,
  previewWorldTickController,
  syncRoutines,
} = require("../controllers/worldController");

const router = express.Router();

router.get("/events", requireApiKey, listWorldEvents);
router.get("/events/:eventId", requireApiKey, getWorldEvent);
router.post("/sync-routines", requireApiKey("admin-write"), syncRoutines);
router.post("/tick/preview", requireApiKey, previewWorldTickController);

module.exports = router;
