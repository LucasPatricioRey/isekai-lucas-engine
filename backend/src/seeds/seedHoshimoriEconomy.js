require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const Faction = require("../models/Faction");
const Item = require("../models/Item");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const Shop = require("../models/Shop");
const ShopStock = require("../models/ShopStock");

const SOURCE = "g6_hoshimori_economy_seed";
const MARKER_TAGS = ["g6", "hoshimori", "economy"];
const LAST_RESTOCKED_DAY = 10;

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function tags(extra = []) {
  return unique([...MARKER_TAGS, SOURCE, ...extra]);
}

function open(openAt, closeAt, dayType = "normal") {
  return { dayType, open: openAt, close: closeAt };
}

function item(itemId, data) {
  return {
    itemId,
    name: data.name,
    type: data.type,
    subtype: data.subtype || "",
    description: data.description || "",
    stackable: data.stackable ?? true,
    basePriceCopper: data.basePriceCopper ?? 0,
    satietyBonus: data.satietyBonus ?? 0,
    energyBonus: data.energyBonus ?? 0,
    mpBonus: 0,
    durability: data.durability || { max: null, defaultCurrent: null },
    rarity: data.rarity || "common",
    legalStatus: data.legalStatus || "legal",
    tags: tags(data.tags || []),
  };
}

function shop(shopId, data) {
  return {
    shopId,
    name: data.name,
    locationId: data.locationId,
    ownerNpcId: data.ownerNpcId || "",
    type: data.type || "other",
    factionId: data.factionId || "",
    openHours: data.openHours || [],
    status: data.status || "operational",
    pricingProfile: data.pricingProfile || { priceMultiplier: 1, notes: "Precios rurales base." },
    acceptsDebt: data.acceptsDebt ?? false,
    services: {
      buy: data.services?.buy ?? true,
      sell: data.services?.sell ?? true,
      repair: data.services?.repair ?? false,
      lodging: data.services?.lodging ?? false,
      food: data.services?.food ?? false,
      loans: data.services?.loans ?? false,
    },
    tags: tags(data.tags || []),
  };
}

function stock(shopId, itemId, quantity, data = {}) {
  return {
    stockId: data.stockId || `stock_${shopId.replace(/^shop_/, "")}_${itemId.replace(/^item_/, "")}`,
    shopId,
    itemId,
    quantity,
    reservedQuantity: data.reservedQuantity ?? 0,
    basePriceCopper: data.basePriceCopper,
    currentPriceCopper: data.currentPriceCopper ?? data.basePriceCopper,
    quality: data.quality || "normal",
    restockRule: data.restockRule || { type: "manual", amount: 0, condition: "" },
    scarcityFlags: data.scarcityFlags || [],
    lastRestockedDay: data.lastRestockedDay ?? LAST_RESTOCKED_DAY,
    tags: tags(data.tags || []),
  };
}

