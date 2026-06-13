require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");
const connectDB = require("../config/db");

const MagicDiscipline = require("../models/MagicDiscipline");
const MagicTechnique = require("../models/MagicTechnique");

const SOURCE = "g11_magic_basics_seed";
const MARKER_TAGS = ["g11", "magic", "basics"];

function tags(extra = []) {
  return Array.from(new Set([...MARKER_TAGS, SOURCE, ...extra]));
}

function skill(skillId, minLevel = 1, minPhase = "Principiante") {
  return { skillId, minPhase, minLevel };
}

function discipline(disciplineId, data) {
  return {
    disciplineId,
    name: data.name,
    parentDisciplineId: data.parentDisciplineId || "",
    type: data.type || "branch",
    description: data.description || "",
    unlockRequirements: data.unlockRequirements || { skills: [], notes: "" },
    socialRisk: data.socialRisk || "low",
    order: data.order || 0,
    source: SOURCE,
    tags: tags(data.tags || []),
  };
}

function technique(techniqueId, data) {
  return {
    techniqueId,
    name: data.name,
    disciplineId: data.disciplineId,
    kind: data.kind,
    status: data.status || "available",
    description: data.description || "",
    defaultMinutes: data.defaultMinutes || 30,
    minMinutes: data.minMinutes || 5,
    maxMinutes: data.maxMinutes || 120,
    activityCategory: data.activityCategory || "descanso_sentado",
    difficulty: data.difficulty || "basic",
    mpCost: data.mpCost || { fixed: 0, min: 0, max: 0, notes: "" },
    requirements: data.requirements || { skills: [], knownTechniqueIds: [], notes: "" },
    expSuggestions: data.expSuggestions || [],
    isRealSpell: Boolean(data.isRealSpell),
    isAdvanced: Boolean(data.isAdvanced),
    isOffensive: Boolean(data.isOffensive),
    canUnlockAutomatically: Boolean(data.canUnlockAutomatically),
    publicUseRisk: data.publicUseRisk || "low",
    safetyNotes: data.safetyNotes || [],
    source: SOURCE,
    tags: tags(data.tags || []),
  };
}

