require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const Location = require("../models/Location");
const TravelRoute = require("../models/TravelRoute");

const SOURCE = "g18_hoshimori_routes_seed";
const MARKER_TAGS = ["g18", "hoshimori", "travel_routes"];

function route({
  routeId,
  fromLocationId,
  toLocationId,
  baseMinutes,
  routeType = "town",
  dangerLevel = "safe",
  terrain = [],
  notes = "",
}) {
  return {
    routeId,
    fromLocationId,
    toLocationId,
    baseMinutes,
    routeType,
    dangerLevel,
    terrain,
    bidirectional: true,
    modifiers: [
      {
        key: "light_rain_or_bad_weather",
        label: "Lluvia leve o mal clima exterior",
        multiplier: 1.25,
        condition: "Se aplica solo a rutas exteriores.",
      },
      {
        key: "heavy_rain",
        label: "Lluvia fuerte exterior",
        multiplier: 1.5,
        condition: "Se aplica solo a rutas exteriores.",
      },
      {
        key: "heavy_load",
        label: "Carga pesada",
        multiplier: 1.25,
        condition: "Se aplica si Lucas viaja con carga pesada.",
      },
      {
        key: "injured",
        label: "Herido o movilidad reducida",
        multiplier: 1.25,
        condition: "Se aplica si Lucas viaja herido.",
      },
    ],
    source: SOURCE,
    tags: [...MARKER_TAGS, SOURCE, routeType, dangerLevel, ...terrain],
    notes,
  };
}

