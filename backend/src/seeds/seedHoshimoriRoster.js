require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const Npc = require("../models/Npc");
const Location = require("../models/Location");

const npcs = [
  {
    npcId: "npc_mara_vell",
    name: "Mara Vell",
    age: 31,
    role: "administradora/escribana del gremio",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_guild",
    currentLocationId: "loc_hoshimori_guild",
    currentTask: "gestionando registros y cartelera",
    availability: { status: "available", reason: "normalmente en mostrador/archivos del gremio" },
    persistenceLevel: "important",
    personality: ["ordenada", "precisa", "algo fria", "justa con procedimientos"],
    speechStyle: "formal, seca, muy concreta",
    values: ["registros", "pruebas", "puntualidad", "claridad"],
    rejects: ["papeles incompletos", "excusas", "gente que toca archivos"],
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Aun sin trato directo importante con Lucas." }
  },
  {
    npcId: "npc_eddan_rusk",
    name: "Eddan Rusk",
    age: 45,
    role: "instructor/evaluador fisico del gremio",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_guild_patio",
    currentLocationId: "loc_hoshimori_guild",
    currentTask: "supervisando patio o equipo del gremio",
    availability: { status: "busy", reason: "normalmente ocupado con evaluaciones o mantenimiento" },
    persistenceLevel: "important",
    personality: ["exigente", "frontal", "veterano cansado", "justo"],
    speechStyle: "aspero, sin adornos",
    values: ["tecnica", "disciplina", "retirada inteligente"],
    rejects: ["fanfarroneria", "ataques sin plan", "novatos suicidas"],
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Aun sin evaluacion formal de Lucas." }
  },
  {
    npcId: "npc_brann",
    name: "Brann",
    age: 18,
    role: "ayudante ocasional de carga/mozo temporal",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_grulla_azul",
    currentLocationId: "loc_hoshimori_market",
    currentTask: "buscando trabajo o haciendo encargos menores",
    availability: { status: "unknown", reason: "se mueve entre posada, mercado y gremio" },
    persistenceLevel: "secondary",
    personality: ["ruidoso", "competitivo", "algo inseguro bajo bromas"],
    speechStyle: "bromista, provocador suave",
    values: ["fuerza", "reconocimiento", "paga rapida"],
    rejects: ["ser humillado frente a otros"],
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin vinculo claro aun." }
  },
  {
    npcId: "npc_pavo",
    name: "Pavo",
    age: 50,
    role: "vendedor de alimentos/raciones",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_market",
    currentLocationId: "loc_hoshimori_market",
    currentTask: "atendiendo puesto de comida y raciones",
    availability: { status: "available", reason: "atiende su puesto en el mercado durante el dia" },
    persistenceLevel: "secondary",
    personality: ["charlatan", "negociador", "atento a rumores"],
    speechStyle: "rapido, vendedor, exagera sin mentir del todo",
    values: ["clientes", "margen", "informacion"],
    rejects: ["regateo agresivo", "deuda sin garantia"],
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Aun sin trato comercial relevante." }
  },
  {
    npcId: "npc_borin",
    name: "Borin",
    age: 47,
    role: "herrero",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_borin_smithy",
    currentLocationId: "loc_hoshimori_borin_smithy",
    currentTask: "trabajando en la herreria",
    availability: { status: "available", reason: "normalmente disponible en la herreria si esta operativa" },
    persistenceLevel: "secondary",
    personality: ["grunon", "metodico", "orgulloso del oficio"],
    speechStyle: "pocas palabras, metaforas de metal",
    values: ["buen pago", "herramientas cuidadas", "respeto por el oficio"],
    rejects: ["tocar herramientas sin permiso", "pedir armas fiadas"],
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo importante." }
  },
  {
    npcId: "npc_sella",
    name: "Sella",
    age: 34,
    role: "costurera/tendera de telas",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_sella_workshop",
    currentLocationId: "loc_hoshimori_market",
    currentTask: "trabajando en arreglos y telas",
    availability: { status: "available", reason: "suele estar en su taller del mercado" },
    persistenceLevel: "secondary",
    personality: ["observadora", "paciente", "chismosa moderada"],
    speechStyle: "amable pero precisa",
    values: ["presentacion", "cuidado", "discrecion rentable"],
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo importante." }
  },
  {
    npcId: "npc_liora",
    name: "Liora",
    age: 29,
    role: "herborista",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_liora_stall",
    currentLocationId: "loc_hoshimori_market",
    currentTask: "atendiendo puesto de hierbas",
    availability: { status: "available", reason: "normalmente disponible en el mercado" },
    persistenceLevel: "secondary",
    personality: ["tranquila", "intuitiva", "algo misteriosa"],
    speechStyle: "pausado, con preguntas",
    values: ["calma", "salud", "plantas", "pago justo"],
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo importante." }
  },
  {
    npcId: "npc_narek",
    name: "Narek",
    age: 52,
    role: "cuidador del Templo de la Llama Serena",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_temple_serene_flame",
    currentLocationId: "loc_hoshimori_temple_serene_flame",
    currentTask: "cuidando el templo y atendiendo visitantes",
    availability: { status: "available", reason: "suele estar en el templo" },
    persistenceLevel: "secondary",
    personality: ["sereno", "compasivo", "firme ante mentiras graves"],
    speechStyle: "bajo, pausado, reflexivo",
    values: ["memoria", "calma", "promesas", "duelo"],
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo importante." }
  },
  {
    npcId: "npc_kael",
    name: "Kael",
    age: 36,
    role: "guardia visible de Hoshimori",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_guard_post",
    currentLocationId: "loc_hoshimori_plaza",
    currentTask: "vigilando plaza y mercado",
    availability: { status: "busy", reason: "en patrulla de orden publico" },
    persistenceLevel: "secondary",
    personality: ["cansado", "pragmatico", "protector del orden"],
    speechStyle: "directo, con tono de advertencia",
    values: ["no crear panico", "resolver conflictos sin escalar"],
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo importante." }
  },
  {
    npcId: "npc_celia_dorn",
    name: "Celia Dorn",
    age: 40,
    role: "escribana del consejo local",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_council_records",
    currentLocationId: "loc_hoshimori_plaza",
    currentTask: "gestionando registros locales",
    availability: { status: "busy", reason: "normalmente ocupada con registros y acuerdos" },
    persistenceLevel: "secondary",
    personality: ["formal", "diplomatica", "cuidadosa"],
    speechStyle: "educada, burocratica",
    values: ["documentos", "acuerdos", "reputacion del pueblo"],
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo importante." }
  },
  {
    npcId: "npc_irma",
    name: "Irma",
    age: 63,
    role: "vecina/vendedora ocasional/historiadora oral",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_plaza",
    currentLocationId: "loc_hoshimori_market",
    currentTask: "conversando y observando el mercado",
    availability: { status: "available", reason: "suele moverse entre mercado, templo y plaza" },
    persistenceLevel: "secondary",
    personality: ["curiosa", "dramatica", "afectuosa si cae bien"],
    speechStyle: "cuenta historias, mezcla rumor y recuerdo",
    values: ["memoria", "juventud respetuosa", "pan caliente"],
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo importante." }
  },
  {
    npcId: "npc_sael_nyra",
    name: "Sael Nyra",
    age: 19,
    role: "aventurera novata recurrente",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_guild",
    currentLocationId: "loc_hoshimori_guild",
    currentTask: "buscando oportunidades en el gremio",
    availability: { status: "available", reason: "frecuenta el gremio y la posada" },
    persistenceLevel: "secondary",
    personality: ["ambiciosa", "simpatica", "algo imprudente"],
    speechStyle: "energetica, vende bien sus logros",
    values: ["ascenso", "reconocimiento", "companeros utiles"],
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Aun sin trato importante." }
  },
  {
    npcId: "npc_oren",
    name: "Oren",
    age: 48,
    role: "molinero",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_mill",
    currentLocationId: "loc_hoshimori_mill",
    currentTask: "trabajando en el molino",
    availability: { status: "busy", reason: "normalmente en el molino" },
    persistenceLevel: "background_prepared",
    personality: ["practico", "preocupado por rutas y clima"],
    speechStyle: "campesino directo",
    values: ["grano", "maquinaria", "familia", "seguridad de caminos"],
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo." }
  },
  {
    npcId: "npc_tessa",
    name: "Tessa",
    age: 27,
    role: "carretera/transportista local",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_road_entrance",
    currentLocationId: "loc_hoshimori_market",
    currentTask: "revisando transporte y rutas",
    availability: { status: "unknown", reason: "se mueve entre entrada del pueblo, mercado y caminos" },
    persistenceLevel: "background_prepared",
    personality: ["franca", "resistente", "desconfiada con desconocidos"],
    speechStyle: "aspero, con humor seco",
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo." }
  },
  {
    npcId: "npc_hilda_fen",
    name: "Hilda Fen",
    age: 55,
    role: "panadera",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_bakery",
    currentLocationId: "loc_hoshimori_market",
    currentTask: "vendiendo pan y revisando harina",
    availability: { status: "available", reason: "suele estar cerca del horno o mercado" },
    persistenceLevel: "background_prepared",
    personality: ["maternal con limites", "severa con deudores"],
    speechStyle: "calida hasta que la hacen enojar",
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo." }
  },
  {
    npcId: "npc_rulan_veck",
    name: "Rulan Veck",
    age: 22,
    role: "aprendiz de guardia",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_guard_post",
    currentLocationId: "loc_hoshimori_plaza",
    currentTask: "patrulla menor",
    availability: { status: "busy", reason: "en tareas de guardia" },
    persistenceLevel: "background_prepared",
    personality: ["correcto", "inseguro", "quiere demostrar valor"],
    speechStyle: "formal de mas",
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo." }
  },
  {
    npcId: "npc_merek_sol",
    name: "Merek Sol",
    age: 44,
    role: "curtidor/pieles",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_tannery",
    currentLocationId: "loc_hoshimori_market",
    currentTask: "revisando pieles y materiales",
    availability: { status: "busy", reason: "trabaja entre taller y mercado" },
    persistenceLevel: "background_prepared",
    personality: ["reservado", "honesto si le pagan"],
    speechStyle: "pocas palabras",
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo." }
  },
  {
    npcId: "npc_nia",
    name: "Nia",
    age: 13,
    role: "recadera ocasional",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_plaza",
    currentLocationId: "loc_hoshimori_plaza",
    currentTask: "haciendo recados menores",
    availability: { status: "available", reason: "se mueve rapido entre plaza, mercado y posada" },
    persistenceLevel: "background_prepared",
    personality: ["rapida", "curiosa", "algo imprudente"],
    speechStyle: "rapida y directa",
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo." }
  },
  {
    npcId: "npc_doran",
    name: "Doran",
    age: 60,
    role: "ex lenador",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_plaza",
    currentLocationId: "loc_hoshimori_plaza",
    currentTask: "observando el movimiento del pueblo",
    availability: { status: "available", reason: "suele estar en plaza o Camino del Molino" },
    persistenceLevel: "background_prepared",
    personality: ["terco", "nostalgico", "observador"],
    speechStyle: "lento, con advertencias viejas",
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo." }
  },
  {
    npcId: "npc_maelis",
    name: "Maelis",
    age: 24,
    role: "ayudante del templo",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_temple_serene_flame",
    currentLocationId: "loc_hoshimori_temple_serene_flame",
    currentTask: "ayudando en el templo",
    availability: { status: "available", reason: "suele estar en templo o mercado por hierbas" },
    persistenceLevel: "background_prepared",
    personality: ["gentil", "firme", "atenta al dolor ajeno"],
    speechStyle: "suave y clara",
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo." }
  },
  {
    npcId: "npc_joren_pell",
    name: "Joren Pell",
    age: 33,
    role: "comerciante de paso frecuente",
    regionId: "region_hoshimori",
    cityId: "city_hoshimori",
    homeLocationId: "loc_hoshimori_grulla_azul",
    currentLocationId: "loc_hoshimori_grulla_azul",
    currentTask: "descansando o revisando suministros",
    availability: { status: "unknown", reason: "aparece en posada, mercado o rutas segun viaje" },
    persistenceLevel: "background_prepared",
    personality: ["educado", "calculador", "miedoso ante violencia"],
    speechStyle: "cortes, cuidadoso",
    relationshipWithLucas: { trust: 0, respect: 0, notes: "Sin trato directo." }
  }
];