const disciplines = [
  discipline("discipline_mana", {
    name: "Mana",
    type: "foundation",
    description: "Sensibilidad, reserva y circulacion interna de mana.",
    socialRisk: "low",
    order: 1,
    tags: ["foundation"],
  }),
  discipline("discipline_magic", {
    name: "Magia",
    type: "foundation",
    description: "Estructura, teoria y conversion controlada de mana en efecto.",
    unlockRequirements: { skills: [skill("skill_mana", 1)], notes: "Requiere mana despertado." },
    socialRisk: "medium",
    order: 2,
    tags: ["foundation"],
  }),
  discipline("discipline_magic_perception", {
    name: "Percepcion magica",
    type: "sense",
    description: "Lectura basica de sensaciones y flujo magico sin interpretacion avanzada.",
    unlockRequirements: { skills: [skill("skill_mana", 1), skill("skill_magia", 1)], notes: "" },
    socialRisk: "low",
    order: 3,
    tags: ["sense"],
  }),
  discipline("discipline_offensive_magic", {
    name: "Magia ofensiva",
    parentDisciplineId: "discipline_magic",
    type: "branch",
    description: "Rama de efectos de dano o presion; no es segura para practica publica.",
    unlockRequirements: { skills: [skill("skill_magia", 2), skill("skill_mana", 2)], notes: "" },
    socialRisk: "high",
    order: 4,
    tags: ["offense", "restricted"],
  }),
  discipline("discipline_fire", {
    name: "Fuego",
    parentDisciplineId: "discipline_offensive_magic",
    type: "element",
    description: "Elemento ofensivo de calor y llama; bloqueado para Lucas sin instructor.",
    unlockRequirements: { skills: [skill("skill_magia_ofensiva", 2), skill("skill_mana", 3)], notes: "" },
    socialRisk: "high",
    order: 5,
    tags: ["element", "locked"],
  }),
  discipline("discipline_lightning", {
    name: "Rayo/Electricidad",
    parentDisciplineId: "discipline_offensive_magic",
    type: "element",
    description: "Elemento de descarga y conduccion; requiere control ofensivo previo.",
    unlockRequirements: { skills: [skill("skill_magia_ofensiva", 3), skill("skill_mana", 3)], notes: "" },
    socialRisk: "high",
    order: 6,
    tags: ["element", "locked"],
  }),
  discipline("discipline_ice", {
    name: "Hielo",
    parentDisciplineId: "discipline_offensive_magic",
    type: "element",
    description: "Elemento de frio y cristalizacion simple; no disponible para Lucas todavia.",
    unlockRequirements: { skills: [skill("skill_magia_ofensiva", 2), skill("skill_mana", 3)], notes: "" },
    socialRisk: "high",
    order: 7,
    tags: ["element", "locked"],
  }),
  discipline("discipline_earth_wind", {
    name: "Tierra/Viento",
    parentDisciplineId: "discipline_offensive_magic",
    type: "element",
    description: "Rama elemental mixta de fuerza fisica y movimiento de aire/tierra.",
    unlockRequirements: {
      skills: [skill("skill_magia_ofensiva", 4), skill("skill_magia", 4), skill("skill_mana", 4)],
      notes: "",
    },
    socialRisk: "high",
    order: 8,
    tags: ["element", "locked"],
  }),
  discipline("discipline_defensive_magic", {
    name: "Magia defensiva",
    parentDisciplineId: "discipline_magic",
    type: "branch",
    description: "Rama de proteccion, resistencia y mitigacion.",
    unlockRequirements: { skills: [skill("skill_magia", 3), skill("skill_mana", 3)], notes: "" },
    socialRisk: "medium",
    order: 9,
    tags: ["defense", "locked"],
  }),
  discipline("discipline_healing_magic", {
    name: "Magia curativa",
    parentDisciplineId: "discipline_magic",
    type: "branch",
    description: "Rama regulada y rara; no equivale a curacion milagrosa gratuita.",
    unlockRequirements: { skills: [skill("skill_magia", 5), skill("skill_mana", 5)], notes: "" },
    socialRisk: "high",
    order: 10,
    tags: ["healing", "locked"],
  }),
  discipline("discipline_mental_magic", {
    name: "Magia mental",
    parentDisciplineId: "discipline_magic",
    type: "specialized",
    description: "Rama socialmente sensible; requiere gran control y percepcion.",
    unlockRequirements: {
      skills: [skill("skill_magia", 5, "Novato"), skill("skill_mana", 5, "Novato"), skill("skill_percepcion", 8)],
      notes: "",
    },
    socialRisk: "high",
    order: 11,
    tags: ["mental", "locked"],
  }),
  discipline("discipline_summoning_magic", {
    name: "Magia de invocacion",
    parentDisciplineId: "discipline_magic",
    type: "specialized",
    description: "Rama avanzada de pactos o llamados; fuera del alcance actual.",
    unlockRequirements: {
      skills: [
        skill("skill_magia", 3, "Competente"),
        skill("skill_mana", 3, "Competente"),
        skill("skill_percepcion_magica", 8, "Novato"),
      ],
      notes: "",
    },
    socialRisk: "high",
    order: 12,
    tags: ["summoning", "locked"],
  }),
];

