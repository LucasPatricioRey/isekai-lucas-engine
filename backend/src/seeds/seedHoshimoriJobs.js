require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const Faction = require("../models/Faction");
const JobContract = require("../models/JobContract");
const Location = require("../models/Location");
const Npc = require("../models/Npc");

const SOURCE = "g8_hoshimori_jobs_seed";
const MARKER_TAGS = ["g8", "hoshimori", "jobs"];

const contract = {
  contractId: "job_contract_lucas_grulla_azul_d10",
  characterId: "char_lucas",
  jobId: "job_grulla_azul_helper",
  title: "Ayudante de La Grulla Azul",
  employerNpcId: "npc_roberto_valen",
  locationId: "loc_hoshimori_grulla_azul",
  factionId: "faction_grulla_azul",
  status: "active",
  startDay: 10,
  pay: {
    dailyCopper: 140,
    notes: "Pago diario completo si cumple el turno acordado; adelantos o fiado requieren aprobacion de Roberto.",
  },
  includesMeals: true,
  mealBenefits: [
    {
      mealId: "meal_grulla_light_breakfast",
      name: "Comida ligera/desayuno de contrato",
      satietyBonus: 20,
      energyBonus: 2,
      notes: "Bono directo de comida; no reemplaza acumulador biologico del turno.",
    },
    {
      mealId: "meal_grulla_main_meal",
      name: "Almuerzo/cena principal de contrato",
      satietyBonus: 30,
      energyBonus: 5,
      notes: "Bono directo de comida principal si corresponde por horario y Roberto lo confirma.",
    },
  ],
  shifts: [
    {
      shiftId: "shift_grulla_morning_0700_1200",
      name: "Turno manana La Grulla Azul",
      startTime: "07:00",
      endTime: "12:00",
      activityCategory: "trabajo_normal",
      expectedMinutes: 300,
      payCopper: 70,
      status: "active",
      activeFromDay: 10,
      lateGraceMinutes: 5,
      includedMealIds: ["meal_grulla_light_breakfast"],
      typicalTasks: [
        "limpiar mesas",
        "mover bandejas y vajilla",
        "ayudar con comedor",
        "reponer agua y lena ligera",
      ],
      rules: [
        "presentarse antes del inicio",
        "avisar a Roberto si no puede trabajar",
        "no abandonar el turno sin causa clara",
      ],
    },
    {
      shiftId: "shift_grulla_afternoon_1400_2030",
      name: "Turno tarde La Grulla Azul",
      startTime: "14:00",
      endTime: "20:30",
      activityCategory: "trabajo_normal",
      expectedMinutes: 390,
      payCopper: 70,
      status: "active",
      activeFromDay: 10,
      lateGraceMinutes: 5,
      includedMealIds: ["meal_grulla_main_meal"],
      typicalTasks: [
        "servicio de comedor",
        "limpieza de sala baja",
        "ayuda a Fern y Yara con tareas de posada",
        "ordenar entrada y establo pequeno si hace falta",
      ],
      rules: [
        "mantener trato correcto con clientes",
        "no aceptar encargos externos durante el turno sin permiso",
        "registrar ausencia si no llega a horario",
      ],
    },
  ],
  typicalTasks: [
    "servir comidas simples",
    "limpiar y ordenar sala baja",
    "ayudar con vajilla",
    "mover cargas menores",
    "apoyar tareas simples de entrada o establo pequeno",
  ],
  absenceRules: [
    "ausencia sin aviso reduce confianza laboral",
    "abandono de turno puede perder pago del bloque",
    "enfermedad, mision aceptada o emergencia deben avisarse a Roberto",
    "pago y comida se aplican solo con procesamiento de turno real, no en preview",
  ],
  source: SOURCE,
  tags: [...MARKER_TAGS, SOURCE, "grulla_azul", "lucas_job"],
  flags: {
    g8: true,
    source: SOURCE,
    canonBasis: "GameState flags.currentJob indica La Grulla Azul; G8 modela contrato sin mutar GameState.",
  },
};

async function assertReferencesExist() {
  const [location, employer, faction] = await Promise.all([
    Location.findOne({ locationId: contract.locationId }).select("locationId").lean(),
    Npc.findOne({ npcId: contract.employerNpcId }).select("npcId").lean(),
    Faction.findOne({ factionId: contract.factionId }).select("factionId").lean(),
  ]);

  const missing = [
    location ? "" : `location: ${contract.locationId}`,
    employer ? "" : `employerNpc: ${contract.employerNpcId}`,
    faction ? "" : `faction: ${contract.factionId}`,
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Missing references required for G8 jobs seed: ${missing.join("; ")}`);
  }
}

async function seedHoshimoriJobs() {
  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    throw new Error("MONGODB_URI is required to seed Hoshimori jobs.");
  }

  await assertReferencesExist();

  await JobContract.updateOne(
    { contractId: contract.contractId },
    {
      $set: contract,
    },
    { upsert: true }
  );

  const count = await JobContract.countDocuments({
    source: SOURCE,
    tags: { $all: MARKER_TAGS },
  });

  console.log("Hoshimori jobs seed completed.");
  console.log("Expected G8 job contracts in seed: 1");
  console.log(`MongoDB G8 job contracts found: ${count}`);
  console.log(`Shifts in active contract: ${contract.shifts.length}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  seedHoshimoriJobs().catch(async (error) => {
    console.error("Error seeding Hoshimori jobs:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = {
  MARKER_TAGS,
  SOURCE,
  contract,
  seedHoshimoriJobs,
};
