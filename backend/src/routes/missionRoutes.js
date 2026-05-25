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
router.post("/expire-available", requireApiKey, expireAvailableMissionsController);

router.get("/:missionId", requireApiKey, getMissionDetailController);
router.post("/:missionId/accept", requireApiKey, acceptMissionController);
router.post("/:missionId/report", requireApiKey, submitMissionReportController);

module.exports = router;