const routes = [
  route({
    routeId: "route_hoshimori_grulla_azul_lucas_room",
    fromLocationId: "loc_hoshimori_grulla_azul",
    toLocationId: "loc_hoshimori_lucas_room",
    baseMinutes: 5,
    routeType: "interior",
    terrain: ["inn"],
  }),
  route({
    routeId: "route_hoshimori_grulla_comedor_cocina",
    fromLocationId: "loc_hoshimori_grulla_azul_comedor",
    toLocationId: "loc_hoshimori_grulla_azul_cocina",
    baseMinutes: 2,
    routeType: "interior",
    terrain: ["inn"],
  }),
  route({
    routeId: "route_hoshimori_grulla_comedor_entrance_stable",
    fromLocationId: "loc_hoshimori_grulla_azul_comedor",
    toLocationId: "loc_hoshimori_grulla_azul_entrance_stable",
    baseMinutes: 3,
    routeType: "interior",
    terrain: ["inn"],
  }),
  route({
    routeId: "route_hoshimori_grulla_azul_plaza",
    fromLocationId: "loc_hoshimori_grulla_azul",
    toLocationId: "loc_hoshimori_plaza",
    baseMinutes: 10,
    terrain: ["street"],
  }),
  route({
    routeId: "route_hoshimori_grulla_azul_market",
    fromLocationId: "loc_hoshimori_grulla_azul",
    toLocationId: "loc_hoshimori_market",
    baseMinutes: 15,
    terrain: ["street", "market_path"],
  }),
  route({
    routeId: "route_hoshimori_lucas_room_market",
    fromLocationId: "loc_hoshimori_lucas_room",
    toLocationId: "loc_hoshimori_market",
    baseMinutes: 20,
    terrain: ["inn", "street", "market_path"],
  }),
  route({
    routeId: "route_hoshimori_plaza_market",
    fromLocationId: "loc_hoshimori_plaza",
    toLocationId: "loc_hoshimori_market",
    baseMinutes: 8,
    terrain: ["street", "market_path"],
  }),
  route({
    routeId: "route_hoshimori_plaza_guild",
    fromLocationId: "loc_hoshimori_plaza",
    toLocationId: "loc_hoshimori_guild",
    baseMinutes: 12,
    terrain: ["street"],
  }),
  route({
    routeId: "route_hoshimori_plaza_temple",
    fromLocationId: "loc_hoshimori_plaza",
    toLocationId: "loc_hoshimori_temple_serene_flame",
    baseMinutes: 8,
    terrain: ["street", "temple_path"],
  }),
  route({
    routeId: "route_hoshimori_plaza_borin_smithy",
    fromLocationId: "loc_hoshimori_plaza",
    toLocationId: "loc_hoshimori_borin_smithy",
    baseMinutes: 10,
    terrain: ["street", "workshop_lane"],
  }),
  route({
    routeId: "route_hoshimori_market_borin_smithy",
    fromLocationId: "loc_hoshimori_market",
    toLocationId: "loc_hoshimori_borin_smithy",
    baseMinutes: 5,
    terrain: ["market_lane"],
  }),
  route({
    routeId: "route_hoshimori_market_sella_workshop",
    fromLocationId: "loc_hoshimori_market",
    toLocationId: "loc_hoshimori_sella_workshop",
    baseMinutes: 6,
    terrain: ["market_lane"],
  }),
  route({
    routeId: "route_hoshimori_market_liora_stall",
    fromLocationId: "loc_hoshimori_market",
    toLocationId: "loc_hoshimori_liora_stall",
    baseMinutes: 2,
    terrain: ["market_lane"],
  }),
  route({
    routeId: "route_hoshimori_guild_patio",
    fromLocationId: "loc_hoshimori_guild",
    toLocationId: "loc_hoshimori_guild_patio",
    baseMinutes: 2,
    routeType: "interior",
    terrain: ["guild"],
  }),
  route({
    routeId: "route_hoshimori_guild_temple",
    fromLocationId: "loc_hoshimori_guild",
    toLocationId: "loc_hoshimori_temple_serene_flame",
    baseMinutes: 15,
    terrain: ["street", "temple_path"],
  }),
  route({
    routeId: "route_hoshimori_grulla_azul_guild",
    fromLocationId: "loc_hoshimori_grulla_azul",
    toLocationId: "loc_hoshimori_guild",
    baseMinutes: 20,
    terrain: ["street"],
  }),
  route({
    routeId: "route_hoshimori_grulla_azul_road_to_mill",
    fromLocationId: "loc_hoshimori_grulla_azul",
    toLocationId: "loc_hoshimori_road_to_mill",
    baseMinutes: 25,
    routeType: "road",
    dangerLevel: "low",
    terrain: ["mud_road", "outskirts"],
  }),
  route({
    routeId: "route_hoshimori_road_to_mill_mill",
    fromLocationId: "loc_hoshimori_road_to_mill",
    toLocationId: "loc_hoshimori_mill",
    baseMinutes: 45,
    routeType: "road",
    dangerLevel: "low",
    terrain: ["mud_road", "rural_path"],
  }),
  route({
    routeId: "route_hoshimori_grulla_azul_forest_edge",
    fromLocationId: "loc_hoshimori_grulla_azul",
    toLocationId: "loc_hoshimori_forest_whispers_edge",
    baseMinutes: 90,
    routeType: "road",
    dangerLevel: "low",
    terrain: ["forest_path", "mud_road"],
  }),
  route({
    routeId: "route_hoshimori_forest_edge_mid",
    fromLocationId: "loc_hoshimori_forest_whispers_edge",
    toLocationId: "loc_hoshimori_forest_whispers_mid",
    baseMinutes: 35,
    routeType: "wilderness",
    dangerLevel: "medium",
    terrain: ["forest", "uneven_ground"],
  }),
  route({
    routeId: "route_hoshimori_forest_mid_deep",
    fromLocationId: "loc_hoshimori_forest_whispers_mid",
    toLocationId: "loc_hoshimori_forest_whispers_deep",
    baseMinutes: 60,
    routeType: "wilderness",
    dangerLevel: "high",
    terrain: ["deep_forest", "poor_visibility"],
  }),
  route({
    routeId: "route_hoshimori_grulla_azul_gray_hills_base",
    fromLocationId: "loc_hoshimori_grulla_azul",
    toLocationId: "loc_hoshimori_gray_hills_base",
    baseMinutes: 150,
    routeType: "regional",
    dangerLevel: "medium",
    terrain: ["hills_path", "road"],
  }),
  route({
    routeId: "route_hoshimori_gray_hills_base_caves",
    fromLocationId: "loc_hoshimori_gray_hills_base",
    toLocationId: "loc_hoshimori_gray_hills_caves",
    baseMinutes: 45,
    routeType: "wilderness",
    dangerLevel: "medium",
    terrain: ["hills", "caves"],
  }),
];

async function assertReferencesExist() {
  const locationIds = Array.from(
    new Set(routes.flatMap((entry) => [entry.fromLocationId, entry.toLocationId]))
  );

  const found = await Location.find({ locationId: { $in: locationIds } })
    .select("locationId")
    .lean();
  const foundIds = new Set(found.map((location) => location.locationId));
  const missing = locationIds.filter((locationId) => !foundIds.has(locationId));

  if (missing.length > 0) {
    throw new Error(`Missing locations required for G18 routes seed: ${missing.join(", ")}`);
  }
}

async function seedHoshimoriRoutes() {
  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    throw new Error("MONGODB_URI is required to seed Hoshimori routes.");
  }

  await assertReferencesExist();

  await TravelRoute.bulkWrite(
    routes.map((entry) => ({
      updateOne: {
        filter: { routeId: entry.routeId },
        update: { $set: entry },
        upsert: true,
      },
    }))
  );

  const count = await TravelRoute.countDocuments({
    source: SOURCE,
    tags: { $all: MARKER_TAGS },
  });

  console.log("Hoshimori routes seed completed.");
  console.log(`Expected G18 routes in seed: ${routes.length}`);
  console.log(`MongoDB G18 routes found: ${count}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  seedHoshimoriRoutes().catch(async (error) => {
    console.error("Error seeding Hoshimori routes:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = {
  MARKER_TAGS,
  SOURCE,
  routes,
  seedHoshimoriRoutes,
};
