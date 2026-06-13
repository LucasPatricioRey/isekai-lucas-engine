try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for API-only checks, but MongoDB is required for full G11 checks.
}

const mongoose = require("mongoose");

const CharacterMagicKnowledge = require("../models/CharacterMagicKnowledge");
const CombatEncounter = require("../models/CombatEncounter");
const GameState = require("../models/GameState");
const Item = require("../models/Item");
const MagicDiscipline = require("../models/MagicDiscipline");
const MagicTechnique = require("../models/MagicTechnique");
const { MARKER_TAGS, SOURCE, disciplines: EXPECTED_DISCIPLINES, techniques: EXPECTED_TECHNIQUES } = require("../seeds/seedMagicBasics");
const { validateSkillPatch } = require("../services/skillProgressionService");

const BASE_URL =
  process.env.AUDIT_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  "https://isekai-lucas-engine.onrender.com";

const API_KEY = process.env.API_KEY || process.env.AUDIT_API_KEY || "dev-secret";

const BASIC_TECHNIQUE_IDS = [
  "technique_mana_breathing_basic",
  "technique_internal_flow_sense",
  "technique_mana_meditation_basic",
  "technique_magic_perception_basic",
  "technique_magic_structure_theory_beginner",
  "technique_safe_rest_channeling",
];

const ADVANCED_TECHNIQUE_ID = "technique_locked_offensive_spark";
const MAGIC_ITEM_REGEX = /magia|mana|hechizo|arcano|magico|magica|magic|spell/i;

function endpoint(path) {
  return `${BASE_URL}${path}`;
}

async function request(path, options = {}) {
  const response = await fetch(endpoint(path), {
    ...options,
    headers: {
      "x-api-key": API_KEY,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(`${path} failed with HTTP ${response.status}`);
    error.response = data;
    throw error;
  }

  return data;
}

async function post(path, body) {
  return request(path, {
    method: "POST",
    body: JSON.stringify(body || {}),
  });
}

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function assertEqual(issues, label, actual, expected) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${actual} (expected ${expected})`);
  if (!ok) issues.push(`${label}: got ${actual}, expected ${expected}`);
}

function assertTrue(issues, label, condition, evidence = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${evidence ? `: ${evidence}` : ""}`);
  if (!condition) issues.push(label);
}

function summarizeGameState(context) {
  const gameState = context.context?.gameState || {};
  return {
    currentDay: gameState.currentDay,
    time: gameState.time,
    locationId: gameState.locationId,
    moneyCopper: gameState.moneyCopper,
    mpCurrent: gameState.lucasStatus?.mp?.current,
    activeMissionIds: gameState.activeMissionIds || [],
    knownSpells: gameState.flags?.knownSpells || [],
  };
}

async function assertMongoAvailable() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:magic-basics.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
}

function hasAquaApplied(preview) {
  return (preview?.validation?.multiplierParts || []).some((part) => part.id === "aqua" && part.applied === true);
}

