const { after, before, describe, it } = require("node:test");

const TurnTrace = require("../models/TurnTrace");
const {
  assert,
  assertCanonState,
  assertSameState,
  getCanonicalState,
  post,
  startApi,
  stopApi,
} = require("./apiTestClient");

describe("preview and rejection API coverage", () => {
  before(startApi);
  after(stopApi);

  it("job, needs and skill previews do not mutate canonical state", async () => {
    const beforeState = await getCanonicalState();
    assertCanonState(beforeState);

    const job = await post("/api/jobs/shifts/shift_grulla_afternoon_1400_2030/preview", {});
    assert.equal(job.status, 200);
    assert.equal(job.data.preview.mutation.willMutateGameState, false);

    const needs = await post("/api/needs/activity-cost/preview", {
      category: "trabajo_normal",
      minutes: 60,
    });
    assert.equal(needs.status, 200);
    assert.equal(needs.data.preview.totalDelta.energy, -6);

    const skill = await post("/api/progression/skills/preview", {
      skillId: "skill_mana",
      category: "practica_basica_1h_solo",
      expDelta: 4,
      currentEnergy: 80,
      modifiers: { aquaBlessing: true },
    });
    assert.equal(skill.status, 200);
    assert.equal(skill.data.preview.validation.effectiveExpDelta, 40);

    const social = await post("/api/npcs/social/impact/preview", {
      npcId: "npc_yara_mils",
      actionSummary: "Lucas ayuda a Yara durante el turno respetando su espacio.",
      factors: {
        witnessedByNpc: true,
        mattersToNpc: true,
        fitsPersonality: true,
        helpedNpc: true,
        reliableWork: true,
        respectsBoundaries: true,
        practicalConsequence: true,
        withinExpectedDuty: true,
        importance: "meaningful",
      },
    });
    assert.equal(social.status, 200);
    assert.equal(social.data.dryRun, true);
    assert.equal(social.data.preview.mutation.willMutateGameState, false);
    assert.equal(social.data.preview.suggestedPatch.npcId, "npc_yara_mils");
    assert.ok((social.data.preview.suggestedPatch.trustDelta || 0) >= 0);
    assert.ok((social.data.preview.suggestedPatch.familiarityDelta || 0) >= 1);
    assert.equal(social.data.preview.suggestedPatch.actionType, "reliable_work");
    assert.ok(social.data.preview.evaluation.caps.daily);
    assert.ok(social.data.preview.evaluation.dailyUsage || social.data.preview.evaluation.caps.dailyUsage);
    assert.ok(social.data.preview.npc.socialProfile.values.length > 0);
    assert.equal(social.data.preview.npc.relationshipState.schemaVersion, "social_state_v1");
    assert.ok(Number.isInteger(social.data.preview.evaluation.projectedRelationship.relationshipState.accessScore));
    assert.equal(social.data.preview.evaluation.socialProfile.profileFit, "aligned");
    assert.ok(social.data.preview.evaluation.socialProfile.matchedTolerates.length >= 1);

    const afterState = await getCanonicalState();
    assertSameState(beforeState, afterState);
  });

  it("applyTurn dryRun previews skill patches without mutating state or writing traces", async () => {
    const beforeState = await getCanonicalState();
    assertCanonState(beforeState);

    const clientTurnId = `test-dryrun-skill-${Date.now()}`;
    const dryRun = await post("/api/turn/apply", {
      gameId: "isekai_lucas_main",
      dryRun: true,
      clientTurnId,
      actionFamily: "magic_practice",
      actionSummary: "Preview seca de practica basica de mana.",
      skillPatch: [
        {
          skillId: "skill_mana",
          expDelta: 4,
          category: "practica_basica_10_30min",
          durationMinutes: 30,
          reason: "Preview seca de entrenamiento magico basico sin guardar.",
          modifiers: {
            aquaBlessing: true,
            newGoal: true,
          },
        },
      ],
    });

    assert.equal(dryRun.status, 200, JSON.stringify(dryRun.data));
    assert.equal(dryRun.data.ok, true);
    assert.equal(dryRun.data.dryRun, true);
    assert.equal(dryRun.data.mutation.willMutateGameState, false);
    assert.equal(dryRun.data.mutation.willCreateTurnTrace, false);
    assert.equal(dryRun.data.clientTurnId, clientTurnId);
    assert.ok(dryRun.data.changes.skillProgressDisplay.displayLines.length >= 1);
    assert.ok(dryRun.data.changes.skills[0].multiplierParts.some((part) => part.id === "aqua" && part.applied));
    assert.ok(dryRun.data.displayBundle.renderLines.includes("## Estado actual"));

    const afterState = await getCanonicalState();
    assertSameState(beforeState, afterState);
    assert.equal(await TurnTrace.countDocuments({ clientTurnId }), 0);
  });

  it("social preview applies NPC-specific profile friction without mutating canonical state", async () => {
    const beforeState = await getCanonicalState();
    assertCanonState(beforeState);

    const social = await post("/api/npcs/social/impact/preview", {
      npcId: "npc_fern",
      actionSummary: "Lucas insiste con magia imprudente e invade su espacio personal para demostrar mana.",
      factors: {
        witnessedByNpc: true,
        mattersToNpc: true,
        importance: "meaningful",
      },
    });

    assert.equal(social.status, 200);
    assert.equal(social.data.dryRun, true);
    assert.equal(social.data.preview.evaluation.socialProfile.profileFit, "conflict");
    assert.ok(social.data.preview.evaluation.socialProfile.matchedRejects.length >= 1);
    assert.ok((social.data.preview.suggestedPatch.trustDelta || 0) < 0);
    assert.ok((social.data.preview.suggestedPatch.suspicionDelta || 0) >= 1);
    assert.ok((social.data.preview.suggestedPatch.fearDelta || 0) >= 1);
    assert.equal(social.data.preview.evaluation.projectedRelationship.relationshipState.access.privateInfo, false);

    const afterState = await getCanonicalState();
    assertSameState(beforeState, afterState);
  });

  it("magic, combat, travel, weather and world tick previews do not mutate canonical state", async () => {
    const beforeState = await getCanonicalState();
    assertCanonState(beforeState);

    const magic = await post("/api/magic/practice/preview", {
      techniqueId: "technique_mana_breathing_basic",
      minutes: 30,
    });
    assert.equal(magic.status, 200);
    assert.equal(magic.data.preview.canPractice, true);
    assert.equal(magic.data.preview.projectedMp.willMutate, false);
    assert.equal(magic.data.preview.selfTrainingGuidance.schemaVersion, "magic_self_training_v1");
    assert.equal(magic.data.preview.selfTrainingGuidance.mode, "solo");
    assert.equal(magic.data.preview.selfTrainingGuidance.shouldLearnSpell, false);
    assert.equal(magic.data.preview.selfTrainingGuidance.canProduceVisibleEffect, false);
    assert.ok(magic.data.preview.selfTrainingGuidance.guidance.some((line) => line.includes("Sin hechizo visible")));

    const combat = await post("/api/combat/encounters/fixture_enemy_lobo_borde/actions/preview", {
      actionType: "attack",
    });
    assert.equal(combat.status, 200);
    assert.equal(combat.data.preview.canAct, true);
    assert.equal(combat.data.preview.mutation.willMutateGameState, false);
    assert.equal(combat.data.preview.mutation.willGrantLoot, false);

    const travel = await post("/api/travel/preview", {
      fromLocationId: "loc_hoshimori_grulla_azul",
      toLocationId: "loc_hoshimori_market",
      conditions: { ignoreCurrentWeather: true },
    });
    assert.equal(travel.status, 200);
    assert.equal(travel.data.preview.timing.finalMinutes, 15);
    assert.equal(travel.data.preview.willMutateGameState, false);

    const weather = await post("/api/weather/effects/preview", {
      routeType: "road",
      terrain: ["mud_road"],
    });
    assert.equal(weather.status, 200);
    assert.equal(weather.data.preview.travelTimeMultiplier, 1);
    assert.equal(weather.data.preview.willMutateGameState, false);

    const forcedRainWeather = await post("/api/weather/effects/preview", {
      routeType: "road",
      terrain: ["mud_road"],
      condition: "light_rain",
    });
    assert.equal(forcedRainWeather.status, 200);
    assert.equal(forcedRainWeather.data.preview.travelTimeMultiplier, 1.25);
    assert.equal(forcedRainWeather.data.preview.willMutateGameState, false);

    const tick = await post("/api/world/tick/preview", {
      fromDay: 10,
      fromTime: "12:00",
      toDay: 10,
      toTime: "14:00",
      dryRun: true,
    });
    assert.equal(tick.status, 200);
    assert.equal(tick.data.preview.willMutateGameState, false);
    assert.equal(tick.data.preview.elapsedMinutes, 120);

    const afterState = await getCanonicalState();
    assertSameState(beforeState, afterState);
  });

  it("rejects nonexistent item and backwards time without mutating canonical state", async () => {
    const beforeState = await getCanonicalState();
    assertCanonState(beforeState);

    const badItem = await post("/api/turn/apply", {
      actionSummary: "Intento invalido de test: item inexistente.",
      inventoryPatch: [
        {
          op: "add",
          itemId: "item_no_existe_test_suite",
          quantity: 1,
        },
      ],
    });
    assert.equal(badItem.status, 400);
    assert.equal(badItem.data.ok, false);

    const backwardsTime = await post("/api/turn/apply", {
      actionSummary: "Intento invalido de test: retroceder tiempo.",
      timeAdvance: {
        from: "12:00",
        to: "11:55",
      },
    });
    assert.equal(backwardsTime.status, 400);
    assert.equal(backwardsTime.data.ok, false);

    const badSkillPreview = await post("/api/progression/skills/preview", {
      skillId: "skill_vitalidad",
      category: "entreno_intenso",
      expDelta: 5,
      reason: "Intento invalido: entreno intenso no declarado para Vitalidad.",
      currentEnergy: 80,
      durationMinutes: 60,
    });
    assert.equal(badSkillPreview.status, 400);
    assert.equal(badSkillPreview.data.ok, false);
    assert.match(badSkillPreview.data.error, /Skill patch invalido/);
    assert.match(JSON.stringify(badSkillPreview.data), /no corresponde a un rango conocido/);

    const afterState = await getCanonicalState();
    assertSameState(beforeState, afterState);
  });
});
