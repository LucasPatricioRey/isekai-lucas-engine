const GameState = require("../models/GameState");
const Location = require("../models/Location");
const TravelRoute = require("../models/TravelRoute");
const { calculateActivityCost } = require("./biologicalClockService");
const {
  findVirtualHierarchyRoute,
  listVirtualHierarchyRoutes,
} = require("./locationGraphService");
const { previewWeatherEffects } = require("./weatherService");

const EXTERIOR_ROUTE_TYPES = new Set(["town", "road", "wilderness", "regional"]);
const DANGER_ORDER = ["safe", "low", "medium", "high", "extreme"];

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function minutesToTime(totalMinutes) {
  const minutesInDay = 24 * 60;
  const normalized = ((totalMinutes % minutesInDay) + minutesInDay) % minutesInDay;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function addMinutesToDayTime(day, time, minutesToAdd) {
  const current = timeToMinutes(time);
  const total = current + minutesToAdd;
  const dayDelta = Math.floor(total / (24 * 60));

  return {
    day: day + dayDelta,
    time: minutesToTime(total),
  };
}

function isValidTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function roundUpToFive(value) {
  return Math.ceil(value / 5) * 5;
}

function isExterior(route) {
  return EXTERIOR_ROUTE_TYPES.has(route.routeType);
}

function weatherMultiplier(route, weather) {
  if (!isExterior(route)) return null;

  const normalized = String(weather || "clear").toLowerCase();

  if (["heavy_rain", "lluvia_fuerte", "storm", "tormenta"].includes(normalized)) {
    return {
      key: "heavy_rain",
      label: "Lluvia fuerte exterior",
      multiplier: 1.5,
    };
  }

  if (
    [
      "light_rain",
      "lluvia_leve",
      "bad_weather",
      "mal_clima",
      "rain",
      "lluvia",
      "mud",
      "barro",
    ].includes(normalized)
  ) {
    return {
      key: "light_rain_or_bad_weather",
      label: "Lluvia leve o mal clima exterior",
      multiplier: 1.25,
    };
  }

  return null;
}

function buildWarnings(route, finalMinutes, conditions) {
  const warnings = [];

  if (route.dangerLevel !== "safe") {
    warnings.push(`Ruta con peligro ${route.dangerLevel}; el preview no crea encuentros automaticamente.`);
  }

  if (conditions?.injured) {
    warnings.push("Viajar herido aumenta duracion y puede requerir validacion de heridas en viaje real.");
  }

  if (conditions?.heavyLoad || conditions?.loadLevel === "heavy") {
    warnings.push("Carga pesada aplicada al calculo; no se modifica inventario en preview.");
  }

  if (finalMinutes >= 60) {
    warnings.push("Viaje largo: aplicar reloj biologico y luz/hora solo en endpoint mutador futuro.");
  }

  return warnings;
}

function highestRiskLevel(levels = []) {
  return levels
    .filter(Boolean)
    .sort((left, right) => DANGER_ORDER.indexOf(right) - DANGER_ORDER.indexOf(left))[0] || "safe";
}

function routeEdge(route, reversed = false) {
  return {
    route,
    reversed,
    fromLocationId: reversed ? route.toLocationId : route.fromLocationId,
    toLocationId: reversed ? route.fromLocationId : route.toLocationId,
  };
}

async function findRoutePath({ fromLocationId, toLocationId, maxSegments = 4 } = {}) {
  if (!fromLocationId || !toLocationId) {
    const error = new Error("fromLocationId y toLocationId son obligatorios para pathfinding.");
    error.statusCode = 400;
    throw error;
  }

  if (fromLocationId === toLocationId) {
    return {
      segments: [],
      startLocationId: fromLocationId,
      endLocationId: toLocationId,
    };
  }

  const explicitRoutes = await TravelRoute.find({}).sort({ baseMinutes: 1, routeId: 1 }).lean();
  const virtualRoutes = await listVirtualHierarchyRoutes({ explicitRoutes });
  const routes = [...explicitRoutes, ...virtualRoutes].sort((left, right) => {
    const minutesDiff = (left.baseMinutes || 0) - (right.baseMinutes || 0);
    if (minutesDiff !== 0) return minutesDiff;
    return String(left.routeId || "").localeCompare(String(right.routeId || ""));
  });
  const edgesByLocation = new Map();

  for (const route of routes) {
    const edges = [routeEdge(route, false)];
    if (route.bidirectional) edges.push(routeEdge(route, true));

    for (const edge of edges) {
      const list = edgesByLocation.get(edge.fromLocationId) || [];
      list.push(edge);
      edgesByLocation.set(edge.fromLocationId, list);
    }
  }

  const queue = [{ locationId: fromLocationId, segments: [], visited: new Set([fromLocationId]) }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.segments.length >= maxSegments) continue;

    for (const edge of edgesByLocation.get(current.locationId) || []) {
      if (current.visited.has(edge.toLocationId)) continue;

      const segments = [...current.segments, edge];
      if (edge.toLocationId === toLocationId) {
        return {
          segments,
          startLocationId: fromLocationId,
          endLocationId: toLocationId,
        };
      }

      queue.push({
        locationId: edge.toLocationId,
        segments,
        visited: new Set([...current.visited, edge.toLocationId]),
      });
    }
  }

  const error = new Error(`No existe ruta directa ni ruta multi-tramo entre ${fromLocationId} y ${toLocationId}.`);
  error.statusCode = 404;
  throw error;
}

