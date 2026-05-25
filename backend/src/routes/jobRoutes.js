const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const {
  getActiveJobContractController,
  getAvailableShiftsController,
  previewShiftController,
} = require("../controllers/jobController");

const router = express.Router();

router.get("/contracts/active", requireApiKey, getActiveJobContractController);
router.get("/shifts/available", requireApiKey, getAvailableShiftsController);
router.post("/shifts/:shiftId/preview", requireApiKey, previewShiftController);

module.exports = router;
