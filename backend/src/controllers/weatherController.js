const {
  getCurrentWeather,
  previewWeatherEffects,
} = require("../services/weatherService");

async function getCurrentWeatherController(req, res) {
  try {
    const weather = await getCurrentWeather({
      regionId: String(req.query.regionId || "region_hoshimori"),
    });

    return res.json({
      ok: true,
      weather,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function previewWeatherEffectsController(req, res) {
  try {
    const body = req.body || {};

    const preview = await previewWeatherEffects({
      regionId: body.regionId || "region_hoshimori",
      routeType: body.routeType || "town",
      terrain: Array.isArray(body.terrain) ? body.terrain : [],
      condition: body.condition || "",
      intensity: body.intensity ?? null,
    });

    return res.json({
      ok: true,
      preview,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

module.exports = {
  getCurrentWeatherController,
  previewWeatherEffectsController,
};