async function listRoutes({ fromLocationId = "", toLocationId = "", routeType = "", dangerLevel = "" } = {}) {
  const query = {};

  if (fromLocationId) query.fromLocationId = fromLocationId;
  if (toLocationId) query.toLocationId = toLocationId;
  if (routeType) query.routeType = routeType;
  if (dangerLevel) query.dangerLevel = dangerLevel;

  const routes = await TravelRoute.find(query).sort({ routeType: 1, baseMinutes: 1, routeId: 1 }).lean();

  return { routes };
}

async function getRoute(routeId) {
  const route = await TravelRoute.findOne({ routeId }).lean();

  if (!route) {
    const error = new Error(`No existe TravelRoute con id: ${routeId}`);
    error.statusCode = 404;
    throw error;
  }

  return { route };
}

async function findRoute({ routeId = "", fromLocationId = "", toLocationId = "" }) {
  if (routeId) {
    const result = await getRoute(routeId);
    return {
      route: result.route,
      reversed: false,
    };
  }

  if (!fromLocationId || !toLocationId) {
    const error = new Error("fromLocationId y toLocationId son obligatorios si no se indica routeId.");
    error.statusCode = 400;
    throw error;
  }

  const direct = await TravelRoute.findOne({ fromLocationId, toLocationId }).lean();

  if (direct) {
    return {
      route: direct,
      reversed: false,
    };
  }

  const reverse = await TravelRoute.findOne({
    fromLocationId: toLocationId,
    toLocationId: fromLocationId,
    bidirectional: true,
  }).lean();

  if (reverse) {
    return {
      route: reverse,
      reversed: true,
    };
  }

  const virtual = await findVirtualHierarchyRoute({ fromLocationId, toLocationId });
  if (virtual?.route) return virtual;

  const error = new Error(`No existe ruta entre ${fromLocationId} y ${toLocationId}.`);
  error.statusCode = 404;
  throw error;
}

