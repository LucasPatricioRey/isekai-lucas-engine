const WeatherState = require("../models/WeatherState");

const EXTERIOR_ROUTE_TYPES = new Set(["town", "road", "wilderness", "regional"]);
const DEFAULT_REGION_ID = "region_hoshimori";
const AUTO_REFRESH_SOURCE = "weather_auto_refresh";

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}

function toAbsoluteMinutes(day, time) {
  return (Number(day || 1) - 1) * 1440 + timeToMinutes(time);
}

function sanitizeIdPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function getWeatherBlock(day, time) {
  const minutes = timeToMinutes(time);

  if (minutes < 360) {
    return {
      key: "predawn",
      label: "Madrugada",
      startDay: day,
      startTime: "00:00",
      endDay: day,
      endTime: "06:00",
      currentCondition: "clear",
      intensity: 1,
    };
  }

  if (minutes < 720) {
    return {
      key: "morning",
      label: "Manana",
      startDay: day,
      startTime: "06:00",
      endDay: day,
      endTime: "12:00",
      currentCondition: "cloudy",
      intensity: 1,
    };
  }

  if (minutes < 840) {
    return {
      key: "midday",
      label: "Mediodia",
      startDay: day,
      startTime: "12:00",
      endDay: day,
      endTime: "14:00",
      currentCondition: "clear",
      intensity: 1,
    };
  }

  if (minutes < 1080) {
    return {
      key: "afternoon",
      label: "Tarde",
      startDay: day,
      startTime: "14:00",
      endDay: day,
      endTime: "18:00",
      currentCondition: "cloudy",
      intensity: 1,
    };
  }

  return {
    key: "night",
    label: "Noche",
    startDay: day,
    startTime: "18:00",
    endDay: day + 1,
    endTime: "00:00",
    currentCondition: "clear",
    intensity: 1,
  };
}

function weatherCoversTime(weather, day, time) {
  if (!weather?.startedDay || !weather.startedTime || !weather.expectedUntilDay || !weather.expectedUntilTime) {
    return false;
  }

  const now = toAbsoluteMinutes(day, time);
  const start = toAbsoluteMinutes(weather.startedDay, weather.startedTime);
  const end = toAbsoluteMinutes(weather.expectedUntilDay, weather.expectedUntilTime);

  return now >= start && now < end;
}

function buildWeatherRefresh(gameState, latestWeather = null, { regionId = DEFAULT_REGION_ID } = {}) {
  const block = getWeatherBlock(gameState.currentDay, gameState.time);
  const effectiveRegionId = latestWeather?.regionId || regionId;
  const weatherId = `weather_${sanitizeIdPart(effectiveRegionId)}_d${block.startDay}_${block.key}_${AUTO_REFRESH_SOURCE}`;

  return {
    weatherId,
    regionId: effectiveRegionId,
    currentCondition: block.currentCondition,
    intensity: block.intensity,
    startedDay: block.startDay,
    startedTime: block.startTime,
    expectedUntilDay: block.endDay,
    expectedUntilTime: block.endTime,
    effects: [],
    source: AUTO_REFRESH_SOURCE,
    tags: [
      "system",
      "weather_refresh",
      "auto_weather",
      `weather_block_${block.key}`,
      `weather_day_${block.startDay}`,
    ],
  };
}

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

async function ensureCurrentWeatherForGameState(gameState, { regionId = DEFAULT_REGION_ID, session = null } = {}) {
  const latestWeather = await WeatherState.findOne({ regionId })
    .sort({ startedDay: -1, startedTime: -1, updatedAt: -1 })
    .session(session)
    .lean();

  if (weatherCoversTime(latestWeather, gameState.currentDay, gameState.time)) {
    return {
      changed: false,
      weather: latestWeather,
      before: latestWeather,
    };
  }

  const payload = buildWeatherRefresh(gameState, latestWeather, { regionId });
  const weather = await WeatherState.findOneAndUpdate(
    { weatherId: payload.weatherId },
    { $setOnInsert: payload },
    { upsert: true, returnDocument: "after", runValidators: true, session }
  ).lean();

  return {
    changed: true,
    before: latestWeather,
    weather,
  };
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
  AUTO_REFRESH_SOURCE,
  buildWeatherRefresh,
  ensureCurrentWeatherForGameState,
  getCurrentWeather,
  getWeatherBlock,
  weatherCoversTime,
  previewWeatherEffects,
};
