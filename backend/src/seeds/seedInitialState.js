require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const GameState = require("../models/GameState");
const Character = require("../models/Character");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const WorldEvent = require("../models/WorldEvent");

async function seedInitialState() {
  await connectDB();

  await Character.updateOne(
    { characterId: "char_lucas" },
    {
      $set: {
        characterId: "char_lucas",
        name: "Lucas",
        apparentAge: 15,
        realPastLifeAge: 28,
        visual: {
          heightCm: 195,
          hair: "rubio, medio despeinado",
          eyes: "azules",
          skin: "blanca",
          body: "atlético, fuerte, entrenado",
          clothing: "ropa simple de aldeano/viajero",
          presence: "imponente por altura y porte; atractivo, llamativo y raro por altura",
          notes: "Este cuerpo no se parece al Lucas real de su vida anterior.",
        },
        background: {
          currentWorldSummary:
            "Lucas despertó en Asterion y actualmente trabaja en La Grulla Azul, en Hoshimori.",
          pastLifeSummary:
            "En su vida anterior tenía 28 años, era profesor de educación física, programador, inteligente, optimista, buena persona, calculador y rápido para decidir.",
          reincarnationSummary:
            "Lucas conserva memoria de su vida anterior y ahora aparenta 15 años en un cuerpo alto y fuerte.",
        },
        modernKnowledgeProfile: [
          "educación física",
          "programación",
          "estrategia práctica",
          "higiene básica moderna",
          "organización",
          "entrenamiento físico",
          "lógica de videojuegos/RPG",
        ],
        basePersonality: [
          "optimista",
          "directo",
          "calculador cuando hace falta",
          "buena persona",
          "confiado",
          "curioso",
        ],
        staticFlags: {
          reincarnated: true,
          systemUser: true,
        },
      },
    },
    { upsert: true }
  );

  await Location.bulkWrite([
    {
      updateOne: {
        filter: { locationId: "loc_hoshimori_grulla_azul" },
        update: {
          $set: {
            locationId: "loc_hoshimori_grulla_azul",
            name: "La Grulla Azul",
            type: "inn",
            regionId: "region_hoshimori",
            currentStatus: "operational",
            services: {
              food: true,
              lodging: true,
              work: true,
            },
            dangerLevel: "safe",
            tags: ["hoshimori", "inn", "social", "work"],
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { locationId: "loc_hoshimori_grulla_azul_comedor" },
        update: {
          $set: {
            locationId: "loc_hoshimori_grulla_azul_comedor",
            name: "La Grulla Azul—sala baja/comedor",
            type: "inn_room",
            regionId: "region_hoshimori",
            parentLocationId: "loc_hoshimori_grulla_azul",
            currentStatus: "operational",
            services: {
              food: true,
              social: true,
            },
            dangerLevel: "safe",
            visibleNpcIds: ["npc_roberto_valen"],
            probableNpcIds: ["npc_yara_mils", "npc_fern"],
            tags: ["hoshimori", "inn", "dining_room"],
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { locationId: "loc_hoshimori_grulla_azul_cocina" },
        update: {
          $set: {
            locationId: "loc_hoshimori_grulla_azul_cocina",
            name: "La Grulla Azul—cocina",
            type: "kitchen",
            regionId: "region_hoshimori",
            parentLocationId: "loc_hoshimori_grulla_azul",
            currentStatus: "operational",
            services: {
              cooking: true,
              staffOnly: true,
            },
            dangerLevel: "safe",
            visibleNpcIds: ["npc_yara_mils"],
            probableNpcIds: ["npc_fern"],
            tags: ["hoshimori", "inn", "kitchen"],
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { locationId: "loc_hoshimori_guild" },
        update: {
          $set: {
            locationId: "loc_hoshimori_guild",
            name: "Gremio local de Hoshimori",
            type: "guild",
            regionId: "region_hoshimori",
            currentStatus: "operational",
            services: {
              missions: true,
              reports: true,
              training: true,
            },
            dangerLevel: "safe",
            visibleNpcIds: ["npc_garrick_thorne"],
            tags: ["hoshimori", "guild", "missions"],
          },
        },
        upsert: true,
      },
    },
  ]);

  await Npc.bulkWrite([
    {
      updateOne: {
        filter: { npcId: "npc_roberto_valen" },
        update: {
          $set: {
            npcId: "npc_roberto_valen",
            name: "Roberto Valen",
            age: 42,
            role: "dueño/encargado de La Grulla Azul",
            regionId: "region_hoshimori",
            cityId: "city_hoshimori",
            homeLocationId: "loc_hoshimori_grulla_azul",
            currentLocationId: "loc_hoshimori_grulla_azul_comedor",
            currentTask: "supervisando sala y descanso de mediodía",
            availability: {
              status: "available",
              reason: "visible en sala/comedor",
            },
            persistenceLevel: "important",
            personality: ["directo", "práctico", "trabajador", "justo", "seco"],
            speechStyle: "frases cortas, tono seco, humor gastado",
            values: ["responsabilidad", "trabajo bien hecho", "palabra dada"],
            tolerates: ["errores honestos", "esfuerzo", "preguntas directas"],
            rejects: ["mentiras", "robo", "faltas graves", "excusas flojas"],
            relationshipWithLucas: {
              trust: 56,
              respect: 35,
              notes: "Confianza funcional. Lucas trabaja en La Grulla Azul y completó el turno mañana Día 10 con buen rendimiento.",
            },
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { npcId: "npc_fern" },
        update: {
          $set: {
            npcId: "npc_fern",
            name: "Fern",
            age: 15,
            role: "trabajadora reservada de La Grulla Azul; talento mágico",
            regionId: "region_hoshimori",
            cityId: "city_hoshimori",
            homeLocationId: "loc_hoshimori_grulla_azul",
            currentLocationId: "loc_hoshimori_grulla_azul",
            currentTask: "tareas de posada",
            availability: {
              status: "busy",
              reason: "posible de paso por tareas de comedor",
            },
            persistenceLevel: "important",
            personality: ["reservada", "prudente", "observadora", "seria"],
            speechStyle: "breve, directa, a veces seca pero no cruel",
            values: ["discreción", "control", "responsabilidad", "seguridad"],
            tolerates: ["respeto", "honestidad", "ayuda sin presión"],
            rejects: ["invasión", "insistencia", "magia imprudente"],
            relationshipWithLucas: {
              trust: 24,
              notes: "Trato básico-cordial. Sabe que Lucas despertó magia/maná porque él se lo contó.",
            },
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { npcId: "npc_yara_mils" },
        update: {
          $set: {
            npcId: "npc_yara_mils",
            name: "Yara Mils",
            age: 16,
            role: "aprendiz/ayudante de cocina y posada",
            regionId: "region_hoshimori",
            cityId: "city_hoshimori",
            homeLocationId: "loc_hoshimori_grulla_azul",
            currentLocationId: "loc_hoshimori_grulla_azul_cocina",
            currentTask: "trabajo de cocina durante mediodía",
            availability: {
              status: "busy",
              reason: "audible/probable en cocina cercana",
            },
            persistenceLevel: "important",
            personality: [
              "amable",
              "nerviosa",
              "trabajadora",
              "tímida",
              "un poco celosa si siente apego o inseguridad",
            ],
            speechStyle: "suave, frases cortas cuando se siente observada",
            values: ["sentirse útil", "no ser humillada", "que respeten su esfuerzo"],
            tolerates: ["bromas ligeras", "ayuda genuina", "compañía tranquila"],
            rejects: ["presión", "burla pública", "coqueteo brusco", "comparaciones crueles"],
            relationshipWithLucas: {
              trust: 15,
              jealousy: 5,
              notes: "Trato amable inicial. Yara ve a Lucas como amable, trabajador, tranquilo y agradable.",
            },
          },
        },
        upsert: true,
      },
    },
    {
      updateOne: {
        filter: { npcId: "npc_garrick_thorne" },
        update: {
          $set: {
            npcId: "npc_garrick_thorne",
            name: "Garrick Thorne",
            age: 38,
            role: "coordinador de voluntarios/contacto del gremio",
            regionId: "region_hoshimori",
            cityId: "city_hoshimori",
            homeLocationId: "loc_hoshimori_guild",
            currentLocationId: "loc_hoshimori_guild",
            currentTask: "coordinación de gremio",
            availability: {
              status: "available",
              reason: "normalmente disponible en el gremio",
            },
            persistenceLevel: "important",
            personality: ["firme", "razonable", "institucional", "protector de novatos"],
            speechStyle: "claro, serio, con advertencias prácticas",
            values: ["reportes honestos", "preparación", "responsabilidad"],
            rejects: ["exageraciones", "imprudencia", "mentiras en misión"],
            relationshipWithLucas: {
              trust: 36,
              respect: 25,
              notes: "Trato cordial/institucional. Lucas completó voluntariado del Bosque de los Susurros.",
            },
          },
        },
        upsert: true,
      },
    },
  ]);

  await WorldEvent.updateOne(
    { eventId: "event_d10_supply_delay_mud" },
    {
      $set: {
        eventId: "event_d10_supply_delay_mud",
        gameId: "isekai_lucas_main",
        title: "Retraso de suministros por barro residual",
        type: "supply_delay",
        scope: "local",
        status: "active",
        startDay: 10,
        startTime: "12:00",
        endDay: 10,
        endTime: "14:00",
        affectedLocationIds: [
          "loc_hoshimori_grulla_azul",
          "loc_hoshimori_grulla_azul_comedor",
        ],
        affectedNpcIds: [
          "npc_roberto_valen",
          "npc_yara_mils",
          "npc_fern",
        ],
        effects: [
          {
            type: "supply_delay",
            target: "inn_lunch_flow",
            value: "minor_disruption",
            reason: "Barro residual después del mal clima del Día 9",
          },
        ],
        visibility: "local",
        cause: "Barro residual por mal clima finalizado a las 00:00 del Día 10",
        severity: "minor",
        createdBy: "system",
        tags: ["hoshimori", "weather_aftereffect", "supplies"],
      },
    },
    { upsert: true }
  );

  await GameState.updateOne(
    { gameId: "isekai_lucas_main" },
    {
      $set: {
        gameId: "isekai_lucas_main",
        currentDay: 10,
        diegeticDate: {
          day: 10,
          month: "Rocío Nuevo",
          season: "Brote",
          year: 1,
        },
        block: "Mediodía",
        time: "12:00",
        locationId: "loc_hoshimori_grulla_azul_comedor",
        characterId: "char_lucas",
        lucasStatus: {
          life: {
            current: 100,
            max: 100,
            label: "",
          },
          satiety: {
            current: 30,
            max: 100,
            label: "hambre fuerte",
          },
          energy: {
            current: 59,
            max: 100,
            label: "cansancio leve/energía media",
          },
          mp: {
            current: 200,
            max: 200,
            label: "",
          },
          injuries: [],
          conditions: [],
        },
        moneyCopper: 1470,
        inventory: [
          {
            itemId: "item_daga_simple",
            quantity: 1,
            condition: "funcional",
            equipped: false,
            notes: "Daga simple.",
          },
          {
            itemId: "item_ropa_comun_viajero",
            quantity: 1,
            condition: "usada pero funcional",
            equipped: true,
            notes: "Ropa común de viajero.",
          },
          {
            itemId: "item_botas_simples",
            quantity: 1,
            condition: "funcionales",
            equipped: true,
            notes: "Botas simples.",
          },
          {
            itemId: "item_mochila_basica",
            quantity: 1,
            condition: "normal",
            equipped: false,
            notes: "Mochila básica.",
          },
          {
            itemId: "item_cantimplora",
            quantity: 1,
            condition: "llena",
            equipped: false,
            notes: "Cantimplora llena.",
          },
          {
            itemId: "item_racion_normal",
            quantity: 2,
            condition: "normal",
            equipped: false,
            notes: "Cada una +35 saciedad.",
          },
          {
            itemId: "item_racion_pequena",
            quantity: 1,
            condition: "normal",
            equipped: false,
            notes: "+15 saciedad.",
          },
          {
            itemId: "item_nota_horarios_grulla_azul",
            quantity: 1,
            condition: "normal",
            equipped: false,
            notes: "Nota con horarios oficiales de La Grulla Azul.",
          },
        ],
        skills: [
          { skillId: "skill_fuerza", name: "Fuerza", phase: "Principiante", level: 6, exp: 10, expToNext: 100 },
          { skillId: "skill_resistencia", name: "Resistencia", phase: "Principiante", level: 6, exp: 68, expToNext: 100 },
          { skillId: "skill_vitalidad", name: "Vitalidad", phase: "Principiante", level: 6, exp: 13, expToNext: 100 },
          { skillId: "skill_agilidad", name: "Agilidad", phase: "Principiante", level: 4, exp: 69, expToNext: 100 },
          { skillId: "skill_percepcion", name: "Percepción", phase: "Principiante", level: 2, exp: 33, expToNext: 100 },
          { skillId: "skill_mana", name: "Maná", phase: "Principiante", level: 1, exp: 35, expToNext: 100 },
          { skillId: "skill_magia", name: "Magia", phase: "Principiante", level: 1, exp: 0, expToNext: 100 }
        ],
        activeEventIds: ["event_d10_supply_delay_mud"],
        activeMissionIds: [],
        biologicalClock: {
          lastProcessedTime: "12:00",
          currentHourBlock: "12:00-13:00",
          pendingAccumulation: [],
        },
        flags: {
          magicAwakened: true,
          knownSpells: [],
          formalGuildRegistrationPending: true,
          currentJob: "La Grulla Azul",
        },
      },
    },
    { upsert: true }
  );

  console.log("Seed inicial completado correctamente.");
  await mongoose.disconnect();
}

seedInitialState().catch(async (error) => {
  console.error("Error ejecutando seed inicial:", error);
  await mongoose.disconnect();
  process.exit(1);
});