async function main() {
  const issues = [];

  console.log("Magic basics audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: read-only API and MongoDB queries.");

  const [
    beforeContext,
    activeCombats,
    disciplinesEndpoint,
    techniquesEndpoint,
    manaTechnique,
    manaPreview,
    perceptionPreview,
    advancedPreview,
  ] = await Promise.all([
    request("/api/context/full"),
    request("/api/combat/encounters/active"),
    request("/api/magic/disciplines"),
    request("/api/magic/techniques"),
    request("/api/magic/techniques/technique_mana_breathing_basic"),
    post("/api/magic/practice/preview", {
      techniqueId: "technique_mana_breathing_basic",
      minutes: 30,
    }),
    post("/api/magic/practice/preview", {
      techniqueId: "technique_magic_perception_basic",
      minutes: 30,
    }),
    post("/api/magic/practice/preview", {
      techniqueId: ADVANCED_TECHNIQUE_ID,
      minutes: 10,
    }),
  ]);
  const afterContext = await request("/api/context/full");

  const beforeState = summarizeGameState(beforeContext);
  const afterState = summarizeGameState(afterContext);
  const activeCombatList = activeCombats.encounters || [];

  section("Canon State From API");
  console.log(
    JSON.stringify(
      {
        beforeState,
        afterState,
        activeCombatCount: activeCombatList.length,
      },
      null,
      2
    )
  );

  assertTrue(issues, "day is valid", Number.isInteger(beforeState.currentDay) && beforeState.currentDay >= 1, String(beforeState.currentDay));
  assertTrue(issues, "time is valid", /^([01]\d|2[0-3]):[0-5]\d$/.test(beforeState.time || ""), beforeState.time);
  assertTrue(issues, "locationId is present", typeof beforeState.locationId === "string" && beforeState.locationId.length > 0, beforeState.locationId);
  assertTrue(issues, "moneyCopper is non-negative", Number.isInteger(beforeState.moneyCopper) && beforeState.moneyCopper >= 0, String(beforeState.moneyCopper));
  assertTrue(issues, "mp current is readable", Number.isInteger(beforeState.mpCurrent) && beforeState.mpCurrent >= 0, String(beforeState.mpCurrent));
  assertTrue(issues, "activeMissionIds is readable", Array.isArray(beforeState.activeMissionIds), String(beforeState.activeMissionIds.length));
  assertTrue(issues, "active combat count is readable", Number.isInteger(activeCombatList.length), String(activeCombatList.length));
  assertEqual(issues, "post-preview time unchanged", afterState.time, beforeState.time);
  assertEqual(issues, "post-preview money unchanged", afterState.moneyCopper, beforeState.moneyCopper);
  assertEqual(issues, "post-preview MP unchanged", afterState.mpCurrent, beforeState.mpCurrent);
  assertEqual(issues, "post-preview knownSpells count unchanged", afterState.knownSpells.length, beforeState.knownSpells.length);

  section("Magic API Coverage");
  assertTrue(
    issues,
    "disciplines endpoint has expected count",
    (disciplinesEndpoint.disciplines || []).length >= EXPECTED_DISCIPLINES.length,
    `${(disciplinesEndpoint.disciplines || []).length} disciplines`
  );
  assertTrue(
    issues,
    "techniques endpoint has expected count",
    (techniquesEndpoint.techniques || []).length >= EXPECTED_TECHNIQUES.length,
    `${(techniquesEndpoint.techniques || []).length} techniques`
  );
  assertEqual(issues, "technique detail id", manaTechnique.technique?.techniqueId, "technique_mana_breathing_basic");

  const apiDisciplineIds = new Set((disciplinesEndpoint.disciplines || []).map((entry) => entry.disciplineId));
  const apiTechniqueIds = new Set((techniquesEndpoint.techniques || []).map((entry) => entry.techniqueId));

  assertTrue(
    issues,
    "all expected discipline ids exposed",
    EXPECTED_DISCIPLINES.every((entry) => apiDisciplineIds.has(entry.disciplineId))
  );
  assertTrue(
    issues,
    "all basic technique ids exposed",
    BASIC_TECHNIQUE_IDS.every((techniqueId) => apiTechniqueIds.has(techniqueId))
  );

  section("Practice Preview Checks");
  const manaSkillPreview = (manaPreview.preview?.skillPreviews || []).find((entry) => entry.skillId === "skill_mana");
  const perceptionSkillPreview = (perceptionPreview.preview?.skillPreviews || []).find(
    (entry) => entry.skillId === "skill_percepcion_magica"
  );

  assertEqual(issues, "mana preview canPractice", manaPreview.preview?.canPractice, true);
  assertEqual(issues, "mana preview mpCost", manaPreview.preview?.mpCost, 0);
  assertEqual(issues, "mana preview unlock spell", manaPreview.preview?.unlocks?.willLearnSpell, false);
  assertTrue(issues, "mana preview applies Aqua", hasAquaApplied(manaSkillPreview));
  assertEqual(issues, "perception preview canPractice", perceptionPreview.preview?.canPractice, true);
  assertEqual(issues, "perception preview mpCost", perceptionPreview.preview?.mpCost, 5);
  assertEqual(
    issues,
    "perception preview projected MP after",
    perceptionPreview.preview?.projectedMp?.after,
    Math.max(0, beforeState.mpCurrent - 5)
  );
  assertEqual(issues, "perception preview actual MP will not mutate", perceptionPreview.preview?.projectedMp?.willMutate, false);
  assertTrue(
    issues,
    "perception preview has skill progression",
    Boolean(perceptionSkillPreview?.progression),
    JSON.stringify(perceptionSkillPreview || {})
  );
  assertTrue(issues, "perception preview applies Aqua", hasAquaApplied(perceptionSkillPreview));
  assertEqual(issues, "advanced preview blocked", advancedPreview.preview?.canPractice, false);
  assertTrue(
    issues,
    "advanced preview has blocked reason",
    (advancedPreview.preview?.blockingReasons || []).length > 0,
    advancedPreview.preview?.blockedReason || ""
  );
  assertEqual(issues, "advanced preview no MP spend", advancedPreview.preview?.projectedMp?.delta, 0);
  assertEqual(issues, "advanced preview no spell unlock", advancedPreview.preview?.unlocks?.willLearnSpell, false);

  section("Aqua Safety");
  const aquaPhysical = validateSkillPatch({
    skillId: "skill_fuerza",
    expDelta: 10,
    category: "entreno_intenso",
    modifiers: { aquaBlessing: true },
    currentEnergy: 80,
    currentPhase: "Principiante",
  });
  const aquaMagic = validateSkillPatch({
    skillId: "skill_mana",
    expDelta: 4,
    category: "practica_basica_1h_solo",
    modifiers: { aquaBlessing: true },
    currentEnergy: 80,
    currentPhase: "Principiante",
  });

  assertEqual(issues, "Aqua physical effective EXP", aquaPhysical.effectiveExpDelta, 50);
  assertTrue(issues, "Aqua physical is not applied", aquaPhysical.multiplierParts.some((part) => part.id === "aqua" && part.applied === false));
  assertEqual(issues, "Aqua magic effective EXP", aquaMagic.effectiveExpDelta, 40);

  await assertMongoAvailable();

  const [dbGameState, dbActiveCombatCount, liveDisciplines, liveTechniques, g11DisciplineCount, g11TechniqueCount] =
    await Promise.all([
      GameState.findOne({ gameId: "isekai_lucas_main" }).lean(),
      CombatEncounter.countDocuments({ gameId: "isekai_lucas_main", status: "active" }),
      MagicDiscipline.find({ disciplineId: { $in: EXPECTED_DISCIPLINES.map((entry) => entry.disciplineId) } }).lean(),
      MagicTechnique.find({ techniqueId: { $in: EXPECTED_TECHNIQUES.map((entry) => entry.techniqueId) } }).lean(),
      MagicDiscipline.countDocuments({ source: SOURCE, tags: { $all: MARKER_TAGS } }),
      MagicTechnique.countDocuments({ source: SOURCE, tags: { $all: MARKER_TAGS } }),
    ]);

  section("Canon State From MongoDB");
  assertEqual(issues, "db day matches API", dbGameState?.currentDay, afterState.currentDay);
  assertEqual(issues, "db time matches API", dbGameState?.time, afterState.time);
  assertEqual(issues, "db locationId matches API", dbGameState?.locationId, afterState.locationId);
  assertEqual(issues, "db moneyCopper matches API", dbGameState?.moneyCopper, afterState.moneyCopper);
  assertEqual(issues, "db MP current matches API", dbGameState?.lucasStatus?.mp?.current, afterState.mpCurrent);
  assertEqual(issues, "db active combat count matches API", dbActiveCombatCount, activeCombatList.length);
  assertEqual(issues, "db knownSpells count matches API", (dbGameState?.flags?.knownSpells || []).length, afterState.knownSpells.length);

  section("G11 Data Coverage");
  assertEqual(issues, "expected G11 discipline count by id", liveDisciplines.length, EXPECTED_DISCIPLINES.length);
  assertEqual(issues, "expected G11 technique count by id", liveTechniques.length, EXPECTED_TECHNIQUES.length);
  assertEqual(issues, "G11 discipline marker count", g11DisciplineCount, EXPECTED_DISCIPLINES.length);
  assertEqual(issues, "G11 technique marker count", g11TechniqueCount, EXPECTED_TECHNIQUES.length);

  const liveDisciplineIds = new Set(liveDisciplines.map((entry) => entry.disciplineId));
  const missingTechniqueDisciplineRefs = liveTechniques
    .map((entry) => entry.disciplineId)
    .filter((disciplineId) => !liveDisciplineIds.has(disciplineId));
  assertEqual(issues, "missing technique discipline refs", missingTechniqueDisciplineRefs.length, 0);

  section("Safety Checks");
  const knowledge = await CharacterMagicKnowledge.find({
    characterId: "char_lucas",
    status: { $in: ["practicing", "known", "mastered"] },
  }).lean();
  const knownTechniqueIds = knowledge.map((entry) => entry.techniqueId);
  const knownTechniques = knownTechniqueIds.length
    ? await MagicTechnique.find({ techniqueId: { $in: knownTechniqueIds } }).lean()
    : [];
  const advancedKnown = knownTechniques.filter(
    (entry) => entry.isAdvanced || entry.isRealSpell || entry.kind === "spell"
  );
  const g11MagicItems = await Item.find({ tags: { $in: [SOURCE, "g11"] } }).lean();
  const commonMagicItems = g11MagicItems.filter((item) => {
    const text = [item.itemId, item.name, item.type, item.subtype, item.description, ...(item.tags || [])].join(" ");
    return MAGIC_ITEM_REGEX.test(text);
  });

  assertEqual(issues, "advanced/real spell known count", advancedKnown.length, 0);
  assertEqual(issues, "G11 magic item count", g11MagicItems.length, 0);
  assertEqual(issues, "G11 common magic-like item count", commonMagicItems.length, 0);

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Magic basics audit failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  await mongoose.disconnect();
  console.log("Magic basics audit OK. No state was mutated.");
}

main().catch(async (error) => {
  console.error("\nMagic basics audit crashed:");
  console.error(error.message);
  if (error.response) console.error(JSON.stringify(error.response, null, 2));
  await mongoose.disconnect();
  process.exit(1);
});
