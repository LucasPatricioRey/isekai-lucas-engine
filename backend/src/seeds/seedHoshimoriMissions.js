require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const EnemyTemplate = require("../models/EnemyTemplate");
const Faction = require("../models/Faction");
const Item = require("../models/Item");
const Location = require("../models/Location");
const Mission = require("../models/Mission");
const Npc = require("../models/Npc");
const ShopStock = require("../models/ShopStock");

const SOURCE = "g7_hoshimori_missions_seed";
const MARKER_TAGS = ["g7", "hoshimori", "missions"];

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function tags(extra = []) {
  return unique([...MARKER_TAGS, SOURCE, ...extra]);
}

function mission(missionId, data) {
  return {
    missionId,
    templateId: data.templateId,
    title: data.title,
    description: data.description,
    sourceFactionId: data.sourceFactionId || "faction_hoshimori_guild",
    clientNpcId: data.clientNpcId || "",
    locationId: data.locationId,
    rank: data.rank || "Porcelana",
    requirements: data.requirements || [],
    reward: data.reward || { moneyCopper: 0, items: [], other: "" },
    mgReward: data.mgReward ?? 1,
    riskLevel: data.riskLevel || "low",
    status: "available",
    postedDay: data.postedDay ?? 10,
    postedTime: data.postedTime || "07:00",
    expiresDay: data.expiresDay ?? null,
    expiresTime: data.expiresTime || "",
    proofRequired: data.proofRequired,
    proofStatus: data.proofStatus || "pending",
    consequencesIfIgnored: data.consequencesIfIgnored || [],
    relatedEventIds: data.relatedEventIds || [],
    flags: {
      ...(data.flags || {}),
      g7: true,
      source: SOURCE,
      tags: tags(data.flags?.tags || []),
    },
  };
}

