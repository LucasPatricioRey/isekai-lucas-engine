require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const Item = require("../models/Item");
const Location = require("../models/Location");
const Shop = require("../models/Shop");
const ShopStock = require("../models/ShopStock");
const Faction = require("../models/Faction");
const Mission = require("../models/Mission");

async function seedWorldEssentials() {
  await connectDB();

  await Item.bulkWrite([
    {
      updateOne: {
        filter: { itemId: "item_racion_pequena" },
        update: {
          $set: {
            itemId: "item_racion_pequena",
            name: "Racion pequena",
            type: "food",
            subtype: "ration",
            description: "Racion simple de viaje. +15 saciedad, +1 energia.",
            stackable: true,
            basePriceCopper: 20,
            satietyBonus: 15,
            energyBonus: 1,
            rarity: "common",
            legalStatus: "legal",
            tags: ["food", "ration", "travel"],
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { itemId: "item_racion_normal" },
        update: {
          $set: {
            itemId: "item_racion_normal",
            name: "Racion normal",
            type: "food",
            subtype: "ration",
            description: "Racion normal de viaje. +35 saciedad, +2 energia.",
            stackable: true,
            basePriceCopper: 40,
            satietyBonus: 35,
            energyBonus: 2,
            rarity: "common",
            legalStatus: "legal",
            tags: ["food", "ration", "travel"],
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { itemId: "item_comida_normal" },
        update: {
          $set: {
            itemId: "item_comida_normal",
            name: "Comida normal",
            type: "food",
            subtype: "meal",
            description: "Comida normal de posada. +30 saciedad, +5 energia.",
            stackable: false,
            basePriceCopper: 35,
            satietyBonus: 30,
            energyBonus: 5,
            rarity: "common",
            legalStatus: "legal",
            tags: ["food", "meal", "inn"],
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { itemId: "item_vendaje_limpio" },
        update: {
          $set: {
            itemId: "item_vendaje_limpio",
            name: "Vendaje limpio",
            type: "medicine",
            subtype: "bandage",
            description: "Vendaje simple para primeros auxilios.",
            stackable: true,
            basePriceCopper: 10,
            rarity: "common",
            legalStatus: "legal",
            tags: ["medicine", "bandage"],
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { itemId: "item_daga_simple" },
        update: {
          $set: {
            itemId: "item_daga_simple",
            name: "Daga simple",
            type: "weapon",
            subtype: "dagger",
            description: "Daga simple, funcional, comun.",
            stackable: false,
            basePriceCopper: 300,
            rarity: "common",
            legalStatus: "legal",
            tags: ["weapon", "dagger"],
          },
        },
        upsert: true,
      },
    },
  ]);

  await Location.bulkWrite([
    {
      updateOne: {
        filter: { locationId: "loc_hoshimori_market" },
        update: {
          $set: {
            locationId: "loc_hoshimori_market",
            name: "Mercado de Hoshimori",
            type: "market",
            regionId: "region_hoshimori",
            currentStatus: "operational",
            services: { commerce: true, rumors: true },
            dangerLevel: "safe",
            tags: ["hoshimori", "market", "commerce"],
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { locationId: "loc_hoshimori_borin_smithy" },
        update: {
          $set: {
            locationId: "loc_hoshimori_borin_smithy",
            name: "Herreria de Borin",
            type: "smithy",
            regionId: "region_hoshimori",
            parentLocationId: "loc_hoshimori_market",
            ownerNpcId: "npc_borin",
            currentStatus: "operational",
            services: { buy: true, sell: true, repair: true },
            dangerLevel: "safe",
            tags: ["hoshimori", "smithy", "tools", "weapons"],
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { locationId: "loc_hoshimori_temple_serene_flame" },
        update: {
          $set: {
            locationId: "loc_hoshimori_temple_serene_flame",
            name: "Templo de la Llama Serena",
            type: "temple",
            regionId: "region_hoshimori",
            currentStatus: "operational",
            services: { advice: true, firstAid: true, rest: true },
            dangerLevel: "safe",
            tags: ["hoshimori", "temple", "serene_flame"],
          },
        },
        upsert: true,
      },
    },
  ]);

  await Faction.bulkWrite([
    {
      updateOne: {
        filter: { factionId: "faction_valdoria_crown" },
        update: {
          $set: {
            factionId: "faction_valdoria_crown",
            name: "Corona de Valdoria",
            type: "kingdom",
            scope: "national",
            regionIds: ["region_hoshimori"],
            goals: ["estabilidad", "impuestos", "rutas seguras"],
            resources: ["guardia", "nobleza", "registros"],
            relationshipWithLucas: {
              reputation: 0,
              trust: 0,
              suspicion: 0,
              accessLevel: "none",
              notes: "Lucas no tiene relacion directa con la corona.",
            },
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { factionId: "faction_hoshimori_guild" },
        update: {
          $set: {
            factionId: "faction_hoshimori_guild",
            name: "Gremio local de Hoshimori",
            type: "guild",
            scope: "local",
            regionIds: ["region_hoshimori"],
            goals: ["encargos", "rutas seguras", "novatos vivos"],
            resources: ["cartelera", "archivos", "patio de entrenamiento"],
            relationshipWithLucas: {
              reputation: 10,
              trust: 10,
              suspicion: 0,
              accessLevel: "basic",
              notes: "Lucas completo un voluntariado util y sigue siendo novato institucional.",
            },
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { factionId: "faction_grulla_azul" },
        update: {
          $set: {
            factionId: "faction_grulla_azul",
            name: "La Grulla Azul",
            type: "shop",
            scope: "local",
            regionIds: ["region_hoshimori"],
            goals: ["mantener posada", "clientes", "comida", "trabajo estable"],
            resources: ["cocina", "habitaciones", "empleados", "rumores de viajeros"],
            relationshipWithLucas: {
              reputation: 15,
              trust: 20,
              suspicion: 0,
              accessLevel: "basic",
              notes: "Lucas trabaja en La Grulla Azul y tuvo buen rendimiento.",
            },
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { factionId: "faction_hoshimori_innkeepers" },
        update: {
          $set: {
            factionId: "faction_hoshimori_innkeepers",
            name: "Posaderos de Hoshimori",
            type: "shop",
            scope: "local",
            regionIds: ["region_hoshimori"],
            goals: ["hospitalidad estable", "clientes seguros", "suministros constantes"],
            resources: ["posadas", "cocinas", "habitaciones", "contactos de viajeros"],
            relationshipWithLucas: {
              reputation: 10,
              trust: 10,
              suspicion: 0,
              accessLevel: "basic",
              notes: "Lucas es conocido principalmente por su trabajo en La Grulla Azul.",
            },
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { factionId: "faction_hoshimori_merchants" },
        update: {
          $set: {
            factionId: "faction_hoshimori_merchants",
            name: "Comerciantes de Hoshimori",
            type: "merchant",
            scope: "local",
            regionIds: ["region_hoshimori"],
            goals: ["precios estables", "rutas abiertas", "stock suficiente"],
            resources: ["puestos", "mercado", "red local de intercambio"],
            relationshipWithLucas: {
              reputation: 0,
              trust: 0,
              suspicion: 0,
              accessLevel: "basic",
              notes: "Lucas todavia no tiene reputacion comercial fuerte.",
            },
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { factionId: "faction_hoshimori_guard" },
        update: {
          $set: {
            factionId: "faction_hoshimori_guard",
            name: "Guardia local de Hoshimori",
            type: "guard",
            scope: "local",
            regionIds: ["region_hoshimori"],
            goals: ["orden local", "rutas seguras", "respuesta ante amenazas"],
            resources: ["puesto de guardia", "patrullas", "reportes de ruta"],
            relationshipWithLucas: {
              reputation: 0,
              trust: 0,
              suspicion: 0,
              accessLevel: "basic",
              notes: "Lucas todavia no tiene historial formal con la guardia.",
            },
          },
        },
        upsert: true,
      },
    },
  ]);

  await Shop.bulkWrite([
    {
      updateOne: {
        filter: { shopId: "shop_pavo_food_stall" },
        update: {
          $set: {
            shopId: "shop_pavo_food_stall",
            name: "Puesto de comida de Pavo",
            locationId: "loc_hoshimori_market",
            ownerNpcId: "npc_pavo",
            type: "food",
            status: "operational",
            pricingProfile: { priceMultiplier: 1, notes: "Precios rurales base." },
            acceptsDebt: false,
            services: { buy: true, sell: true, repair: false, lodging: false, food: true, loans: false },
            tags: ["food", "market", "rations"],
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { shopId: "shop_grulla_azul_inn" },
        update: {
          $set: {
            shopId: "shop_grulla_azul_inn",
            name: "Servicios de La Grulla Azul",
            locationId: "loc_hoshimori_grulla_azul",
            ownerNpcId: "npc_roberto_valen",
            type: "inn",
            factionId: "faction_grulla_azul",
            status: "operational",
            pricingProfile: { priceMultiplier: 1, notes: "Precios normales de posada rural." },
            acceptsDebt: false,
            services: { buy: true, sell: false, repair: false, lodging: true, food: true, loans: false },
            tags: ["inn", "food", "lodging"],
          },
        },
        upsert: true,
      },
    },
  ]);

  await ShopStock.bulkWrite([
    {
      updateOne: {
        filter: { shopId: "shop_pavo_food_stall", itemId: "item_racion_pequena" },
        update: {
          $set: {
            stockId: "stock_pavo_racion_pequena",
            shopId: "shop_pavo_food_stall",
            itemId: "item_racion_pequena",
            quantity: 12,
            reservedQuantity: 0,
            basePriceCopper: 20,
            currentPriceCopper: 20,
            quality: "normal",
            restockRule: { type: "daily", amount: 6, condition: "si las rutas funcionan" },
            scarcityFlags: [],
            lastRestockedDay: 10,
            tags: ["food", "ration"],
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { shopId: "shop_pavo_food_stall", itemId: "item_racion_normal" },
        update: {
          $set: {
            stockId: "stock_pavo_racion_normal",
            shopId: "shop_pavo_food_stall",
            itemId: "item_racion_normal",
            quantity: 8,
            reservedQuantity: 0,
            basePriceCopper: 40,
            currentPriceCopper: 40,
            quality: "normal",
            restockRule: { type: "daily", amount: 4, condition: "si las rutas funcionan" },
            scarcityFlags: [],
            lastRestockedDay: 10,
            tags: ["food", "ration"],
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { shopId: "shop_grulla_azul_inn", itemId: "item_comida_normal" },
        update: {
          $set: {
            stockId: "stock_grulla_comida_normal",
            shopId: "shop_grulla_azul_inn",
            itemId: "item_comida_normal",
            quantity: 20,
            reservedQuantity: 0,
            basePriceCopper: 35,
            currentPriceCopper: 35,
            quality: "normal",
            restockRule: { type: "daily", amount: 20, condition: "si hay suministros" },
            scarcityFlags: ["supply_delay_active"],
            lastRestockedDay: 10,
            tags: ["food", "inn"],
          },
        },
        upsert: true,
      },
    },
  ]);

  await Mission.bulkWrite([
    {
      updateOne: {
        filter: { missionId: "mission_d10_cleanup_post_rain" },
        update: {
          $set: {
            missionId: "mission_d10_cleanup_post_rain",
            templateId: "template_cleanup_post_rain",
            title: "Limpieza post-lluvia en ruta cercana",
            description: "Ayudar a retirar barro y ramas menores en un tramo seguro cercano a Hoshimori.",
            sourceFactionId: "faction_hoshimori_guild",
            clientNpcId: "npc_garrick_thorne",
            locationId: "loc_hoshimori_guild",
            rank: "Porcelana",
            requirements: ["presentarse en el gremio", "aceptar formalmente", "trabajo fisico basico"],
            reward: { moneyCopper: 80, items: [], other: "" },
            mgReward: 3,
            riskLevel: "low",
            status: "available",
            postedDay: 10,
            postedTime: "06:00",
            expiresDay: 10,
            expiresTime: "18:00",
            proofRequired: "reporte simple de finalizacion",
            proofStatus: "pending",
            consequencesIfIgnored: ["otro voluntario puede tomar el encargo"],
            relatedEventIds: ["event_d10_supply_delay_mud"],
            flags: { starterMission: true },
          },
        },
        upsert: true,
      },
    },
  ]);

  console.log("Seed de mundo esencial completado correctamente.");
  await mongoose.disconnect();
}

seedWorldEssentials().catch(async (error) => {
  console.error("Error ejecutando seed de mundo esencial:", error);
  await mongoose.disconnect();
  process.exit(1);
});