const items = [
  item("item_racion_pequena", {
    name: "Racion pequena",
    type: "food",
    subtype: "ration",
    description: "Racion simple de viaje. +15 saciedad, +1 energia.",
    basePriceCopper: 20,
    satietyBonus: 15,
    energyBonus: 1,
    tags: ["food", "ration", "travel"],
  }),
  item("item_racion_normal", {
    name: "Racion normal",
    type: "food",
    subtype: "ration",
    description: "Racion normal de viaje. +35 saciedad, +2 energia.",
    basePriceCopper: 40,
    satietyBonus: 35,
    energyBonus: 2,
    tags: ["food", "ration", "travel"],
  }),
  item("item_comida_normal", {
    name: "Comida normal",
    type: "food",
    subtype: "meal",
    description: "Comida normal de posada. +30 saciedad, +5 energia.",
    stackable: false,
    basePriceCopper: 35,
    satietyBonus: 30,
    energyBonus: 5,
    tags: ["food", "meal", "inn"],
  }),
  item("item_pan_simple", {
    name: "Pan simple",
    type: "food",
    subtype: "bread",
    description: "Pan comun de panaderia. +10 saciedad.",
    basePriceCopper: 8,
    satietyBonus: 10,
    tags: ["food", "bread", "bakery"],
  }),
  item("item_pan_viaje", {
    name: "Pan de viaje",
    type: "food",
    subtype: "travel_bread",
    description: "Pan mas seco y durable para camino. +18 saciedad.",
    basePriceCopper: 15,
    satietyBonus: 18,
    tags: ["food", "bread", "travel"],
  }),
  item("item_sopa_simple", {
    name: "Sopa simple",
    type: "food",
    subtype: "soup",
    description: "Sopa caliente y simple de posada. +22 saciedad, +4 energia.",
    stackable: false,
    basePriceCopper: 22,
    satietyBonus: 22,
    energyBonus: 4,
    tags: ["food", "soup", "inn"],
  }),
  item("item_fruta_estacion", {
    name: "Fruta de estacion",
    type: "food",
    subtype: "fruit",
    description: "Fruta local comun. +8 saciedad, +1 energia.",
    basePriceCopper: 6,
    satietyBonus: 8,
    energyBonus: 1,
    tags: ["food", "fruit", "market"],
  }),
  item("item_vendaje_limpio", {
    name: "Vendaje limpio",
    type: "medicine",
    subtype: "bandage",
    description: "Vendaje simple para primeros auxilios.",
    basePriceCopper: 10,
    tags: ["medicine", "bandage"],
  }),
  item("item_kit_vendajes_basico", {
    name: "Kit de vendajes basico",
    type: "medicine",
    subtype: "bandage_kit",
    description: "Paquete basico de vendajes limpios y cierre simple.",
    basePriceCopper: 35,
    tags: ["medicine", "bandage", "kit"],
  }),
  item("item_unguento_simple", {
    name: "Unguento simple",
    type: "medicine",
    subtype: "ointment",
    description: "Unguento comun para raspaduras y piel irritada.",
    basePriceCopper: 45,
    tags: ["medicine", "ointment", "herbs"],
  }),
  item("item_infusion_calmante", {
    name: "Infusion calmante",
    type: "medicine",
    subtype: "infusion",
    description: "Infusion herbal ligera para descanso y malestar menor.",
    basePriceCopper: 18,
    energyBonus: 1,
    tags: ["medicine", "herbs", "infusion"],
  }),
  item("item_cuerda_simple", {
    name: "Cuerda simple",
    type: "tool",
    subtype: "rope",
    description: "Cuerda comun para cargas, amarres y viajes cortos.",
    basePriceCopper: 25,
    tags: ["tool", "travel", "rope"],
  }),
  item("item_pedernal_basico", {
    name: "Pedernal basico",
    type: "tool",
    subtype: "firestarter",
    description: "Pedernal comun para encender fuego con paciencia.",
    stackable: false,
    basePriceCopper: 30,
    durability: { max: 40, defaultCurrent: 40 },
    tags: ["tool", "camp", "fire"],
  }),
  item("item_saco_tela", {
    name: "Saco de tela",
    type: "tool",
    subtype: "bag",
    description: "Saco simple para cargar objetos y alimentos secos.",
    stackable: false,
    basePriceCopper: 12,
    durability: { max: 20, defaultCurrent: 20 },
    tags: ["tool", "bag", "cloth"],
  }),
  item("item_aguja_hilo", {
    name: "Aguja e hilo",
    type: "tool",
    subtype: "sewing_kit",
    description: "Set pequeno de aguja e hilo para remiendos simples.",
    basePriceCopper: 8,
    tags: ["tool", "tailor", "repair"],
  }),
  item("item_clavos_comunes", {
    name: "Clavos comunes",
    type: "material",
    subtype: "nails",
    description: "Clavos comunes de herreria para arreglos simples.",
    basePriceCopper: 10,
    tags: ["material", "smithy", "repair"],
  }),
  item("item_herramienta_comun", {
    name: "Herramienta comun",
    type: "tool",
    subtype: "basic_tool",
    description: "Herramienta comun para reparaciones sencillas.",
    stackable: false,
    basePriceCopper: 80,
    durability: { max: 60, defaultCurrent: 60 },
    tags: ["tool", "repair", "smithy"],
  }),
  item("item_carbon_herreria", {
    name: "Carbon de herreria",
    type: "material",
    subtype: "coal",
    description: "Carbon comun usado en trabajos de herreria.",
    basePriceCopper: 5,
    tags: ["material", "coal", "smithy"],
  }),
  item("item_cuero_simple", {
    name: "Cuero simple",
    type: "material",
    subtype: "leather",
    description: "Cuero simple para remiendos, correas y piezas menores.",
    basePriceCopper: 40,
    tags: ["material", "leather", "tannery"],
  }),
  item("item_piel_curtida", {
    name: "Piel curtida",
    type: "material",
    subtype: "treated_hide",
    description: "Piel curtida comun para trabajo artesanal resistente.",
    basePriceCopper: 70,
    tags: ["material", "hide", "tannery"],
  }),
  item("item_ropa_comun_usada", {
    name: "Ropa comun usada",
    type: "armor",
    subtype: "common_clothes",
    description: "Ropa usada en estado aceptable. No protege de golpes serios.",
    stackable: false,
    basePriceCopper: 50,
    durability: { max: 35, defaultCurrent: 28 },
    tags: ["clothing", "used", "tailor"],
  }),
  item("item_capa_simple", {
    name: "Capa simple",
    type: "armor",
    subtype: "cloak",
    description: "Capa sencilla para lluvia ligera y viento.",
    stackable: false,
    basePriceCopper: 70,
    durability: { max: 40, defaultCurrent: 40 },
    tags: ["clothing", "cloak", "travel"],
  }),
  item("item_botas_simples_usadas", {
    name: "Botas simples usadas",
    type: "armor",
    subtype: "boots",
    description: "Botas usadas pero funcionales para caminar por barro ligero.",
    stackable: false,
    basePriceCopper: 80,
    durability: { max: 45, defaultCurrent: 30 },
    tags: ["clothing", "boots", "used", "travel"],
  }),
  item("item_mochila_basica", {
    name: "Mochila basica",
    type: "tool",
    subtype: "backpack",
    description: "Mochila sencilla para viaje corto y carga ligera.",
    stackable: false,
    basePriceCopper: 120,
    durability: { max: 50, defaultCurrent: 50 },
    tags: ["tool", "backpack", "travel"],
  }),
  item("item_cantimplora", {
    name: "Cantimplora",
    type: "tool",
    subtype: "canteen",
    description: "Cantimplora comun para agua durante viajes cortos.",
    stackable: false,
    basePriceCopper: 60,
    durability: { max: 45, defaultCurrent: 45 },
    tags: ["tool", "canteen", "travel"],
  }),
  item("item_daga_simple", {
    name: "Daga simple",
    type: "weapon",
    subtype: "dagger",
    description: "Daga simple, funcional, comun.",
    stackable: false,
    basePriceCopper: 300,
    durability: { max: 55, defaultCurrent: 55 },
    legalStatus: "restricted",
    tags: ["weapon", "dagger"],
  }),
  item("item_cuchillo_trabajo", {
    name: "Cuchillo de trabajo",
    type: "weapon",
    subtype: "work_knife",
    description: "Cuchillo practico para tareas de oficio; sirve en defensa desesperada.",
    stackable: false,
    basePriceCopper: 120,
    durability: { max: 45, defaultCurrent: 45 },
    tags: ["weapon", "tool", "knife"],
  }),
  item("item_baston_simple", {
    name: "Baston simple",
    type: "weapon",
    subtype: "staff",
    description: "Baston de madera simple, util para caminar y mantener distancia.",
    stackable: false,
    basePriceCopper: 30,
    durability: { max: 35, defaultCurrent: 35 },
    tags: ["weapon", "staff", "wood"],
  }),
  item("item_garrote_reforzado", {
    name: "Garrote reforzado",
    type: "weapon",
    subtype: "club",
    description: "Garrote comun reforzado con metal pobre.",
    stackable: false,
    basePriceCopper: 55,
    durability: { max: 40, defaultCurrent: 40 },
    legalStatus: "restricted",
    tags: ["weapon", "club", "simple"],
  }),
  item("item_espada_usada", {
    name: "Espada usada",
    type: "weapon",
    subtype: "sword",
    description: "Espada usada con marcas de reparacion; funcional pero no fina.",
    stackable: false,
    basePriceCopper: 650,
    durability: { max: 65, defaultCurrent: 42 },
    legalStatus: "restricted",
    tags: ["weapon", "sword", "used"],
  }),
  item("item_arco_simple", {
    name: "Arco simple",
    type: "weapon",
    subtype: "bow",
    description: "Arco comun de caza sencilla, sin trabajo fino.",
    stackable: false,
    basePriceCopper: 450,
    durability: { max: 55, defaultCurrent: 55 },
    legalStatus: "restricted",
    tags: ["weapon", "bow", "hunting"],
  }),
  item("item_servicio_habitacion_comun", {
    name: "Servicio de habitacion comun",
    type: "misc",
    subtype: "lodging_service",
    description: "Uso de habitacion comun de posada por una noche, sujeto a disponibilidad.",
    stackable: false,
    basePriceCopper: 70,
    tags: ["service", "lodging", "inn"],
  }),
  item("item_servicio_registro_gremio", {
    name: "Servicio de registro del gremio",
    type: "document",
    subtype: "guild_service",
    description: "Gestion basica de registro, consulta o copia simple del gremio.",
    stackable: false,
    basePriceCopper: 10,
    tags: ["service", "guild", "record"],
  }),
  item("item_servicio_entrenamiento_basico", {
    name: "Servicio de entrenamiento basico",
    type: "misc",
    subtype: "training_service",
    description: "Bloque corto de entrenamiento basico supervisado en el gremio.",
    stackable: false,
    basePriceCopper: 25,
    tags: ["service", "guild", "training"],
  }),
  item("item_servicio_primeros_auxilios_templo", {
    name: "Servicio de primeros auxilios del templo",
    type: "misc",
    subtype: "temple_service",
    description: "Atencion menor de primeros auxilios en el templo.",
    stackable: false,
    basePriceCopper: 20,
    tags: ["service", "temple", "first_aid"],
  }),
  item("item_servicio_reposo_templo", {
    name: "Servicio de reposo del templo",
    type: "misc",
    subtype: "temple_service",
    description: "Reposo breve y cuidado tranquilo dentro del templo.",
    stackable: false,
    basePriceCopper: 15,
    tags: ["service", "temple", "rest"],
  }),
];

