require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const NpcRelationship = require("../models/NpcRelationship");

const SOURCE = "g4_hoshimori_social_seed";
const MARKER_TAGS = ["g4", "hoshimori", "social_graph"];
const CREATED_DAY = 10;
const CREATED_TIME = "12:00";

function normalizePair(npcAId, npcBId) {
  return [npcAId, npcBId].sort();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function relationship(npcAId, npcBId, data) {
  const [a, b] = normalizePair(npcAId, npcBId);
  const tags = unique([...MARKER_TAGS, SOURCE, ...(data.tags || [])]);

  return {
    ...data,
    relationshipId: `rel_${a}_${b}`,
    npcAId: a,
    npcBId: b,
    knownToLucas: data.knownToLucas ?? false,
    source: SOURCE,
    tags,
    privateNotes: data.privateNotes || "",
  };
}

function pairQuery(entry) {
  return { npcAId: entry.npcAId, npcBId: entry.npcBId };
}

const relationships = [
  relationship("npc_roberto_valen", "npc_fern", {
    type: "work_supervision",
    trust: 62,
    familiarity: 70,
    tension: 12,
    publicSummary: "Roberto supervisa a Fern en La Grulla Azul y confia en que cumpla tareas de la posada.",
    tags: ["grulla_azul", "work"],
  }),
  relationship("npc_roberto_valen", "npc_yara_mils", {
    type: "work_apprenticeship",
    trust: 55,
    familiarity: 68,
    tension: 10,
    publicSummary: "Roberto trata a Yara como aprendiz de la posada y espera que siga aprendiendo con orden.",
    tags: ["grulla_azul", "work", "apprentice"],
  }),
  relationship("npc_fern", "npc_yara_mils", {
    type: "coworkers",
    trust: 42,
    familiarity: 64,
    tension: 16,
    publicSummary: "Fern y Yara son companeras de posada; se cruzan seguido entre comedor, cocina y tareas internas.",
    tags: ["grulla_azul", "coworkers"],
  }),
  relationship("npc_yara_mils", "npc_brann", {
    type: "occasional_coworkers",
    trust: 28,
    familiarity: 38,
    tension: 20,
    publicSummary: "Yara y Brann se conocen por trabajos ocasionales y bromas livianas alrededor de la posada.",
    tags: ["grulla_azul", "light_teasing"],
  }),
  relationship("npc_garrick_thorne", "npc_mara_vell", {
    type: "guild_coordination",
    trust: 72,
    familiarity: 78,
    tension: 8,
    publicSummary: "Garrick y Mara coordinan encargos, reportes y registros del gremio con confianza funcional.",
    tags: ["guild", "work"],
  }),
  relationship("npc_garrick_thorne", "npc_eddan_rusk", {
    type: "guild_training_coordination",
    trust: 66,
    familiarity: 74,
    tension: 18,
    publicSummary: "Garrick y Eddan coordinan evaluaciones, entrenamiento y seguridad de novatos del gremio.",
    tags: ["guild", "training"],
  }),
  relationship("npc_pavo", "npc_irma", {
    type: "market_familiarity",
    trust: 35,
    familiarity: 62,
    tension: 14,
    publicSummary: "Pavo e Irma se conocen del mercado y suelen intercambiar comentarios, noticias y exageraciones menores.",
    tags: ["market", "rumors"],
  }),
  relationship("npc_pavo", "npc_sella", {
    type: "market_neighbors",
    trust: 34,
    familiarity: 52,
    tension: 12,
    publicSummary: "Pavo y Sella son vecinos de mercado; se conocen por trato diario y clientes compartidos.",
    tags: ["market", "commerce"],
  }),
  relationship("npc_pavo", "npc_liora", {
    type: "market_neighbors",
    trust: 30,
    familiarity: 48,
    tension: 10,
    publicSummary: "Pavo y Liora se conocen como vendedores del mercado, con trato cordial y practico.",
    tags: ["market", "commerce"],
  }),
  relationship("npc_narek", "npc_maelis", {
    type: "temple_mentorship",
    trust: 70,
    familiarity: 76,
    tension: 5,
    publicSummary: "Narek y Maelis trabajan juntos en el Templo de la Llama Serena como cuidador y ayudante.",
    tags: ["temple", "work"],
  }),
  relationship("npc_kael", "npc_rulan_veck", {
    type: "guard_training",
    trust: 58,
    familiarity: 66,
    tension: 18,
    publicSummary: "Kael supervisa a Rulan como aprendiz de guardia en patrullas y tareas de orden local.",
    tags: ["guard", "training"],
  }),
  relationship("npc_celia_dorn", "npc_kael", {
    type: "civic_coordination",
    trust: 50,
    familiarity: 50,
    tension: 12,
    publicSummary: "Celia y Kael coordinan registros, denuncias simples y asuntos de orden publico cuando hace falta.",
    tags: ["council", "guard"],
  }),
];

const memories = [
  {
    memoryId: "memory_g4_roberto_lucas_grulla_worker",
    npcId: "npc_roberto_valen",
    fact: "Lucas trabaja en La Grulla Azul.",
    summary: "Roberto sabe que Lucas trabaja en La Grulla Azul.",
    sourceType: "public_record",
    certainty: "confirmed",
    emotionalWeight: "low",
    privacyLevel: "semi_private",
    canShare: false,
    importance: "normal",
    relatedNpcIds: ["npc_roberto_valen"],
    relatedLocationIds: ["loc_hoshimori_grulla_azul"],
    tags: ["g4", "hoshimori", "social_memory", SOURCE, "lucas_work"],
  },
  {
    memoryId: "memory_g4_fern_lucas_magic_awakened",
    npcId: "npc_fern",
    fact: "Lucas le conto a Fern que desperto mana o magia.",
    summary: "Fern sabe por Lucas que el desperto mana o magia; no es conocimiento publico.",
    sourceType: "told_by_lucas",
    certainty: "confirmed",
    emotionalWeight: "medium",
    privacyLevel: "private",
    canShare: false,
    importance: "important",
    relatedNpcIds: ["npc_fern"],
    relatedLocationIds: ["loc_hoshimori_grulla_azul"],
    tags: ["g4", "hoshimori", "social_memory", SOURCE, "lucas_magic", "private"],
  },
  {
    memoryId: "memory_g4_yara_lucas_grulla_worker",
    npcId: "npc_yara_mils",
    fact: "Yara conoce a Lucas como trabajador de la posada.",
    summary: "Yara ha visto a Lucas trabajando en La Grulla Azul.",
    sourceType: "saw",
    certainty: "confirmed",
    emotionalWeight: "low",
    privacyLevel: "semi_private",
    canShare: false,
    importance: "normal",
    relatedNpcIds: ["npc_yara_mils"],
    relatedLocationIds: ["loc_hoshimori_grulla_azul", "loc_hoshimori_grulla_azul_cocina"],
    tags: ["g4", "hoshimori", "social_memory", SOURCE, "lucas_work"],
  },
  {
    memoryId: "memory_g4_garrick_lucas_volunteer",
    npcId: "npc_garrick_thorne",
    fact: "Garrick conoce a Lucas por voluntariado y trato del gremio.",
    summary: "Garrick registra a Lucas como novato util que completo voluntariado relacionado con el gremio.",
    sourceType: "public_record",
    certainty: "confirmed",
    emotionalWeight: "low",
    privacyLevel: "semi_private",
    canShare: false,
    importance: "normal",
    relatedNpcIds: ["npc_garrick_thorne"],
    relatedLocationIds: ["loc_hoshimori_guild"],
    tags: ["g4", "hoshimori", "social_memory", SOURCE, "guild", "lucas_volunteer"],
  },
];

async function assertNpcsExist() {
  const npcIds = Array.from(
    new Set([
      ...relationships.flatMap((entry) => [entry.npcAId, entry.npcBId]),
      ...memories.map((entry) => entry.npcId),
    ])
  );

  const existing = await Npc.find({ npcId: { $in: npcIds } }).select("npcId").lean();
  const existingIds = new Set(existing.map((npc) => npc.npcId));
  const missing = npcIds.filter((npcId) => !existingIds.has(npcId));

  if (missing.length > 0) {
    throw new Error(`Missing NPCs required for G4 social seed: ${missing.join(", ")}`);
  }
}

async function seedHoshimoriSocialGraph() {
  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    throw new Error("MONGODB_URI is required to seed Hoshimori social graph.");
  }

  await assertNpcsExist();

  await NpcRelationship.bulkWrite(
    relationships.map((entry) => ({
      updateOne: {
        filter: { npcAId: entry.npcAId, npcBId: entry.npcBId },
        update: { $set: entry },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  await NpcMemory.bulkWrite(
    memories.map((entry) => {
      const { tags, ...memoryOnInsert } = entry;

      return {
        updateOne: {
          filter: { memoryId: entry.memoryId },
          update: {
            $set: {
              sourceId: SOURCE,
              tags,
            },
            $setOnInsert: {
              ...memoryOnInsert,
              shareConditions: [],
              createdDay: CREATED_DAY,
              createdTime: CREATED_TIME,
              lastReferencedDay: CREATED_DAY,
              decayType: "none",
            },
          },
          upsert: true,
        },
      };
    }),
    { ordered: false }
  );

  const expectedPairQueries = relationships.map(pairQuery);
  const relationshipQuery =
    expectedPairQueries.length > 0 ? { $or: expectedPairQueries } : { relationshipId: "__none__" };

  const [relationshipCount, markerRelationshipCount, memoryCount] = await Promise.all([
    NpcRelationship.countDocuments(relationshipQuery),
    NpcRelationship.countDocuments({
      source: SOURCE,
      tags: { $all: MARKER_TAGS },
    }),
    NpcMemory.countDocuments({ sourceId: SOURCE, tags: SOURCE }),
  ]);

  console.log("Hoshimori social graph seed completed.");
  console.log(`Expected relationships in seed: ${relationships.length}`);
  console.log(`Expected memories in seed: ${memories.length}`);
  console.log(`MongoDB G4 relationship pairs: ${relationshipCount}`);
  console.log(`MongoDB G4 relationships with marker: ${markerRelationshipCount}`);
  console.log(`MongoDB G4 memories: ${memoryCount}`);

  await mongoose.disconnect();
}

seedHoshimoriSocialGraph().catch(async (error) => {
  console.error("Error seeding Hoshimori social graph:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
