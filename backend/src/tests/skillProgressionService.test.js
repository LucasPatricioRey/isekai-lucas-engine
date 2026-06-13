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
