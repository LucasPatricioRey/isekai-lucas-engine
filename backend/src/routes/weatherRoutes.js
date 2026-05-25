const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const {
  getCurrentWeatherController,
  previewWeatherEffectsController,
} = require("../controllers/weatherController");

const router = express.Router();

router.get("/current", requireApiKey, getCurrentWeatherController);
router.post("/effects/preview", requireApiKey, previewWeatherEffectsController);

module.exports = router;
