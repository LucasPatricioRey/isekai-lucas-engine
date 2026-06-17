const Location = require("../models/Location");

const VIRTUAL_ROUTE_SOURCE = "virtual_location_hierarchy";
const DANGER_ORDER = ["safe", "low", "medium", "high", "extreme"];

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function sanitizeIdPart(value = "") {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function riskRank(level = "safe") {
  const index = DANGER_ORDER.indexOf(String(level || "safe"));
  return index >= 0 ? index : 0;
}

function highestDanger(left = "safe", right = "safe") {
  return riskRank(left) >= riskRank(right) ? left || "safe" : right || "safe";
}

function isPrivateRoom(location = {}) {
  const source = `${location.locationId || ""} ${location.name || ""} ${location.type || ""} ${(location.tags || []).join(" ")}`
    .toLowerCase();
  return /\b(room|cuarto|habitacion|private_room|bedroom)\b/.test(source);
}

function estimateHierarchyMinutes({ parent = {}, child = {} } = {}) {
  if (isPrivateRoom(child)) return 5;
  if (isPrivateRoom(parent)) return 5;
  return 2;
}

function buildVirtualHierarchyRoute({ parent = {}, child = {} } = {}) {
  if (!parent.locationId || !child.locationId) return null;
  return {
    routeId: `virtual_hierarchy_${sanitizeIdPart(parent.locationId)}_${sanitizeIdPart(child.locationId)}`,
    fromLocationId: parent.locationId,
    toLocationId: child.locationId,
    baseMinutes: estimateHierarchyMinutes({ parent, child }),
    routeType: "interior",
    dangerLevel: highestDanger(parent.dangerLevel, child.dangerLevel),
    terrain: unique(["interior", "location_hierarchy", ...(parent.tags || []), ...(child.tags || [])]).slice(0, 12),
    bidirectional: true,
    modifiers: [],
    source: VIRTUAL_ROUTE_SOURCE,
    tags: unique(["virtual", "location_hierarchy", "internal_transition", ...(parent.tags || []), ...(child.tags || [])]).slice(0, 16),
    notes:
      "Ruta virtual derivada de parentLocationId; usar para transiciones internas cuando no hay TravelRoute explicita.",
  };
}

function pairKey(fromLocationId = "", toLocationId = "") {
  return `${fromLocationId}->${toLocationId}`;
}

function explicitRoutePairs(routes = []) {
  const pairs = new Set();
  for (const route of routes) {
    if (!route.fromLocationId || !route.toLocationId) continue;
    pairs.add(pairKey(route.fromLocationId, route.toLocationId));
    if (route.bidirectional) pairs.add(pairKey(route.toLocationId, route.fromLocationId));
  }
  return pairs;
}

async function listVirtualHierarchyRoutes({ explicitRoutes = [] } = {}) {
  const childLocations = await Location.find({ parentLocationId: { $nin: ["", null] } })
    .select("locationId name type parentLocationId dangerLevel currentStatus tags")
    .lean();
  const parentIds = unique(childLocations.map((location) => location.parentLocationId));
  const parents = parentIds.length
    ? await Location.find({ locationId: { $in: parentIds } })
        .select("locationId name type parentLocationId dangerLevel currentStatus tags")
        .lean()
    : [];
  const locationsById = new Map([...parents, ...childLocations].map((location) => [location.locationId, location]));
  const explicitPairs = explicitRoutePairs(explicitRoutes);

  return childLocations
    .map((child) => buildVirtualHierarchyRoute({ parent: locationsById.get(child.parentLocationId), child }))
    .filter(Boolean)
    .filter((route) => !explicitPairs.has(pairKey(route.fromLocationId, route.toLocationId)))
    .filter((route) => !explicitPairs.has(pairKey(route.toLocationId, route.fromLocationId)));
}

async function findVirtualHierarchyRoute({ fromLocationId = "", toLocationId = "" } = {}) {
  if (!fromLocationId || !toLocationId || fromLocationId === toLocationId) return null;
  const locations = await Location.find({ locationId: { $in: [fromLocationId, toLocationId] } })
    .select("locationId name type parentLocationId dangerLevel currentStatus tags")
    .lean();
  const byId = new Map(locations.map((location) => [location.locationId, location]));
  const from = byId.get(fromLocationId);
  const to = byId.get(toLocationId);
  if (!from || !to) return null;

  if (to.parentLocationId === from.locationId) {
    return {
      route: buildVirtualHierarchyRoute({ parent: from, child: to }),
      reversed: false,
    };
  }

  if (from.parentLocationId === to.locationId) {
    return {
      route: buildVirtualHierarchyRoute({ parent: to, child: from }),
      reversed: true,
    };
  }

  return null;
}

function isVirtualHierarchyRoute(route = {}) {
  return route.source === VIRTUAL_ROUTE_SOURCE;
}

module.exports = {
  VIRTUAL_ROUTE_SOURCE,
  findVirtualHierarchyRoute,
  isVirtualHierarchyRoute,
  listVirtualHierarchyRoutes,
};
