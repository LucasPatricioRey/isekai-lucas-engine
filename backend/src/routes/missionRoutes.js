const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const {
  getMissionBoardController,
  getMissionDetailController,
  acceptMissionController,
  submitMissionReportController,
  expireAvailableMissionsController,
} = require("../controllers/missionController");

const router = express.Router();

router.get("/board", requireApiKey, getMissionBoardController);
router.post("/expire-available", requireApiKey("admin-write"), expireAvailableMissionsController);

router.get("/:missionId", requireApiKey, getMissionDetailController);
router.post("/:missionId/accept", requireApiKey("admin-write"), acceptMissionController);
router.post("/:missionId/report", requireApiKey("admin-write"), submitMissionReportController);

module.exports = router;
