const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const {
  completeShiftController,
  getActiveJobContractController,
  getAvailableShiftsController,
  previewShiftController,
} = require("../controllers/jobController");

const router = express.Router();

router.get("/contracts/active", requireApiKey, getActiveJobContractController);
router.get("/shifts/available", requireApiKey, getAvailableShiftsController);
router.post("/shifts/:shiftId/preview", requireApiKey, previewShiftController);
router.post("/shifts/:shiftId/complete", requireApiKey("gameplay"), completeShiftController);

module.exports = router;