const shops = [
  shop("shop_pavo_food_stall", {
    name: "Puesto de comida de Pavo",
    locationId: "loc_hoshimori_market",
    ownerNpcId: "npc_pavo",
    type: "food",
    openHours: [open("06:00", "18:00")],
    pricingProfile: { priceMultiplier: 1, notes: "Precios rurales base para raciones y viaje." },
    services: { buy: true, sell: true, food: true },
    tags: ["food", "market", "rations", "travel_supplies"],
  }),
  shop("shop_grulla_azul_inn", {
    name: "Servicios de La Grulla Azul",
    locationId: "loc_hoshimori_grulla_azul",
    ownerNpcId: "npc_roberto_valen",
    type: "inn",
    factionId: "faction_grulla_azul",
    openHours: [open("05:30", "22:30")],
    pricingProfile: { priceMultiplier: 1, notes: "Precios normales de posada rural." },
    acceptsDebt: true,
    services: { buy: true, sell: false, lodging: true, food: true },
    tags: ["inn", "food", "lodging", "work"],
  }),
  shop("shop_borin_smithy", {
    name: "Herreria de Borin",
    locationId: "loc_hoshimori_borin_smithy",
    ownerNpcId: "npc_borin",
    type: "smithy",
    openHours: [open("07:00", "18:00")],
    pricingProfile: { priceMultiplier: 1.05, notes: "Herramientas y armas simples con stock limitado." },
    services: { buy: true, sell: true, repair: true },
    tags: ["smithy", "tools", "weapons", "repair"],
  }),
  shop("shop_liora_herbs", {
    name: "Puesto herbal de Liora",
    locationId: "loc_hoshimori_liora_stall",
    ownerNpcId: "npc_liora",
    type: "herbalist",
    openHours: [open("07:00", "17:30")],
    pricingProfile: { priceMultiplier: 1, notes: "Hierbas y medicina basica sin componentes raros." },
    services: { buy: true, sell: true },
    tags: ["herbalist", "medicine", "market"],
  }),
  shop("shop_sella_workshop", {
    name: "Taller de Sella",
    locationId: "loc_hoshimori_sella_workshop",
    ownerNpcId: "npc_sella",
    type: "tailor",
    openHours: [open("07:00", "18:00")],
    pricingProfile: { priceMultiplier: 1, notes: "Ropa usada, remiendos y tela comun." },
    services: { buy: true, sell: true, repair: true },
    tags: ["tailor", "clothing", "repair", "travel_supplies"],
  }),
  shop("shop_hilda_bakery", {
    name: "Panaderia de Hilda",
    locationId: "loc_hoshimori_bakery",
    ownerNpcId: "npc_hilda_fen",
    type: "food",
    openHours: [open("05:30", "16:00")],
    pricingProfile: { priceMultiplier: 1, notes: "Pan local barato; se agota durante la tarde." },
    services: { buy: true, sell: true, food: true },
    tags: ["bakery", "food", "bread"],
  }),
  shop("shop_merek_tannery", {
    name: "Curtiduria de Merek",
    locationId: "loc_hoshimori_tannery",
    ownerNpcId: "npc_merek_sol",
    type: "other",
    openHours: [open("07:00", "17:00")],
    pricingProfile: { priceMultiplier: 1, notes: "Materiales de cuero comunes y trabajo practico." },
    services: { buy: true, sell: true, repair: true },
    tags: ["tannery", "leather", "materials"],
  }),
  shop("shop_hoshimori_guild_services", {
    name: "Servicios del gremio de Hoshimori",
    locationId: "loc_hoshimori_guild",
    ownerNpcId: "npc_garrick_thorne",
    type: "guild",
    factionId: "faction_hoshimori_guild",
    openHours: [open("07:00", "18:00")],
    pricingProfile: { priceMultiplier: 1, notes: "Servicios administrativos y entrenamiento basico." },
    services: { buy: false, sell: false },
    tags: ["guild", "services", "training", "records"],
  }),
  shop("shop_temple_serene_flame_services", {
    name: "Servicios del Templo de la Llama Serena",
    locationId: "loc_hoshimori_temple_serene_flame",
    ownerNpcId: "npc_narek",
    type: "other",
    openHours: [open("06:00", "20:00")],
    pricingProfile: { priceMultiplier: 0.9, notes: "Ayuda menor y cuidados simples; no vende objetos raros." },
    acceptsDebt: true,
    services: { buy: true, sell: false },
    tags: ["temple", "first_aid", "rest", "medicine"],
  }),
];

