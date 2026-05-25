const WeatherState = require("../models/WeatherState");

const EXTERIOR_ROUTE_TYPES = new Set(["town", "road", "wilderness", "regional"]);

function terrainMatches(effectTerrain = [], routeTerrain = []) {
  if (!effectTerrain.length) return true;
  const routeTerrainSet = new Set(routeTerrain || []);
  return effectTerrain.some((terrain) => routeTerrainSet.has(terrain));
}

function routeTypeMatches(effectTypes = [], routeType = "") {
  if (!effectTypes.length) return true;
  return effectTypes.includes(routeType);
}

function isExterior(routeType) {
  return EXTERIOR_ROUTE_TYPES.has(routeType);
}

async function getCurrentWeather({ regionId = "region_hoshimori" } = {}) {
  const weather = await WeatherState.findOne({ regionId })
    .sort({ startedDay: -1, startedTime: -1, updatedAt: -1 })
    .lean();

  if (!weather) {
    const error = new Error(`No existe WeatherState para regionId: ${regionId}`);
    error.statusCode = 404;
    throw error;
  }

  return weather;
}

function conditionBaseEffects(weather, routeType) {
  const effects = [];

  if (!weather || !isExterior(routeType)) return effects;

  if (weather.currentCondition === "light_rain") {
    effects.push({
      key: "weather_light_rain",
      label: "Lluvia leve exterior",
      type: "travel_time_multiplier",
      value: 1.25,
      reason: "Lluvia leve ralentiza rutas exteriores.",
    });
  }

  if (weather.currentCondition === "heavy_rain") {
    effects.push({
      key: "weather_heavy_rain",
      label: "Lluvia fuerte exterior",
      type: "travel_time_multiplier",
      value: 1.5,
      reason: "Lluvia fuerte ralentiza rutas exteriores.",
    });
  }

  if (weather.currentCondition === "fog") {
    effects.push({
      key: "weather_fog_visibility",
      label: "Niebla",
      type: "visibility_warning",
      value: "reduced_visibility",
      reason: "La niebla reduce visibilidad y puede aumentar riesgo narrativo.",
    });
  }

  return effects;
}

async function previewWeatherEffects({
  regionId = "region_hoshimori",
  routeType = "town",
  terrain = [],
  condition = "",
  intensity = null,
} = {}) {
  const current = await getCurrentWeather({ regionId });
  const weather = {
    ...current,
    currentCondition: condition || current.currentCondition,
    intensity: intensity === null || intensity === undefined ? current.intensity : intensity,
  };

  const baseEffects = conditionBaseEffects(weather, routeType);
  const configuredEffects = (weather.effects || [])
    .filter((effect) => routeTypeMatches(effect.appliesToRouteTypes || [], routeType))
    .filter((effect) => terrainMatches(effect.appliesToTerrain || [], terrain))
    .map((effect) => ({
      key: `${weather.weatherId}_${effect.type}_${effect.target || "route"}`,
      label: effect.target || effect.type,
      type: effect.type,
      value: effect.value,
      reason: effect.reason || "",
    }));

  const effects = [...baseEffects, ...configuredEffects];
  const travelMultipliers = effects
    .filter((effect) => effect.type === "travel_time_multiplier")
    .map((effect) => Number(effect.value || 1))
    .filter((value) => Number.isFinite(value) && value > 0);
  const travelTimeMultiplier = travelMultipliers.reduce((total, value) => total * value, 1);
  const warnings = effects
    .filter((effect) => effect.type !== "travel_time_multiplier")
    .map((effect) => effect.reason || effect.label)
    .filter(Boolean);

  return {
    dryRun: true,
    willMutateGameState: false,
    weather,
    routeType,
    terrain,
    effects,
    travelTimeMultiplier,
    warnings,
  };
}

module.exports = {
  getCurrentWeather,
  previewWeatherEffects,
};
