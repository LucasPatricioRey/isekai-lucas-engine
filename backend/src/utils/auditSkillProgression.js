try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional for API-only checks, but MongoDB is required for full G10 checks.
}

const mongoose = require("mongoose");

const CombatEncounter = require("../models/CombatEncounter");
const GameState = require("../models/GameState");
const {
  applySkillExpPreview,
  previewSkillProgression,
  validateSkillPatch,
} = require("../services/skillProgressionService");

const BASE_URL =
  process.env.AUDIT_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  "https://isekai-lucas-engine.onrender.com";

const API_KEY = process.env.API_KEY || process.env.AUDIT_API_KEY || "dev-secret";

const EXPECTED_STATE = {
  day: 10,
  time: "12:00",
  locationId: "loc_hoshimori_grulla_azul_comedor",
  moneyCopper: 1470,
  activeCombatCount: 0,
};

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

async function assertMongoAvailable() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:skill-progression.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
}

function summarizeGameState(context) {
  const gameState = context.context?.gameState || {};
  const skills = Object.fromEntries((gameState.skills || []).map((skill) => [skill.skillId, skill.exp]));

  return {
    currentDay: gameState.currentDay,
    time: gameState.time,
    locationId: gameState.locationId,
    moneyCopper: gameState.moneyCopper,
    skills,
  };
}

