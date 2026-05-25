require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const Faction = require("../models/Faction");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const Rumor = require("../models/Rumor");
const WorldEvent = require("../models/WorldEvent");

const SOURCE = "g5_hoshimori_rumors_seed";
const MARKER_TAGS = ["g5", "hoshimori", "rumor"];
const CREATED_DAY = 10;
const CREATED_TIME = "12:00";

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function rumor(rumorId, data) {
  const tags = unique([...MARKER_TAGS, SOURCE, ...(data.tags || [])]);

  return {
    rumorId,
    content: data.content,
    originalContent: data.originalContent || data.content,
    origin: data.origin,
    source: SOURCE,
    sourceType: data.sourceType || "anonymous",
    certainty: data.certainty || "rumor",
    distortionLevel: data.distortionLevel ?? 1,
    knownByNpcIds: data.knownByNpcIds || [],
    knownByFactionIds: data.knownByFactionIds || [],
    locationIds: data.locationIds || [],
    relatedEventIds: data.relatedEventIds || [],
    createdDay: CREATED_DAY,
    createdTime: CREATED_TIME,
    expiresDay: data.expiresDay ?? null,
    status: data.status || "active",
    tags,
  };
}

const rumors = [
  rumor("rumor_g5_hoshimori_muddy_route_delays", {
    content:
      "Se dice que el barro sigue retrasando carretas y entregas en las rutas cercanas a Hoshimori.",
    origin: "Comentarios de transportistas al llegar al pueblo.",
    sourceType: "public_event",
    certainty: "probable",
    distortionLevel: 1,
    knownByNpcIds: ["npc_tessa", "npc_pavo", "npc_joren_pell", "npc_roberto_valen"],
    knownByFactionIds: ["faction_grulla_azul"],
    locationIds: [
      "loc_hoshimori_grulla_azul",
      "loc_hoshimori_grulla_azul_comedor",
      "loc_hoshimori_market",
      "loc_hoshimori_road_entrance",
      "loc_hoshimori_road_to_mill",
    ],
    relatedEventIds: ["event_d10_supply_delay_mud"],
    tags: ["mud", "routes", "supplies", "transport"],
  }),
  rumor("rumor_g5_hoshimori_merchants_late", {
    content:
      "En el mercado comentan que algunos comerciantes llegaran tarde o con menos mercaderia de la habitual.",
    origin: "Charla de puestos del mercado durante el mediodia.",
    sourceType: "market",
    certainty: "rumor",
    distortionLevel: 1,
    knownByNpcIds: ["npc_pavo", "npc_irma", "npc_liora", "npc_tessa"],
    locationIds: ["loc_hoshimori_market", "loc_hoshimori_liora_stall", "loc_hoshimori_road_entrance"],
    relatedEventIds: ["event_d10_supply_delay_mud"],
    tags: ["market", "merchants", "supplies"],
  }),
  rumor("rumor_g5_hoshimori_wolf_tracks_mill_road", {
    content:
      "Alguien vio huellas que podrian ser de lobo cerca del Camino del Molino, pero nadie trajo prueba clara.",
    origin: "Advertencia repetida entre caminantes y guardias locales.",
    sourceType: "guard",
    certainty: "rumor",
    distortionLevel: 2,
    knownByNpcIds: ["npc_doran", "npc_kael", "npc_tessa", "npc_garrick_thorne"],
    knownByFactionIds: ["faction_hoshimori_guild"],
    locationIds: [
      "loc_hoshimori_road_to_mill",
      "loc_hoshimori_mill",
      "loc_hoshimori_guard_post",
      "loc_hoshimori_guild",
    ],
    tags: ["wolf", "tracks", "mill_road", "guard", "guild"],
  }),
  rumor("rumor_g5_hoshimori_whispering_forest_lights", {
    content:
      "Hay quienes hablan de luces bajas o una sensacion rara cerca del Bosque de los Susurros despues de la lluvia.",
    origin: "Relatos vagos de viajeros que no entraron demasiado al bosque.",
    sourceType: "anonymous",
    certainty: "doubtful",
    distortionLevel: 3,
    knownByNpcIds: ["npc_doran", "npc_narek", "npc_liora"],
    locationIds: [
      "loc_hoshimori_forest_whispers_edge",
      "loc_hoshimori_forest_whispers_mid",
      "loc_hoshimori_temple_serene_flame",
      "loc_hoshimori_liora_stall",
    ],
    tags: ["forest", "whispers", "strange_lights", "after_rain"],
  }),
  rumor("rumor_g5_hoshimori_inn_market_supplies_short", {
    content:
      "La Grulla Azul y algunos puestos podrian estar cuidando raciones porque los suministros vienen lentos.",
    origin: "Comentarios cruzados entre posada y mercado.",
    sourceType: "market",
    certainty: "probable",
    distortionLevel: 1,
    knownByNpcIds: ["npc_roberto_valen", "npc_joren_pell", "npc_pavo", "npc_irma"],
    knownByFactionIds: ["faction_grulla_azul"],
    locationIds: [
      "loc_hoshimori_grulla_azul",
      "loc_hoshimori_grulla_azul_comedor",
      "loc_hoshimori_market",
    ],
    relatedEventIds: ["event_d10_supply_delay_mud"],
    tags: ["inn", "market", "supplies", "rations"],
  }),
  rumor("rumor_g5_hoshimori_guild_simple_work", {
    content:
      "Se comenta que el gremio esta buscando voluntarios para trabajos simples y reportes de ruta.",
    origin: "Cartelera y charla de mediodia cerca del gremio.",
    sourceType: "guild",
    certainty: "probable",
    distortionLevel: 0,
    knownByNpcIds: ["npc_garrick_thorne", "npc_mara_vell", "npc_tessa", "npc_joren_pell"],
    knownByFactionIds: ["faction_hoshimori_guild"],
    locationIds: ["loc_hoshimori_guild", "loc_hoshimori_guild_patio", "loc_hoshimori_plaza"],
    tags: ["guild", "work", "volunteers", "route_reports"],
  }),
  rumor("rumor_g5_hoshimori_forest_uncomfortable_after_rain", {
    content:
      "Dicen que el Bosque de los Susurros se siente mas incomodo que de costumbre despues de la lluvia.",
    origin: "Advertencias de gente que prefiere no caminar sola cerca del bosque.",
    sourceType: "npc",
    certainty: "rumor",
    distortionLevel: 2,
    knownByNpcIds: ["npc_doran", "npc_narek", "npc_kael"],
    locationIds: [
      "loc_hoshimori_forest_whispers_edge",
      "loc_hoshimori_road_to_mill",
      "loc_hoshimori_plaza",
      "loc_hoshimori_temple_serene_flame",
    ],
    tags: ["forest", "after_rain", "uneasy", "travel"],
  }),
  rumor("rumor_g5_hoshimori_clients_muddy_roads", {
    content:
      "Clientes de paso hablan de caminos pesados por barro y de viajes mas lentos hasta que se seque el suelo.",
    origin: "Conversaciones de clientes en La Grulla Azul.",
    sourceType: "npc",
    certainty: "rumor",
    distortionLevel: 1,
    knownByNpcIds: ["npc_roberto_valen", "npc_joren_pell", "npc_yara_mils"],
    locationIds: [
      "loc_hoshimori_grulla_azul",
      "loc_hoshimori_grulla_azul_comedor",
      "loc_hoshimori_road_entrance",
    ],
    relatedEventIds: ["event_d10_supply_delay_mud"],
    tags: ["inn", "clients", "mud", "roads"],
  }),
];