async function buildRoutePreview({
  gameState,
  route,
  reversed = false,
  conditions = {},
  startDay,
  startTime,
} = {}) {
  const actualFromLocationId = reversed ? route.toLocationId : route.fromLocationId;
  const actualToLocationId = reversed ? route.fromLocationId : route.toLocationId;

  const locations = await Location.find({
    locationId: { $in: [actualFromLocationId, actualToLocationId] },
  })
    .select("locationId name dangerLevel currentStatus")
    .lean();
  const locationById = new Map(locations.map((location) => [location.locationId, location]));

  const appliedModifiers = [];
  let total = route.baseMinutes;

  const weather = weatherMultiplier(route, conditions.weather);
  if (weather) {
    appliedModifiers.push(weather);
    total *= weather.multiplier;
  }

  let weatherPreview = null;
  if (!conditions.ignoreCurrentWeather && !conditions.weather) {
    try {
      weatherPreview = await previewWeatherEffects({
        regionId: conditions.regionId || "region_hoshimori",
        routeType: route.routeType,
        terrain: route.terrain || [],
      });

      const weatherMultiplierValue = Number(weatherPreview.travelTimeMultiplier || 1);
      if (weatherMultiplierValue > 1) {
        appliedModifiers.push({
          key: "current_weather",
          label: "Clima actual de la region",
          multiplier: weatherMultiplierValue,
          weatherId: weatherPreview.weather?.weatherId,
        });
        total *= weatherMultiplierValue;
      }
    } catch (error) {
      weatherPreview = {
        unavailable: true,
        reason: error.message,
      };
    }
  }

  if (conditions.heavyLoad || conditions.loadLevel === "heavy") {
    const modifier = {
      key: "heavy_load",
      label: "Carga pesada",
      multiplier: 1.25,
    };
    appliedModifiers.push(modifier);
    total *= modifier.multiplier;
  }

  if (conditions.injured) {
    const modifier = {
      key: "injured",
      label: "Herido o movilidad reducida",
      multiplier: 1.25,
    };
    appliedModifiers.push(modifier);
    total *= modifier.multiplier;
  }

  const finalMinutes = roundUpToFive(total);
  const arrival = addMinutesToDayTime(startDay, startTime, finalMinutes);
  const activityCategory = conditions.activityCategory || "viaje_caminata_suave";
  const biologicalCost = calculateActivityCost({
    category: activityCategory,
    minutes: finalMinutes,
    currentEnergy: gameState.lucasStatus?.energy?.current,
    currentSatiety: gameState.lucasStatus?.satiety?.current,
  });
  const biologicalCostPreview = {
    category: biologicalCost.categoryId,
    label: biologicalCost.label,
    minutes: finalMinutes,
    satietyDelta: biologicalCost.delta.satiety,
    energyDelta: biologicalCost.delta.energy,
    processesAtHourBoundary: arrival.time.endsWith(":00") && finalMinutes > 0,
    currentStatus: {
      satiety: gameState.lucasStatus?.satiety || null,
      energy: gameState.lucasStatus?.energy || null,
    },
    projectedStatus: biologicalCost.projected || null,
  };

  return {
    route: {
      ...route,
      fromLocationId: actualFromLocationId,
      toLocationId: actualToLocationId,
      reversed,
      fromLocation: locationById.get(actualFromLocationId) || null,
      toLocation: locationById.get(actualToLocationId) || null,
    },
    timing: {
      startDay,
      startTime,
      baseMinutes: route.baseMinutes,
      finalMinutes,
      expectedArrivalDay: arrival.day,
      expectedArrivalTime: arrival.time,
      roundedToFiveMinutes: finalMinutes !== Math.round(total),
    },
    biologicalCostPreview,
    appliedModifiers,
    weatherPreview,
    riskLevel: route.dangerLevel,
    warnings: buildWarnings(route, finalMinutes, conditions),
  };
}

