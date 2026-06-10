const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const {
  createCheckpoint,
  listCheckpoints,
  getCheckpoint,
  rollbackCheckpoint,
} = require("../controllers/checkpointController");

const router = express.Router();

router.post("/", requireApiKey("admin-write"), createCheckpoint);
router.get("/", requireApiKey, listCheckpoints);
router.get("/:checkpointId", requireApiKey, getCheckpoint);
router.post("/:checkpointId/rollback", requireApiKey("admin-write"), rollbackCheckpoint);

module.exports = router;