const stocks = [
  stock("shop_pavo_food_stall", "item_racion_pequena", 12, {
    stockId: "stock_pavo_racion_pequena",
    basePriceCopper: 20,
    restockRule: { type: "daily", amount: 6, condition: "si las rutas funcionan" },
    tags: ["food", "ration"],
  }),
  stock("shop_pavo_food_stall", "item_racion_normal", 8, {
    stockId: "stock_pavo_racion_normal",
    basePriceCopper: 40,
    restockRule: { type: "daily", amount: 4, condition: "si las rutas funcionan" },
    tags: ["food", "ration"],
  }),
  stock("shop_pavo_food_stall", "item_fruta_estacion", 10, {
    basePriceCopper: 6,
    restockRule: { type: "daily", amount: 8, condition: "segun llegada de mercado" },
    scarcityFlags: ["supply_delay_active"],
    tags: ["food", "fruit"],
  }),
  stock("shop_pavo_food_stall", "item_pan_viaje", 5, {
    basePriceCopper: 15,
    restockRule: { type: "daily", amount: 4, condition: "si Hilda tiene pan disponible" },
    scarcityFlags: ["supply_delay_active"],
    tags: ["food", "travel"],
  }),
  stock("shop_pavo_food_stall", "item_pedernal_basico", 2, {
    basePriceCopper: 30,
    restockRule: { type: "weekly", amount: 1, condition: "reposicion lenta de mercaderia" },
    tags: ["tool", "travel"],
  }),
  stock("shop_grulla_azul_inn", "item_comida_normal", 20, {
    stockId: "stock_grulla_comida_normal",
    basePriceCopper: 35,
    restockRule: { type: "daily", amount: 20, condition: "si hay suministros" },
    scarcityFlags: ["supply_delay_active"],
    tags: ["food", "inn"],
  }),
  stock("shop_grulla_azul_inn", "item_sopa_simple", 12, {
    basePriceCopper: 22,
    restockRule: { type: "daily", amount: 12, condition: "si cocina tiene suministros" },
    scarcityFlags: ["supply_delay_active"],
    tags: ["food", "inn", "soup"],
  }),
  stock("shop_grulla_azul_inn", "item_servicio_habitacion_comun", 2, {
    basePriceCopper: 70,
    restockRule: { type: "manual", amount: 0, condition: "depende de ocupacion" },
    tags: ["service", "lodging", "inn"],
  }),
  stock("shop_borin_smithy", "item_clavos_comunes", 40, {
    basePriceCopper: 10,
    restockRule: { type: "daily", amount: 10, condition: "si hay carbon y metal comun" },
    tags: ["material", "repair"],
  }),
  stock("shop_borin_smithy", "item_herramienta_comun", 4, {
    basePriceCopper: 80,
    restockRule: { type: "weekly", amount: 2, condition: "fabricacion local" },
    tags: ["tool", "repair"],
  }),
  stock("shop_borin_smithy", "item_carbon_herreria", 30, {
    basePriceCopper: 5,
    restockRule: { type: "weekly", amount: 20, condition: "entrega de carbon" },
    scarcityFlags: ["supply_delay_active"],
    tags: ["material", "coal"],
  }),
  stock("shop_borin_smithy", "item_cuchillo_trabajo", 3, {
    basePriceCopper: 120,
    restockRule: { type: "weekly", amount: 1, condition: "fabricacion local" },
    tags: ["weapon", "tool"],
  }),
  stock("shop_borin_smithy", "item_daga_simple", 2, {
    basePriceCopper: 300,
    restockRule: { type: "weekly", amount: 1, condition: "fabricacion local limitada" },
    tags: ["weapon", "dagger"],
  }),
  stock("shop_borin_smithy", "item_baston_simple", 3, {
    basePriceCopper: 30,
    restockRule: { type: "weekly", amount: 2, condition: "madera comun disponible" },
    tags: ["weapon", "staff"],
  }),
  stock("shop_borin_smithy", "item_garrote_reforzado", 2, {
    basePriceCopper: 55,
    restockRule: { type: "weekly", amount: 1, condition: "trabajo simple de taller" },
    tags: ["weapon", "simple"],
  }),
  stock("shop_borin_smithy", "item_espada_usada", 1, {
    basePriceCopper: 650,
    quality: "poor",
    restockRule: { type: "manual", amount: 0, condition: "stock ocasional" },
    tags: ["weapon", "used", "low_stock"],
  }),
  stock("shop_borin_smithy", "item_arco_simple", 1, {
    basePriceCopper: 450,
    restockRule: { type: "manual", amount: 0, condition: "stock ocasional de caza" },
    tags: ["weapon", "bow", "low_stock"],
  }),
  stock("shop_liora_herbs", "item_vendaje_limpio", 10, {
    basePriceCopper: 10,
    restockRule: { type: "daily", amount: 4, condition: "si hay tela limpia" },
    tags: ["medicine", "bandage"],
  }),
  stock("shop_liora_herbs", "item_kit_vendajes_basico", 4, {
    basePriceCopper: 35,
    restockRule: { type: "weekly", amount: 2, condition: "preparacion manual" },
    tags: ["medicine", "bandage", "kit"],
  }),
  stock("shop_liora_herbs", "item_unguento_simple", 5, {
    basePriceCopper: 45,
    restockRule: { type: "weekly", amount: 3, condition: "hierbas locales disponibles" },
    tags: ["medicine", "ointment"],
  }),
  stock("shop_liora_herbs", "item_infusion_calmante", 8, {
    basePriceCopper: 18,
    restockRule: { type: "daily", amount: 4, condition: "mezcla herbal comun" },
    tags: ["medicine", "infusion"],
  }),
  stock("shop_sella_workshop", "item_ropa_comun_usada", 4, {
    basePriceCopper: 50,
    quality: "poor",
    restockRule: { type: "weekly", amount: 2, condition: "prendas usadas disponibles" },
    tags: ["clothing", "used"],
  }),
  stock("shop_sella_workshop", "item_capa_simple", 3, {
    basePriceCopper: 70,
    restockRule: { type: "weekly", amount: 2, condition: "tela disponible" },
    tags: ["clothing", "cloak"],
  }),
  stock("shop_sella_workshop", "item_aguja_hilo", 10, {
    basePriceCopper: 8,
    restockRule: { type: "weekly", amount: 5, condition: "suministro menor" },
    tags: ["tool", "tailor"],
  }),
  stock("shop_sella_workshop", "item_saco_tela", 8, {
    basePriceCopper: 12,
    restockRule: { type: "weekly", amount: 4, condition: "tela comun disponible" },
    tags: ["tool", "bag"],
  }),
  stock("shop_sella_workshop", "item_cuerda_simple", 5, {
    basePriceCopper: 25,
    restockRule: { type: "weekly", amount: 3, condition: "fibras y cordel disponibles" },
    tags: ["tool", "rope"],
  }),
  stock("shop_sella_workshop", "item_botas_simples_usadas", 2, {
    basePriceCopper: 80,
    quality: "poor",
    restockRule: { type: "manual", amount: 0, condition: "stock ocasional usado" },
    tags: ["clothing", "boots", "used"],
  }),
  stock("shop_sella_workshop", "item_mochila_basica", 2, {
    basePriceCopper: 120,
    restockRule: { type: "weekly", amount: 1, condition: "trabajo lento de taller" },
    tags: ["tool", "backpack"],
  }),
  stock("shop_sella_workshop", "item_cantimplora", 2, {
    basePriceCopper: 60,
    restockRule: { type: "weekly", amount: 1, condition: "mercaderia de viaje menor" },
    tags: ["tool", "canteen"],
  }),
  stock("shop_hilda_bakery", "item_pan_simple", 20, {
    basePriceCopper: 8,
    restockRule: { type: "daily", amount: 20, condition: "horneado matinal" },
    tags: ["food", "bread"],
  }),
  stock("shop_hilda_bakery", "item_pan_viaje", 10, {
    basePriceCopper: 15,
    restockRule: { type: "daily", amount: 8, condition: "horneado matinal" },
    tags: ["food", "bread", "travel"],
  }),
  stock("shop_merek_tannery", "item_cuero_simple", 8, {
    basePriceCopper: 40,
    restockRule: { type: "weekly", amount: 4, condition: "procesamiento de pieles" },
    tags: ["material", "leather"],
  }),
  stock("shop_merek_tannery", "item_piel_curtida", 4, {
    basePriceCopper: 70,
    restockRule: { type: "weekly", amount: 2, condition: "curtido lento" },
    tags: ["material", "hide"],
  }),
  stock("shop_hoshimori_guild_services", "item_servicio_registro_gremio", 5, {
    basePriceCopper: 10,
    restockRule: { type: "daily", amount: 5, condition: "cupos administrativos" },
    tags: ["service", "guild", "records"],
  }),
  stock("shop_hoshimori_guild_services", "item_servicio_entrenamiento_basico", 4, {
    basePriceCopper: 25,
    restockRule: { type: "daily", amount: 4, condition: "cupos de instructor" },
    tags: ["service", "guild", "training"],
  }),
  stock("shop_temple_serene_flame_services", "item_vendaje_limpio", 6, {
    basePriceCopper: 10,
    restockRule: { type: "weekly", amount: 4, condition: "donaciones y tela limpia" },
    tags: ["medicine", "bandage", "temple"],
  }),
  stock("shop_temple_serene_flame_services", "item_infusion_calmante", 6, {
    basePriceCopper: 18,
    restockRule: { type: "weekly", amount: 4, condition: "hierbas simples" },
    tags: ["medicine", "infusion", "temple"],
  }),
  stock("shop_temple_serene_flame_services", "item_servicio_primeros_auxilios_templo", 6, {
    basePriceCopper: 20,
    restockRule: { type: "daily", amount: 6, condition: "capacidad tranquila del templo" },
    tags: ["service", "temple", "first_aid"],
  }),
  stock("shop_temple_serene_flame_services", "item_servicio_reposo_templo", 4, {
    basePriceCopper: 15,
    restockRule: { type: "daily", amount: 4, condition: "espacio de reposo disponible" },
    tags: ["service", "temple", "rest"],
  }),
];

