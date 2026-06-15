const test = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateAntiFarmingMultiplier,
  previewSkillProgression,
  validateSkillPatch,
} = require("../services/skillProgressionService");

const baseAgility = {
  skillId: "skill_agilidad",
  name: "Agilidad",
  phase: "Principiante",
  level: 5,
  exp: 0,
  expToNext: 100,
};

const baseDagger = {
  skillId: "skill_daga",
  name: "Daga",
  phase: "Principiante",
  level: 1,
  exp: 0,
  expToNext: 100,
};

const baseVitality = {
  skillId: "skill_vitalidad",
  name: "Vitalidad",
  phase: "Principiante",
  level: 1,
  exp: 0,
  expToNext: 100,
};

test("prorates hourly skill EXP by duration before multipliers", () => {
  const preview = previewSkillProgression({
    skill: baseAgility,
    expDelta: 6,
    category: "entreno_moderado",
    reason: "Entrenamiento moderado de treinta minutos.",
    currentEnergy: 80,
    durationMinutes: 30,
  });

  assert.equal(preview.validation.durationAdjustedBaseExpDelta, 3);
  assert.equal(preview.validation.effectiveExpDelta, 15);
  assert.equal(preview.validation.durationAdjustmentMode, "prorated_from_hour");
});

test("accepts already duration-adjusted input for hourly categories", () => {
  const preview = previewSkillProgression({
    skill: baseAgility,
    expDelta: 3,
    category: "entreno_moderado",
    reason: "Entrenamiento moderado de treinta minutos con EXP ya ajustada.",
    currentEnergy: 80,
    durationMinutes: 30,
  });

  assert.equal(preview.validation.durationAdjustedBaseExpDelta, 3);
  assert.equal(preview.validation.effectiveExpDelta, 15);
  assert.equal(preview.validation.durationAdjustmentMode, "duration_adjusted_input");
});

test("applies same-day anti-farming and lets novelty soften it", () => {
  const repeated = validateSkillPatch({
    skillId: "skill_agilidad",
    expDelta: 6,
    category: "entreno_moderado",
    reason: "Entrenamiento repetido.",
    currentEnergy: 80,
    currentPhase: "Principiante",
    durationMinutes: 30,
    antiFarmingContext: { previousSimilarCount: 2 },
  });

  assert.equal(repeated.antiFarming.multiplier, 0.5);
  assert.equal(repeated.effectiveExpDelta, 8);

  const softened = validateSkillPatch({
    skillId: "skill_agilidad",
    expDelta: 6,
    category: "entreno_moderado",
    reason: "Entrenamiento repetido con tecnica nueva.",
    modifiers: { newTechnique: true },
    currentEnergy: 80,
    currentPhase: "Principiante",
    durationMinutes: 30,
    antiFarmingContext: { previousSimilarCount: 2 },
  });

  assert.equal(softened.antiFarming.multiplier, 0.75);
  assert.equal(softened.effectiveExpDelta, 11);
});

test("anti-farming can exhaust empty repetition", () => {
  const exhausted = calculateAntiFarmingMultiplier({ previousSimilarCount: 4 });

  assert.equal(exhausted.multiplier, 0);
  assert.equal(exhausted.applied, true);
});

test("guided beginner combat fundamentals give visible early progress", () => {
  const preview = previewSkillProgression({
    skill: baseDagger,
    expDelta: 3,
    category: "fundamentos_30min",
    reason: "Fundamentos de daga guiados por instructor durante treinta minutos.",
    modifiers: { hasMaster: true, newTechnique: true },
    currentEnergy: 45,
    durationMinutes: 30,
  });

  assert.equal(preview.validation.ok, true);
  assert.equal(preview.validation.recommendedRange.min, 3);
  assert.equal(preview.validation.effectiveExpDelta, 27);
});

test("underpowered combat fundamentals are rejected for technical skills", () => {
  const validation = validateSkillPatch({
    skillId: "skill_daga",
    expDelta: 1,
    category: "fundamentos_30min",
    reason: "Fundamentos de daga guiados por instructor durante treinta minutos.",
    modifiers: { hasMaster: true, newTechnique: true },
    currentEnergy: 45,
    currentPhase: "Principiante",
    durationMinutes: 30,
  });

  assert.equal(validation.ok, false);
  assert.match(validation.issues.join(" "), /debajo del rango base recomendado 3-6/);
});

test("rejects skill categories that are not declared for that skill", () => {
  const validation = validateSkillPatch({
    skillId: baseVitality.skillId,
    expDelta: 5,
    category: "entreno_intenso",
    reason: "Intento invalido: entrenamiento intenso no declarado para Vitalidad.",
    currentEnergy: 80,
    currentPhase: "Principiante",
    durationMinutes: 60,
  });

  assert.equal(validation.ok, false);
  assert.equal(validation.recommendedRange, null);
  assert.match(validation.issues.join(" "), /no corresponde a un rango conocido para skill_vitalidad/);
  assert.equal(validation.allowedCategories.includes("entreno_intenso"), false);
  assert.throws(
    () =>
      previewSkillProgression({
        skill: baseVitality,
        expDelta: 5,
        category: "entreno_intenso",
        reason: "Intento invalido: entrenamiento intenso no declarado para Vitalidad.",
        currentEnergy: 80,
        durationMinutes: 60,
      }),
    /Skill patch invalido/
  );
});