async function seedHoshimoriRoster() {
  await connectDB();

  for (const npc of npcs) {
    await Npc.updateOne(
      { npcId: npc.npcId },
      { $set: npc },
      { upsert: true, runValidators: true }
    );
  }

  await Location.bulkWrite([
    {
      updateOne: {
        filter: { locationId: "loc_hoshimori_market" },
        update: {
          $set: {
            visibleNpcIds: ["npc_pavo", "npc_sella", "npc_liora", "npc_irma", "npc_hilda_fen"],
            probableNpcIds: ["npc_tessa", "npc_merek_sol", "npc_brann"],
          },
        },
        upsert: false,
      },
    },
    {
      updateOne: {
        filter: { locationId: "loc_hoshimori_guild" },
        update: {
          $set: {
            visibleNpcIds: ["npc_garrick_thorne", "npc_mara_vell"],
            probableNpcIds: ["npc_eddan_rusk", "npc_sael_nyra"],
          },
        },
        upsert: false,
      },
    },
    {
      updateOne: {
        filter: { locationId: "loc_hoshimori_grulla_azul_comedor" },
        update: {
          $set: {
            visibleNpcIds: ["npc_roberto_valen"],
            probableNpcIds: ["npc_yara_mils", "npc_fern", "npc_joren_pell"],
          },
        },
        upsert: false,
      },
    },
    {
      updateOne: {
        filter: { locationId: "loc_hoshimori_grulla_azul_cocina" },
        update: {
          $set: {
            visibleNpcIds: ["npc_yara_mils"],
            probableNpcIds: ["npc_fern"],
          },
        },
        upsert: false,
      },
    },
    {
      updateOne: {
        filter: { locationId: "loc_hoshimori_temple_serene_flame" },
        update: {
          $set: {
            visibleNpcIds: ["npc_narek"],
            probableNpcIds: ["npc_maelis"],
          },
        },
        upsert: false,
      },
    },
    {
      updateOne: {
        filter: { locationId: "loc_hoshimori_borin_smithy" },
        update: {
          $set: {
            visibleNpcIds: ["npc_borin"],
            probableNpcIds: [],
          },
        },
        upsert: false,
      },
    },
  ]);

  const count = await Npc.countDocuments({ regionId: "region_hoshimori" });

  console.log(`Roster de Hoshimori cargado. NPCs en region_hoshimori: ${count}`);

  await mongoose.disconnect();
}

seedHoshimoriRoster().catch(async (error) => {
  console.error("Error cargando roster de Hoshimori:", error);
  await mongoose.disconnect();
  process.exit(1);
});