async function assertReferencesExist() {
  const npcIds = unique(rumors.flatMap((entry) => entry.knownByNpcIds));
  const locationIds = unique(rumors.flatMap((entry) => entry.locationIds));
  const factionIds = unique(rumors.flatMap((entry) => entry.knownByFactionIds));
  const eventIds = unique(rumors.flatMap((entry) => entry.relatedEventIds));

  const [npcs, locations, factions, events] = await Promise.all([
    Npc.find({ npcId: { $in: npcIds } }).select("npcId").lean(),
    Location.find({ locationId: { $in: locationIds } }).select("locationId").lean(),
    Faction.find({ factionId: { $in: factionIds } }).select("factionId").lean(),
    WorldEvent.find({ eventId: { $in: eventIds } }).select("eventId").lean(),
  ]);

  const existingNpcIds = new Set(npcs.map((entry) => entry.npcId));
  const existingLocationIds = new Set(locations.map((entry) => entry.locationId));
  const existingFactionIds = new Set(factions.map((entry) => entry.factionId));
  const existingEventIds = new Set(events.map((entry) => entry.eventId));

  const missingNpcs = npcIds.filter((id) => !existingNpcIds.has(id));
  const missingLocations = locationIds.filter((id) => !existingLocationIds.has(id));
  const missingFactions = factionIds.filter((id) => !existingFactionIds.has(id));
  const missingEvents = eventIds.filter((id) => !existingEventIds.has(id));

  const missing = [
    missingNpcs.length ? `NPCs: ${missingNpcs.join(", ")}` : "",
    missingLocations.length ? `locations: ${missingLocations.join(", ")}` : "",
    missingFactions.length ? `factions: ${missingFactions.join(", ")}` : "",
    missingEvents.length ? `events: ${missingEvents.join(", ")}` : "",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing references required for G5 rumors seed: ${missing.join("; ")}`);
  }
}

async function seedHoshimoriRumors() {
  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    throw new Error("MONGODB_URI is required to seed Hoshimori rumors.");
  }

  await assertReferencesExist();

  await Rumor.bulkWrite(
    rumors.map((entry) => ({
      updateOne: {
        filter: { rumorId: entry.rumorId },
        update: { $set: entry },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  const [g5RumorCount, activeG5RumorCount] = await Promise.all([
    Rumor.countDocuments({ source: SOURCE, tags: { $all: MARKER_TAGS } }),
    Rumor.countDocuments({ source: SOURCE, tags: { $all: MARKER_TAGS }, status: "active" }),
  ]);

  console.log("Hoshimori rumors seed completed.");
  console.log(`Expected G5 rumors in seed: ${rumors.length}`);
  console.log(`MongoDB G5 rumors with marker: ${g5RumorCount}`);
  console.log(`MongoDB active G5 rumors: ${activeG5RumorCount}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  seedHoshimoriRumors().catch(async (error) => {
    console.error("Error seeding Hoshimori rumors:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = {
  MARKER_TAGS,
  SOURCE,
  rumors,
  seedHoshimoriRumors,
};
