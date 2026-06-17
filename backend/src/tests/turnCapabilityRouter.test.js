const { describe, it } = require("node:test");

const { assert } = require("./apiTestClient");
const {
  commonResolverPlan,
  routeTurnIntent,
} = require("../services/turnCapabilityRouterService");

describe("turn capability router", () => {
  it("maps passive scene requests to narrateOnly capabilities", () => {
    const result = routeTurnIntent({ text: "lucas se queda mirando a su alrededor" });

    assert.equal(result.route.intent, "observe_scene");
    assert.equal(result.route.supported, true);
    assert.equal(result.route.needsMutation, false);
    assert.equal(result.route.suggestedOperation, "narrateOnly");
    assert.equal(result.capabilityPacket.capabilityId, "observe_location");
    assert.equal(result.capabilityPacket.executor, "narrateOnly");
  });

  it("maps NPC work-topic questions to social narrateOnly without work fallback", () => {
    const result = routeTurnIntent({
      text: "Lucas le pregunta a Joren Pell si siempre trabaja hasta tan tarde.",
    });

    assert.equal(result.route.intent, "social_scene");
    assert.deepEqual(result.route.domains, ["social"]);
    assert.equal(result.route.supported, true);
    assert.equal(result.route.needsMutation, false);
    assert.equal(result.route.suggestedOperation, "narrateOnly");
    assert.equal(result.capabilityPacket.capabilityId, "ask_npc_work_pattern");
    assert.equal(result.capabilityPacket.slots.questionType, "work_pattern");
  });

  it("classifies sleep until a target time as a general resolver capability", () => {
    const result = routeTurnIntent({
      text: "Lucas se acuesta y duerme hasta las 06:00.",
    });

    assert.equal(result.route.needsMutation, true);
    assert.equal(result.route.capabilityId, "sleep_until_time");
    assert.equal(result.route.resolverPlan.steps.length, 1);
    assert.equal(result.route.resolverPlan.steps[0].type, "rest");
    assert.equal(result.route.resolverPlan.steps[0].category, "descanso_acostado");
    assert.equal(result.route.resolverPlan.steps[0].targetTime, "06:00");
  });

  it("builds common sequence plans from broad action families", () => {
    const plan = commonResolverPlan({
      text: "Lucas descansa 10 minutos y despues corre a toda velocidad al gremio.",
    });

    assert.equal(plan.supported, true);
    assert.equal(plan.capabilityId, "common_sequence");
    assert.deepEqual(plan.steps.map((step) => step.type), ["rest", "travel"]);
    assert.equal(plan.steps[0].minutes, 10);
    assert.equal(plan.steps[1].toLocationId, "loc_hoshimori_guild");
    assert.equal(plan.steps[1].pace, "full_speed");
  });

  it("does not treat internal inn movement as failed external travel when a timed rest exists", () => {
    const plan = commonResolverPlan({
      text: "Lucas sube a su cuarto y se sienta en la cama durante 10 minutos.",
    });

    assert.equal(plan.supported, true);
    assert.equal(plan.capabilityId, "rest_duration");
    assert.deepEqual(plan.steps.map((step) => step.type), ["rest"]);
    assert.equal(plan.steps[0].minutes, 10);
    assert.equal(plan.steps[0].category, "descanso_acostado");
  });

  it("routes waiting until a concrete time as a resolver candidate", () => {
    const result = routeTurnIntent({
      text: "Lucas espera hasta las 08:00.",
    });

    assert.equal(result.route.capabilityId, "wait_until_time");
    assert.equal(result.route.needsMutation, true);
    assert.equal(result.route.resolverPlan.steps[0].type, "wait");
    assert.equal(result.route.resolverPlan.steps[0].targetTime, "08:00");
  });

  it("routes rest until a concrete time without requiring explicit duration", () => {
    const result = routeTurnIntent({
      text: "Lucas va a descansar hasta que sean las 14.",
    });

    assert.equal(result.route.needsMutation, true);
    assert.equal(result.route.capabilityId, "rest_duration");
    assert.equal(result.route.resolverPlan.steps[0].type, "rest");
    assert.equal(result.route.resolverPlan.steps[0].targetTime, "14:00");
    assert.equal(result.route.resolverPlan.unsupportedReasons.length, 0);
  });

  it("routes safe magic and simple meals to action candidates while keeping risky magic on existing flow", () => {
    const magic = routeTurnIntent({
      text: "Lucas practica meditacion de mana durante una hora.",
    });
    assert.equal(magic.route.capabilityId, "safe_magic_practice");
    assert.equal(magic.route.supported, false);
    assert.equal(magic.route.suggestedOperation, "applyTurn");
    assert.equal(magic.route.slots.safeMagicPracticePlan.techniqueId, "technique_mana_meditation_basic");
    assert.equal(magic.route.slots.safeMagicPracticePlan.minutes, 60);

    const riskyMagic = routeTurnIntent({
      text: "Lucas intenta lanzar una descarga electrica.",
    });
    assert.equal(riskyMagic.route.capabilityId, "magic_practice");
    assert.equal(riskyMagic.route.supported, false);
    assert.equal(riskyMagic.route.suggestedOperation, "resolveTurn_or_existing_flow");

    const economy = routeTurnIntent({
      text: "Lucas compra una comida normal.",
    });
    assert.equal(economy.route.capabilityId, "simple_meal_purchase");
    assert.equal(economy.route.supported, false);
    assert.equal(economy.route.suggestedOperation, "applyTurn");
    assert.equal(economy.route.slots.simpleMealPurchasePlan.itemId, "item_comida_normal");
  });

  it("routes shift completion to completeJobShift candidate", () => {
    const result = routeTurnIntent({
      text: "Lucas trabaja hasta la hora de cierre y pide la comida por contrato.",
    });

    assert.equal(result.route.capabilityId, "complete_job_shift");
    assert.equal(result.route.supported, false);
    assert.equal(result.route.suggestedOperation, "completeJobShift");
    assert.equal(result.route.slots.completeJobShiftPlan.consumeContractMeal, true);
    assert.equal(result.route.slots.completeJobShiftPlan.contractMealTiming, "before_work_cost");
  });

  it("does not reduce work plus mana practice to only the magic clause", () => {
    const result = routeTurnIntent({
      text: "Lucas trabaja el resto del turno y despues practica respiracion de mana.",
    });

    assert.equal(result.route.capabilityId, "complete_job_shift");
    assert.equal(result.route.slots.completeJobShiftPlan.consumeContractMeal, false);
    assert.equal(result.route.slots.clausePlan.hasWorkCompletion, true);
    assert.equal(result.route.slots.clausePlan.hasSafeMagicPractice, true);
  });

  it("routes inn help until a relative time as work_segment instead of narrateOnly", () => {
    const result = routeTurnIntent({
      text: "Lucas se queda hasta la tarde ayudando en la posada.",
    });

    assert.equal(result.route.needsMutation, true);
    assert.equal(result.route.capabilityId, "work_segment");
    assert.equal(result.route.resolverPlan.steps[0].type, "work_segment");
    assert.equal(result.route.resolverPlan.steps[0].targetTime, "14:00");
    assert.equal(result.route.resolverPlan.steps[0].allowTruncate, true);
  });

  it("routes compound timed meditation, observation, and sleep through the common resolver", () => {
    const text =
      "Lucas practica meditacion 30 minutos, despues mira su cuarto 10 minutos y finalmente se queda dormido 3 horas.";
    const result = routeTurnIntent({ text });

    assert.equal(result.route.needsMutation, true);
    assert.equal(result.route.capabilityId, "common_sequence");
    assert.equal(result.route.slots.commonResolverCandidate, true);
    assert.deepEqual(result.route.resolverPlan.steps.map((step) => step.type), [
      "rest",
      "wait",
      "rest",
    ]);
    assert.deepEqual(result.route.resolverPlan.steps.map((step) => step.minutes), [
      30,
      10,
      180,
    ]);
    assert.equal(result.route.resolverPlan.steps[0].category, "descanso_sentado");
    assert.equal(result.route.resolverPlan.steps[2].category, "descanso_acostado");
  });

  it("keeps untimed observation read-only but treats timed observation as time passage", () => {
    const passive = routeTurnIntent({ text: "Lucas se queda mirando a su alrededor." });
    assert.equal(passive.route.supported, true);
    assert.equal(passive.route.suggestedOperation, "narrateOnly");
    assert.equal(passive.route.needsMutation, false);

    const timed = routeTurnIntent({ text: "Lucas observa la puerta durante 10 minutos." });
    assert.equal(timed.route.needsMutation, true);
    assert.equal(timed.route.capabilityId, "wait_duration");
    assert.equal(timed.route.resolverPlan.steps[0].minutes, 10);
  });
});