const techniques = [
  technique("technique_mana_breathing_basic", {
    name: "Respiracion de mana basica",
    disciplineId: "discipline_mana",
    kind: "practice",
    description: "Ejercicio tranquilo para ordenar respiracion y atencion interna. No produce efecto visible.",
    defaultMinutes: 30,
    minMinutes: 10,
    maxMinutes: 60,
    activityCategory: "descanso_sentado",
    difficulty: "safe",
    mpCost: { fixed: 0, min: 0, max: 0, notes: "Sin coste MP si se hace con calma." },
    requirements: { skills: [skill("skill_mana", 1)], knownTechniqueIds: [], notes: "Mana despertado." },
    expSuggestions: [
      {
        skillId: "skill_mana",
        skillName: "Mana",
        category: "practica_basica_10_30min",
        baseExp: 4,
        reason: "Practica basica de mana de 30 minutos.",
      },
    ],
    publicUseRisk: "none",
    safetyNotes: ["No desbloquea hechizos.", "No genera efectos visibles si se practica en reposo."],
    tags: ["initial", "safe", "no_spell_unlock"],
  }),
  technique("technique_internal_flow_sense", {
    name: "Sentir flujo interno",
    disciplineId: "discipline_mana",
    kind: "exercise",
    description: "Ejercicio para notar sensaciones internas de mana sin forzar salida ni efecto externo.",
    defaultMinutes: 20,
    minMinutes: 10,
    maxMinutes: 45,
    activityCategory: "descanso_sentado",
    difficulty: "safe",
    mpCost: { fixed: 0, min: 0, max: 0, notes: "" },
    requirements: { skills: [skill("skill_mana", 1)], knownTechniqueIds: [], notes: "" },
    expSuggestions: [
      {
        skillId: "skill_mana",
        skillName: "Mana",
        category: "practica_basica_10_30min",
        baseExp: 3,
        reason: "Sentir mana interno sin canalizar.",
      },
    ],
    publicUseRisk: "none",
    safetyNotes: ["No empujar mana fuera del cuerpo.", "Detener si causa mareo."],
    tags: ["initial", "safe", "internal"],
  }),
  technique("technique_mana_meditation_basic", {
    name: "Meditacion de mana",
    disciplineId: "discipline_mana",
    kind: "practice",
    description: "Meditacion profunda para estabilizar la atencion sobre la reserva de mana.",
    defaultMinutes: 60,
    minMinutes: 30,
    maxMinutes: 90,
    activityCategory: "descanso_acostado",
    difficulty: "safe",
    mpCost: { fixed: 0, min: 0, max: 0, notes: "" },
    requirements: { skills: [skill("skill_mana", 1)], knownTechniqueIds: [], notes: "" },
    expSuggestions: [
      {
        skillId: "skill_mana",
        skillName: "Mana",
        category: "meditacion_profunda_1h",
        baseExp: 6,
        reason: "Meditacion de mana de una hora.",
      },
    ],
    publicUseRisk: "none",
    safetyNotes: ["No reemplaza descanso completo.", "No desbloquea hechizos por si misma."],
    tags: ["initial", "safe", "meditation"],
  }),
  technique("technique_magic_perception_basic", {
    name: "Percepcion magica basica",
    disciplineId: "discipline_magic_perception",
    kind: "exercise",
    description: "Observar sensaciones de flujo sin interpretar hilos avanzados ni rastros complejos.",
    defaultMinutes: 30,
    minMinutes: 10,
    maxMinutes: 45,
    activityCategory: "descanso_sentado",
    difficulty: "basic",
    mpCost: { fixed: 5, min: 5, max: 5, notes: "Coste orientativo de percepcion magica basica." },
    requirements: { skills: [skill("skill_mana", 1), skill("skill_magia", 1)], knownTechniqueIds: [], notes: "" },
    expSuggestions: [
      {
        skillId: "skill_percepcion_magica",
        skillName: "Percepcion magica",
        category: "practica_percepcion_magica_30min",
        baseExp: 8,
        reason: "Percepcion magica basica de 30 minutos.",
        allowVirtualSkillPreview: true,
      },
    ],
    publicUseRisk: "low",
    safetyNotes: ["No permite ver hilos avanzados.", "No identifica hechizos complejos."],
    tags: ["initial", "safe", "perception"],
  }),
  technique("technique_magic_structure_theory_beginner", {
    name: "Teoria de estructura magica principiante",
    disciplineId: "discipline_magic",
    kind: "theory",
    description: "Estudio conceptual sobre forma, intencion y limite. No crea efectos por si solo.",
    defaultMinutes: 30,
    minMinutes: 15,
    maxMinutes: 90,
    activityCategory: "descanso_sentado",
    difficulty: "safe",
    mpCost: { fixed: 0, min: 0, max: 0, notes: "" },
    requirements: { skills: [skill("skill_magia", 1), skill("skill_mana", 1)], knownTechniqueIds: [], notes: "" },
    expSuggestions: [
      {
        skillId: "skill_magia",
        skillName: "Magia",
        category: "leer_teoria_30min",
        baseExp: 2,
        reason: "Teoria principiante durante 30 minutos.",
      },
    ],
    publicUseRisk: "none",
    safetyNotes: ["Teoria no equivale a hechizo.", "Requiere practica guiada para efectos reales."],
    tags: ["initial", "safe", "theory"],
  }),
  technique("technique_safe_rest_channeling", {
    name: "Canalizacion segura en reposo",
    disciplineId: "discipline_mana",
    kind: "practice",
    description: "Mover atencion y mana de forma contenida en reposo, sin proyeccion externa.",
    defaultMinutes: 30,
    minMinutes: 15,
    maxMinutes: 45,
    activityCategory: "descanso_sentado",
    difficulty: "basic",
    mpCost: { fixed: 0, min: 0, max: 0, notes: "Sin coste si no se fuerza salida externa." },
    requirements: { skills: [skill("skill_mana", 1), skill("skill_magia", 1)], knownTechniqueIds: [], notes: "" },
    expSuggestions: [
      {
        skillId: "skill_mana",
        skillName: "Mana",
        category: "practica_basica_10_30min",
        baseExp: 4,
        reason: "Canalizacion contenida y segura.",
      },
    ],
    publicUseRisk: "low",
    safetyNotes: ["No proyectar mana al ambiente.", "No crea luz, fuego, curacion ni defensa real."],
    tags: ["initial", "safe", "channeling"],
  }),
  technique("technique_locked_offensive_spark", {
    name: "Chispa ofensiva controlada",
    disciplineId: "discipline_fire",
    kind: "spell",
    status: "locked_template",
    description: "Plantilla bloqueada de efecto ofensivo minimo. No esta aprendida por Lucas.",
    defaultMinutes: 10,
    minMinutes: 10,
    maxMinutes: 10,
    activityCategory: "actividad_normal",
    difficulty: "advanced",
    mpCost: { fixed: 15, min: 15, max: 15, notes: "No debe gastarse en preview bloqueada." },
    requirements: {
      skills: [skill("skill_magia_ofensiva", 3), skill("skill_mana", 3)],
      knownTechniqueIds: [],
      notes: "Requiere rama ofensiva y control de mana mayor al actual.",
    },
    expSuggestions: [
      {
        skillId: "skill_magia_ofensiva",
        skillName: "Magia ofensiva",
        category: "uso_hechizo_ofensivo_conocido",
        baseExp: 3,
        reason: "Uso o practica de chispa ofensiva ya conocida.",
        allowVirtualSkillPreview: true,
      },
    ],
    isRealSpell: true,
    isAdvanced: true,
    isOffensive: true,
    canUnlockAutomatically: false,
    publicUseRisk: "high",
    safetyNotes: ["Bloqueado para Lucas.", "No practicar en publico.", "No desbloquear automaticamente."],
    tags: ["locked", "spell_template", "offensive", "not_learned"],
  }),
];