async function previewTravel({
  gameId = "isekai_lucas_main",
  routeId = "",
  fromLocationId = "",
  toLocationId = "",
  conditions = {},
} = {}) {
  const gameState = await GameState.findOne({ gameId }).lean();

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const requestedFrom = fromLocationId || gameState.locationId;
  const previewStartDay = Number.isInteger(conditions.startDay) ? conditions.startDay : gameState.currentDay;
  const previewStartTime = isValidTime(conditions.startTime) ? conditions.startTime : gameState.time;
  const allowMultiSegment = Boolean(conditions.allowMultiSegment || conditions.allowPathfinding || conditions.multiSegment);
  const maxSegments = Number.isInteger(conditions.maxSegments)
    ? Math.max(1, Math.min(conditions.maxSegments, 8))
    : 4;

  let routeResult = null;
  try {
    routeResult = await findRoute({
      routeId,
      fromLocationId: requestedFrom,
      toLocationId,
    });
  } catch (error) {
    if (!allowMultiSegment || routeId || error.statusCode !== 404) {
      throw error;
    }
  }

  if (routeResult) {
    const segmentPreview = await buildRoutePreview({
      gameState,
      route: routeResult.route,
      reversed: routeResult.reversed,
      conditions,
      startDay: previewStartDay,
      startTime: previewStartTime,
    });

    return {
      dryRun: true,
      willMutateGameState: false,
      gameId,
      ...segmentPreview,
      conditions,
      encounters: {
        willCreateRandomEncounter: false,
        note: "Travel preview never creates encounters; a future mutator/world tick must decide that explicitly.",
      },
    };
  }

  const path = await findRoutePath({
    fromLocationId: requestedFrom,
    toLocationId,
    maxSegments,
  });

  const segmentPreviews = [];
  let cursorDay = previewStartDay;
  let cursorTime = previewStartTime;

  for (const segment of path.segments) {
    const segmentPreview = await buildRoutePreview({
      gameState,
      route: segment.route,
      reversed: segment.reversed,
      conditions,
      startDay: cursorDay,
      startTime: cursorTime,
    });
    segmentPreviews.push(segmentPreview);
    cursorDay = segmentPreview.timing.expectedArrivalDay;
    cursorTime = segmentPreview.timing.expectedArrivalTime;
  }

  const finalMinutes = segmentPreviews.reduce((sum, segment) => sum + segment.timing.finalMinutes, 0);
  const activityCategory = conditions.activityCategory || "viaje_caminata_suave";
  const biologicalCost = calculateActivityCost({
    category: activityCategory,
    minutes: finalMinutes,
    currentEnergy: gameState.lucasStatus?.energy?.current,
    currentSatiety: gameState.lucasStatus?.satiety?.current,
  });
  const biologicalCostPreview = {
    category: biologicalCost.categoryId,
    label: biologicalCost.label,
    minutes: finalMinutes,
    satietyDelta: biologicalCost.delta.satiety,
    energyDelta: biologicalCost.delta.energy,
    processesAtHourBoundary: cursorTime.endsWith(":00") && finalMinutes > 0,
    currentStatus: {
      satiety: gameState.lucasStatus?.satiety || null,
      energy: gameState.lucasStatus?.energy || null,
    },
    projectedStatus: biologicalCost.projected || null,
  };

  return {
    dryRun: true,
    willMutateGameState: false,
    gameId,
    route: null,
    path: {
      multiSegment: true,
      startLocationId: requestedFrom,
      endLocationId: toLocationId,
      segmentCount: segmentPreviews.length,
      maxSegments,
      segments: segmentPreviews.map((segment, index) => ({
        index: index + 1,
        route: segment.route,
        timing: segment.timing,
        biologicalCostPreview: segment.biologicalCostPreview,
        appliedModifiers: segment.appliedModifiers,
        riskLevel: segment.riskLevel,
        warnings: segment.warnings,
      })),
    },
    timing: {
      startDay: previewStartDay,
      startTime: previewStartTime,
      baseMinutes: path.segments.reduce((sum, segment) => sum + segment.route.baseMinutes, 0),
      finalMinutes,
      expectedArrivalDay: cursorDay,
      expectedArrivalTime: cursorTime,
      roundedToFiveMinutes: segmentPreviews.some((segment) => segment.timing.roundedToFiveMinutes),
    },
    biologicalCostPreview,
    conditions,
    appliedModifiers: segmentPreviews.flatMap((segment) => segment.appliedModifiers),
    weatherPreview: segmentPreviews.map((segment) => segment.weatherPreview),
    riskLevel: highestRiskLevel(segmentPreviews.map((segment) => segment.riskLevel)),
    warnings: [
      `Ruta multi-tramo: ${segmentPreviews.length} segmentos.`,
      ...segmentPreviews.flatMap((segment) => segment.warnings),
    ],
    encounters: {
      willCreateRandomEncounter: false,
      note: "Travel preview never creates encounters; a future mutator/world tick must decide that explicitly.",
    },
  };
}

module.exports = {
  listRoutes,
  getRoute,
  findRoute,
  findRoutePath,
  previewTravel,
  timeToMinutes,
  minutesToTime,
  addMinutesToDayTime,
  roundUpToFive,
  isValidTime,
};