const missions = [
  mission("mission_d10_cleanup_post_rain", {
    templateId: "template_cleanup_post_rain",
    title: "Limpieza post-lluvia en ruta cercana",
    description: "Ayudar a retirar barro y ramas menores en un tramo seguro cercano a Hoshimori.",
    clientNpcId: "npc_garrick_thorne",
    locationId: "loc_hoshimori_guild",
    rank: "Porcelana",
    requirements: ["presentarse en el gremio", "aceptar formalmente", "trabajo fisico basico"],
    reward: { moneyCopper: 80, items: [], other: "" },
    mgReward: 3,
    riskLevel: "low",
    postedTime: "06:00",
    expiresDay: 10,
    expiresTime: "18:00",
    proofRequired: "reporte simple de finalizacion",
    consequencesIfIgnored: ["otro voluntario puede tomar el encargo"],
    relatedEventIds: ["event_d10_supply_delay_mud"],
    flags: { starterMission: true, missionType: "route_cleanup", noCombatRequired: true },
  }),
  mission("mission_d10_grulla_delivery_guild", {
    templateId: "template_simple_delivery",
    title: "Entrega de notas de La Grulla Azul al gremio",
    description:
      "Llevar un paquete pequeno de notas y recados desde La Grulla Azul hasta la mesa de registros del gremio.",
    sourceFactionId: "faction_grulla_azul",
    clientNpcId: "npc_roberto_valen",
    locationId: "loc_hoshimori_grulla_azul",
    rank: "Porcelana",
    requirements: ["recoger el paquete sellado", "entregarlo en el gremio", "no abrir el paquete"],
    reward: { moneyCopper: 35, items: [], other: "Comida sencilla si Roberto lo confirma." },
    mgReward: 1,
    riskLevel: "none",
    postedTime: "10:30",
    expiresDay: 10,
    expiresTime: "17:00",
    proofRequired: "recibo verbal o marca de entrega del gremio",
    consequencesIfIgnored: ["Roberto enviara a otro recadero por la tarde"],
    relatedEventIds: ["event_d10_supply_delay_mud"],
    flags: { missionType: "delivery", noCombatRequired: true, route: ["loc_hoshimori_grulla_azul", "loc_hoshimori_guild"] },
  }),
  mission("mission_d10_market_load_support", {
    templateId: "template_market_support",
    title: "Apoyo de carga en el mercado",
    description:
      "Ayudar a mover cajas livianas y ordenar suministros retrasados en el Mercado de Hoshimori.",
    clientNpcId: "npc_pavo",
    locationId: "loc_hoshimori_market",
    rank: "Porcelana",
    requirements: ["trabajo fisico liviano", "obedecer a los comerciantes", "no discutir precios por cuenta propia"],
    reward: { moneyCopper: 60, items: ["item_pan_simple"], other: "" },
    mgReward: 2,
    riskLevel: "low",
    postedTime: "09:00",
    expiresDay: 10,
    expiresTime: "18:00",
    proofRequired: "confirmacion de Pavo o Irma sobre cajas movidas",
    consequencesIfIgnored: ["los puestos tardan mas en ordenar mercaderia"],
    relatedEventIds: ["event_d10_supply_delay_mud"],
    flags: { missionType: "labor", noCombatRequired: true },
  }),
  mission("mission_d10_mill_road_mud_help", {
    templateId: "template_mill_road_help",
    title: "Ayuda menor en el Camino del Molino",
    description:
      "Revisar un tramo cercano del Camino del Molino y ayudar a marcar pozos de barro sin alejarse del camino.",
    clientNpcId: "npc_tessa",
    locationId: "loc_hoshimori_road_to_mill",
    rank: "Porcelana",
    requirements: ["ir de dia", "no entrar al bosque", "marcar barro con ramas visibles"],
    reward: { moneyCopper: 70, items: [], other: "" },
    mgReward: 3,
    riskLevel: "low",
    postedTime: "08:30",
    expiresDay: 11,
    expiresTime: "12:00",
    proofRequired: "descripcion de dos puntos marcados o confirmacion de Tessa",
    consequencesIfIgnored: ["los viajes al molino siguen lentos"],
    relatedEventIds: ["event_d10_supply_delay_mud"],
    flags: { missionType: "road_support", noCombatRequired: true },
  }),
  mission("mission_d10_mill_delay_report_oren", {
    templateId: "template_report_delivery",
    title: "Reporte de retraso del Molino de Oren",
    description:
      "Hablar con Oren en el molino y traer un reporte simple sobre harina, grano y retrasos de ruta.",
    clientNpcId: "npc_oren",
    locationId: "loc_hoshimori_mill",
    rank: "Porcelana",
    requirements: ["llegar al molino por ruta segura", "hacer preguntas breves", "volver con reporte claro"],
    reward: { moneyCopper: 65, items: [], other: "" },
    mgReward: 2,
    riskLevel: "low",
    postedTime: "09:30",
    expiresDay: 11,
    expiresTime: "18:00",
    proofRequired: "reporte de Oren o detalle verificable del molino",
    consequencesIfIgnored: ["el gremio seguira sin datos frescos del molino"],
    relatedEventIds: ["event_d10_supply_delay_mud"],
    flags: { missionType: "report", noCombatRequired: true },
  }),
  mission("mission_d10_mill_road_tracks_check", {
    templateId: "template_tracks_inspection",
    title: "Revisar huellas cerca del Camino del Molino",
    description:
      "Observar desde el camino unas huellas atribuidas a lobo y volver con un reporte; no se pide cazar ni perseguir.",
    clientNpcId: "npc_kael",
    locationId: "loc_hoshimori_road_to_mill",
    rank: "Cobre",
    requirements: ["ir con luz de dia", "mantenerse en el camino", "no perseguir animales", "retirarse si hay peligro"],
    reward: { moneyCopper: 120, items: [], other: "" },
    mgReward: 5,
    riskLevel: "low",
    postedTime: "10:00",
    expiresDay: 11,
    expiresTime: "16:00",
    proofRequired: "descripcion de huellas, direccion y distancia aproximada",
    consequencesIfIgnored: ["Kael enviara una patrulla cuando haya disponibilidad"],
    flags: {
      missionType: "inspection",
      noCombatRequired: true,
      enemyTemplateIds: ["enemy_lobo_borde"],
      rumorIds: ["rumor_g5_hoshimori_wolf_tracks_mill_road"],
    },
  }),
  mission("mission_d10_temple_bandage_delivery", {
    templateId: "template_bandage_delivery",
    title: "Vendajes para el templo",
    description:
      "Retirar un paquete autorizado de vendajes basicos y llevarlo al Templo de la Llama Serena.",
    clientNpcId: "npc_narek",
    locationId: "loc_hoshimori_temple_serene_flame",
    rank: "Porcelana",
    requirements: ["recoger el paquete indicado", "no usar suministros", "entregarlo a Narek o Maelis"],
    reward: { moneyCopper: 45, items: [], other: "Agradecimiento del templo." },
    mgReward: 2,
    riskLevel: "none",
    postedTime: "10:15",
    expiresDay: 11,
    expiresTime: "12:00",
    proofRequired: "confirmacion de Narek o Maelis",
    consequencesIfIgnored: ["el templo espera otra entrega menor"],
    flags: {
      missionType: "supply_delivery",
      noCombatRequired: true,
      requiredItemIds: ["item_vendaje_limpio"],
      relatedShopIds: ["shop_liora_herbs", "shop_temple_serene_flame_services"],
    },
  }),
  mission("mission_d10_forest_edge_visual_report", {
    templateId: "template_forest_edge_report",
    title: "Informe visual del borde del Bosque de los Susurros",
    description:
      "Mirar el borde del bosque desde una distancia prudente y volver con un informe de camino, barro y ruidos. No entrar al bosque.",
    clientNpcId: "npc_garrick_thorne",
    locationId: "loc_hoshimori_forest_whispers_edge",
    rank: "Cobre",
    requirements: ["ir con luz de dia", "no entrar a zona media", "volver si hay niebla o peligro"],
    reward: { moneyCopper: 140, items: [], other: "" },
    mgReward: 6,
    riskLevel: "low",
    postedTime: "10:45",
    expiresDay: 12,
    expiresTime: "12:00",
    proofRequired: "informe de borde: barro, visibilidad, sonidos y rastros obvios",
    consequencesIfIgnored: ["el gremio mantendra advertencia general sobre el borde del bosque"],
    flags: {
      missionType: "visual_report",
      noCombatRequired: true,
      rumorIds: [
        "rumor_g5_hoshimori_whispering_forest_lights",
        "rumor_g5_hoshimori_forest_uncomfortable_after_rain",
      ],
    },
  }),
  mission("mission_d10_mill_rats_scout", {
    templateId: "template_rats_scout",
    title: "Confirmar ratas grandes cerca del molino",
    description:
      "Revisar senales en el molino y confirmar si hay ratas grandes; no se exige combate ni persecucion.",
    clientNpcId: "npc_oren",
    locationId: "loc_hoshimori_mill",
    rank: "Cobre",
    requirements: ["no entrar a huecos estrechos", "no combatir sin ventaja", "reportar cantidad aproximada"],
    reward: { moneyCopper: 150, items: [], other: "" },
    mgReward: 6,
    riskLevel: "medium",
    postedTime: "11:00",
    expiresDay: 12,
    expiresTime: "18:00",
    proofRequired: "reporte de senales, danos o avistamiento desde lugar seguro",
    consequencesIfIgnored: ["Oren mantendra cerrada una zona secundaria del molino"],
    flags: {
      missionType: "creature_scout",
      combatOptional: true,
      noCombatRequired: true,
      enemyTemplateIds: ["enemy_rata_gigante"],
    },
  }),
  mission("mission_d10_borin_repair_parts", {
    templateId: "template_smithy_errand",
    title: "Traslado menor para Borin",
    description:
      "Llevar clavos y una pieza comun desde la herreria de Borin hasta el gremio para una reparacion menor.",
    clientNpcId: "npc_borin",
    locationId: "loc_hoshimori_borin_smithy",
    rank: "Porcelana",
    requirements: ["recoger piezas comunes", "mantenerlas secas", "entregar en el gremio"],
    reward: { moneyCopper: 55, items: [], other: "" },
    mgReward: 2,
    riskLevel: "none",
    postedTime: "11:10",
    expiresDay: 11,
    expiresTime: "17:00",
    proofRequired: "confirmacion de entrega en gremio o recibo de Mara",
    consequencesIfIgnored: ["Borin enviara el paquete con otro recadero"],
    flags: {
      missionType: "smithy_errand",
      noCombatRequired: true,
      relatedItemIds: ["item_clavos_comunes", "item_herramienta_comun"],
      relatedShopIds: ["shop_borin_smithy"],
    },
  }),
  mission("mission_d10_celia_guard_notice", {
    templateId: "template_civic_notice",
    title: "Aviso de registros para la guardia",
    description:
      "Llevar un aviso administrativo de Celia al puesto de guardia local y volver con una respuesta breve.",
    clientNpcId: "npc_celia_dorn",
    locationId: "loc_hoshimori_council_records",
    rank: "Porcelana",
    requirements: ["no alterar el aviso", "entregarlo a Kael o Rulan", "traer respuesta breve"],
    reward: { moneyCopper: 50, items: [], other: "" },
    mgReward: 2,
    riskLevel: "none",
    postedTime: "11:20",
    expiresDay: 11,
    expiresTime: "12:00",
    proofRequired: "respuesta verbal de Kael/Rulan o marca de recibido",
    consequencesIfIgnored: ["Celia lo reenviara por via interna mas tarde"],
    flags: { missionType: "civic_errand", noCombatRequired: true },
  }),
];