async function main() {
  const issues = [];

  console.log("Skill progression audit");
  console.log(`Base URL: ${BASE_URL}`);
  console.log("Mode: read-only API and MongoDB queries.");

  section("Service Preview Checks");
  const levelPreview = applySkillExpPreview(
    {
      skillId: "skill_fuerza",
      name: "Fuerza",
      phase: "Principiante",
      level: 6,
      exp: 96,
      expToNext: 100,
    },
    10
  );

  assertEqual(issues, "level-up phase", levelPreview.after.phase, "Principiante");
  assertEqual(issues, "level-up level", levelPreview.after.level, 7);
  assertEqual(issues, "level-up exp remainder", levelPreview.after.exp, 6);

  const phasePreview = applySkillExpPreview(
    {
      skillId: "skill_fuerza",
      name: "Fuerza",
      phase: "Principiante",
      level: 10,
      exp: 98,
      expToNext: 100,
    },
    5
  );

  assertEqual(issues, "phase change", phasePreview.after.phase, "Novato");
  assertEqual(issues, "phase change level", phasePreview.after.level, 1);
  assertEqual(issues, "phase change exp remainder", phasePreview.after.exp, 3);
  assertEqual(issues, "phase change expToNext", phasePreview.after.expToNext, 250);

  const aquaPhysical = validateSkillPatch({
    skillId: "skill_fuerza",
    expDelta: 10,
    category: "entreno_intenso",
    modifiers: { aquaBlessing: true },
    currentEnergy: 80,
  });
  const aquaMagic = validateSkillPatch({
    skillId: "skill_mana",
    expDelta: 4,
    category: "practica_basica_1h_solo",
    modifiers: { aquaBlessing: true },
    currentEnergy: 80,
  });
  const lowEnergy = validateSkillPatch({
    skillId: "skill_resistencia",
    expDelta: 10,
    category: "entreno_intenso",
    modifiers: {},
    currentEnergy: 25,
  });

  assertEqual(issues, "Aqua physical effective EXP", aquaPhysical.effectiveExpDelta, 10);
  assertTrue(issues, "Aqua physical is noted as not applied", aquaPhysical.multiplierParts.some((part) => part.id === "aqua" && part.applied === false));
  assertEqual(issues, "Aqua magic effective EXP", aquaMagic.effectiveExpDelta, 20);
  assertEqual(issues, "low energy effective EXP", lowEnergy.effectiveExpDelta, 6);

  const servicePreview = previewSkillProgression({
    skill: {
      skillId: "skill_mana",
      name: "Mana",
      phase: "Principiante",
      level: 1,
      exp: 35,
      expToNext: 100,
    },
    expDelta: 4,
    category: "practica_basica_1h_solo",
    modifiers: { aquaBlessing: true },
    currentEnergy: 80,
  });

  assertEqual(issues, "service preview mana after exp", servicePreview.progression.after.exp, 55);

  const [beforeContext, activeCombats, apiLevelPreview, apiAquaPhysical, apiAquaMagic] = await Promise.all([
    request("/api/context/full"),
    request("/api/combat/encounters/active"),
    post("/api/progression/skills/preview", {
      skill: {
        skillId: "skill_fuerza",
        name: "Fuerza",
        phase: "Principiante",
        level: 6,
        exp: 96,
        expToNext: 100,
      },
      category: "entreno_intenso",
      expDelta: 10,
      currentEnergy: 80,
    }),
    post("/api/progression/skills/preview", {
      skillId: "skill_fuerza",
      category: "entreno_intenso",
      expDelta: 10,
      modifiers: { aquaBlessing: true },
      currentEnergy: 80,
    }),
    post("/api/progression/skills/preview", {
      skillId: "skill_mana",
      category: "practica_basica_1h_solo",
      expDelta: 4,
      modifiers: { aquaBlessing: true },
      currentEnergy: 80,
    }),
  ]);
  const afterContext = await request("/api/context/full");
  const beforeState = summarizeGameState(beforeContext);
  const afterState = summarizeGameState(afterContext);
  const activeCombatList = activeCombats.encounters || [];

  section("API Preview");
  console.log(
    JSON.stringify(
      {
        beforeState,
        afterState,
        apiLevelAfter: apiLevelPreview.preview?.progression?.after,
        aquaPhysicalEffective: apiAquaPhysical.preview?.validation?.effectiveExpDelta,
        aquaMagicEffective: apiAquaMagic.preview?.validation?.effectiveExpDelta,
        activeCombatCount: activeCombatList.length,
      },
      null,
      2
    )
  );

  assertEqual(issues, "api level-up after level", apiLevelPreview.preview?.progression?.after?.level, 7);
  assertEqual(issues, "api level-up after exp", apiLevelPreview.preview?.progression?.after?.exp, 6);
  assertEqual(issues, "api Aqua physical effective", apiAquaPhysical.preview?.validation?.effectiveExpDelta, 10);
  assertEqual(issues, "api Aqua magic effective", apiAquaMagic.preview?.validation?.effectiveExpDelta, 20);
  assertEqual(issues, "api day", beforeState.currentDay, EXPECTED_STATE.day);
  assertEqual(issues, "api time", beforeState.time, EXPECTED_STATE.time);
  assertEqual(issues, "api locationId", beforeState.locationId, EXPECTED_STATE.locationId);
  assertEqual(issues, "api moneyCopper", beforeState.moneyCopper, EXPECTED_STATE.moneyCopper);
  assertEqual(issues, "api active combat count", activeCombatList.length, EXPECTED_STATE.activeCombatCount);
  assertEqual(issues, "post-preview time unchanged", afterState.time, beforeState.time);
  assertEqual(issues, "post-preview money unchanged", afterState.moneyCopper, beforeState.moneyCopper);
  assertEqual(issues, "post-preview fuerza exp unchanged", afterState.skills.skill_fuerza, beforeState.skills.skill_fuerza);
  assertEqual(issues, "post-preview mana exp unchanged", afterState.skills.skill_mana, beforeState.skills.skill_mana);

  await assertMongoAvailable();

  const [dbGameState, dbActiveCombatCount] = await Promise.all([
    GameState.findOne({ gameId: "isekai_lucas_main" }).lean(),
    CombatEncounter.countDocuments({ gameId: "isekai_lucas_main", status: "active" }),
  ]);

  section("Canon State From MongoDB");
  assertEqual(issues, "db day", dbGameState?.currentDay, EXPECTED_STATE.day);
  assertEqual(issues, "db time", dbGameState?.time, EXPECTED_STATE.time);
  assertEqual(issues, "db locationId", dbGameState?.locationId, EXPECTED_STATE.locationId);
  assertEqual(issues, "db moneyCopper", dbGameState?.moneyCopper, EXPECTED_STATE.moneyCopper);
  assertEqual(issues, "db active combat count", dbActiveCombatCount, EXPECTED_STATE.activeCombatCount);

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Skill progression audit failed:");
    for (const issue of issues) console.error(`- ${issue}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  await mongoose.disconnect();
  console.log("Skill progression audit OK. No state was mutated.");
}

main().catch(async (error) => {
  console.error("\nSkill progression audit crashed:");
  console.error(error.message);
  if (error.response) console.error(JSON.stringify(error.response, null, 2));
  await mongoose.disconnect();
  process.exit(1);
});