async function assertTechniqueDisciplinesExist() {
  const disciplineIds = new Set(disciplines.map((entry) => entry.disciplineId));
  const missing = techniques
    .map((entry) => entry.disciplineId)
    .filter((disciplineId) => !disciplineIds.has(disciplineId));

  if (missing.length > 0) {
    throw new Error(`Technique discipline refs not in seed: ${Array.from(new Set(missing)).join(", ")}`);
  }
}

async function seedMagicBasics() {
  await connectDB();

  if (mongoose.connection.readyState !== 1) {
    throw new Error("MONGODB_URI is required to seed magic basics.");
  }

  await assertTechniqueDisciplinesExist();

  await MagicDiscipline.bulkWrite(
    disciplines.map((entry) => ({
      updateOne: {
        filter: { disciplineId: entry.disciplineId },
        update: { $set: entry },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  await MagicTechnique.bulkWrite(
    techniques.map((entry) => ({
      updateOne: {
        filter: { techniqueId: entry.techniqueId },
        update: { $set: entry },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  const [disciplineCount, techniqueCount] = await Promise.all([
    MagicDiscipline.countDocuments({ source: SOURCE, tags: { $all: MARKER_TAGS } }),
    MagicTechnique.countDocuments({ source: SOURCE, tags: { $all: MARKER_TAGS } }),
  ]);

  console.log("Magic basics seed completed.");
  console.log(`Expected G11 disciplines in seed: ${disciplines.length}`);
  console.log(`Expected G11 techniques in seed: ${techniques.length}`);
  console.log(`MongoDB G11 disciplines found: ${disciplineCount}`);
  console.log(`MongoDB G11 techniques found: ${techniqueCount}`);

  await mongoose.disconnect();
}

if (require.main === module) {
  seedMagicBasics().catch(async (error) => {
    console.error("Error seeding magic basics:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  });
}

module.exports = {
  MARKER_TAGS,
  SOURCE,
  disciplines,
  techniques,
  seedMagicBasics,
};