async function assertReferencesExist() {
  const factionIds = unique(missions.map((entry) => entry.sourceFactionId));
  const npcIds = unique(missions.map((entry) => entry.clientNpcId));
  const locationIds = unique(missions.map((entry) => entry.locationId));
  const rewardItemIds = unique(missions.flatMap((entry) => entry.reward?.items || []));
  const flagItemIds = unique(
    missions.flatMap((entry) => [...(entry.flags?.requiredItemIds || []), ...(entry.flags?.relatedItemIds || [])])
  );
  const enemyIds = unique(missions.flatMap((entry) => entry.flags?.enemyTemplateIds || []));
  const stockItemIds = unique([...rewardItemIds, ...flagItemIds]);

  const [factions, npcs, locations, items, enemies, stocks] = await Promise.all([
    Faction.find({ factionId: { $in: factionIds } }).select("factionId").lean(),
    Npc.find({ npcId: { $in: npcIds } }).select("npcId").lean(),
    Location.find({ locationId: { $in: locationIds } }).select("locationId").lean(),
    Item.find({ itemId: { $in: stockItemIds } }).select("itemId").lean(),
    EnemyTemplate.find({ enemyId: { $in: enemyIds } }).select("enemyId").lean(),
    ShopStock.find({ itemId: { $in: stockItemIds } }).select("itemId").lean(),
  ]);

  const existingFactionIds = new Set(factions.map((entry) => entry.factionId));
  const existingNpcIds = new Set(npcs.map((entry) => entry.npcId));
  const existingLocationIds = new Set(locations.map((entry) => entry.locationId));
  const existingItemIds = new Set(items.map((entry) => entry.itemId));
  const existingEnemyIds = new Set(enemies.map((entry) => entry.enemyId));
  const stockedItemIds = new Set(stocks.map((entry) => entry.itemId));

  const missing = [
    factionIds.filter((id) => !existingFactionIds.has(id)).length
      ? `factions: ${factionIds.filter((id) => !existingFactionIds.has(id)).join(", ")}`
      : "",
    npcIds.filter((id) => !existingNpcIds.has(id)).length
      ? `npcs: ${npcIds.filter((id) => !existingNpcIds.has(id)).join(", ")}`
      : "",
    locationIds.filter((id) => !existingLocationIds.has(id)).length
      ? `locations: ${locationIds.filter((id) => !existingLocationIds.has(id)).join(", ")}`
      : "",
    stockItemIds.filter((id) => !existingItemIds.has(id)).length
      ? `items: ${stockItemIds.filter((id) => !existingItemIds.has(id)).join(", ")}`
      : "",
    enemyIds.filter((id) => !existingEnemyIds.has(id)).length
      ? `enemyTemplates: ${enemyIds.filter((id) => !existingEnemyIds.has(id)).join(", ")}`
      : "",
    stockItemIds.filter((id) => !stockedItemIds.has(id)).length
      ? `stock item refs without stock: ${stockItemIds.filter((id) => !stockedItemIds.has(id)).join(", ")}`
      : "",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing references required for G7 mission seed: ${missing.join("; ")}`);
  }
}

async function seedHoshimoriMissions() {
  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    throw new Error("MONGODB_URI is required to seed Hoshimori missions.");
  }

  await assertReferencesExist();

  const skipped = [];
  const upsertedOrUpdated = [];

  for (const entry of missions) {
    const existing = await Mission.findOne({ missionId: entry.missionId }).lean();

    if (existing && ["accepted", "completed"].includes(existing.status)) {
      skipped.push({ missionId: entry.missionId, status: existing.status });
      continue;
    }

    await Mission.updateOne(
      { missionId: entry.missionId },
      {
        $set: entry,
        $setOnInsert: {
          acceptedByCharacterId: "",
          acceptedDay: null,
          completedDay: null,
        },
      },
      { upsert: true }
    );

    upsertedOrUpdated.push(entry.missionId);
  }

  const [availableCount, totalG7Count] = await Promise.all([
    Mission.countDocuments({ missionId: { $in: missions.map((entry) => entry.missionId) }, status: "available" }),
    Mission.countDocuments({ "flags.source": SOURCE }),
  ]);

  console.log("Hoshimori missions seed completed.");
  console.log(`Expected G7 missions in seed: ${missions.length}`);
  console.log(`Updated/upserted missions: ${upsertedOrUpdated.length}`);
  console.log(`Skipped accepted/completed missions: ${skipped.length}`);
  console.log(`Available expected missions now: ${availableCount}`);
  console.log(`MongoDB missions with G7 marker: ${totalG7Count}`);

  if (skipped.length > 0) {
    console.table(skipped);
  }

  await mongoose.disconnect();
}

if (require.main === module) {
  seedHoshimoriMissions().catch(async (error) => {
    console.error("Error seeding Hoshimori missions:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = {
  MARKER_TAGS,
  SOURCE,
  missions,
  seedHoshimoriMissions,
};
