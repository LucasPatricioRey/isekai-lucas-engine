const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const {
  getRouteController,
  listRoutesController,
  previewTravelController,
} = require("../controllers/travelController");

const router = express.Router();

router.get("/routes", requireApiKey, listRoutesController);
router.get("/routes/:routeId", requireApiKey, getRouteController);
router.post("/preview", requireApiKey, previewTravelController);

module.exports = router;