async function assertReferencesExist() {
  const locationIds = unique(shops.map((entry) => entry.locationId));
  const ownerNpcIds = unique(shops.map((entry) => entry.ownerNpcId));
  const factionIds = unique(shops.map((entry) => entry.factionId));
  const stockShopIds = unique(stocks.map((entry) => entry.shopId));
  const stockItemIds = unique(stocks.map((entry) => entry.itemId));
  const itemIds = unique(items.map((entry) => entry.itemId));
  const shopIds = unique(shops.map((entry) => entry.shopId));

  const stockMissingShops = stockShopIds.filter((id) => !shopIds.includes(id));
  const stockMissingItems = stockItemIds.filter((id) => !itemIds.includes(id));

  if (stockMissingShops.length > 0 || stockMissingItems.length > 0) {
    throw new Error(
      [
        stockMissingShops.length ? `stock shop refs not in seed: ${stockMissingShops.join(", ")}` : "",
        stockMissingItems.length ? `stock item refs not in seed: ${stockMissingItems.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; ")
    );
  }

  const [locations, owners, factions] = await Promise.all([
    Location.find({ locationId: { $in: locationIds } }).select("locationId").lean(),
    Npc.find({ npcId: { $in: ownerNpcIds } }).select("npcId").lean(),
    Faction.find({ factionId: { $in: factionIds } }).select("factionId").lean(),
  ]);

  const existingLocationIds = new Set(locations.map((entry) => entry.locationId));
  const existingOwnerIds = new Set(owners.map((entry) => entry.npcId));
  const existingFactionIds = new Set(factions.map((entry) => entry.factionId));

  const missingLocations = locationIds.filter((id) => !existingLocationIds.has(id));
  const missingOwners = ownerNpcIds.filter((id) => !existingOwnerIds.has(id));
  const missingFactions = factionIds.filter((id) => !existingFactionIds.has(id));

  const missing = [
    missingLocations.length ? `locations: ${missingLocations.join(", ")}` : "",
    missingOwners.length ? `owners: ${missingOwners.join(", ")}` : "",
    missingFactions.length ? `factions: ${missingFactions.join(", ")}` : "",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing references required for G6 economy seed: ${missing.join("; ")}`);
  }
}

async function seedHoshimoriEconomy() {
  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    throw new Error("MONGODB_URI is required to seed Hoshimori economy.");
  }

  await assertReferencesExist();

  await Item.bulkWrite(
    items.map((entry) => ({
      updateOne: {
        filter: { itemId: entry.itemId },
        update: { $set: entry },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  await Shop.bulkWrite(
    shops.map((entry) => ({
      updateOne: {
        filter: { shopId: entry.shopId },
        update: { $set: entry },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  await ShopStock.bulkWrite(
    stocks.map((entry) => {
      const {
        stockId,
        quantity,
        reservedQuantity,
        currentPriceCopper,
        scarcityFlags,
        lastRestockedDay,
        ...stableStockFields
      } = entry;

      return {
        updateOne: {
          filter: { shopId: entry.shopId, itemId: entry.itemId },
          update: {
            $set: stableStockFields,
            $setOnInsert: {
              stockId,
              quantity,
              reservedQuantity,
              currentPriceCopper,
              scarcityFlags,
              lastRestockedDay,
            },
          },
          upsert: true,
        },
      };
    }),
    { ordered: false }
  );

  const [itemCount, shopCount, stockCount] = await Promise.all([
    Item.countDocuments({ itemId: { $in: items.map((entry) => entry.itemId) } }),
    Shop.countDocuments({ shopId: { $in: shops.map((entry) => entry.shopId) } }),
    ShopStock.countDocuments({
      $or: stocks.map((entry) => ({ shopId: entry.shopId, itemId: entry.itemId })),
    }),
  ]);

  console.log("Hoshimori economy seed completed.");
  console.log(`Expected G6 items in seed: ${items.length}`);
  console.log(`Expected G6 shops in seed: ${shops.length}`);
  console.log(`Expected G6 stock rows in seed: ${stocks.length}`);
  console.log(`MongoDB G6 items found: ${itemCount}`);
  console.log(`MongoDB G6 shops found: ${shopCount}`);
  console.log(`MongoDB G6 stock rows found: ${stockCount}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  seedHoshimoriEconomy().catch(async (error) => {
    console.error("Error seeding Hoshimori economy:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = {
  MARKER_TAGS,
  SOURCE,
  items,
  shops,
  stocks,
  seedHoshimoriEconomy,
};
