const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  ACTION_FAMILIES,
  buildNarrativeHintsFromRecentLogs,
  getTrackedActionFamily,
  inferActionFamily,
} = require("../services/narrativeVariationService");

describe("narrative variation service", () => {
  it("infers action families from player-facing summaries", () => {
    assert.equal(
      inferActionFamily({
        actionSummary: "Lucas sale a entrenar una hora de calistenia intensa.",
      }),
      ACTION_FAMILIES.PHYSICAL_TRAINING
    );
    assert.equal(
      inferActionFamily({
        actionSummary: "Lucas practica respiracion de mana sin lanzar hechizos.",
      }),
      ACTION_FAMILIES.MAGIC_PRACTICE
    );
    assert.equal(
      inferActionFamily({
        actionSummary: "Lucas va al mercado a comprar comida simple.",
      }),
      ACTION_FAMILIES.SHOPPING
    );
    assert.equal(
      inferActionFamily({
        actionSummary: "Lucas investiga rastros, huellas y ramas quebradas en el borde del bosque.",
      }),
      ACTION_FAMILIES.INVESTIGATION
    );
    assert.equal(
      inferActionFamily({
        actionSummary: "Lucas reporta evidencia util al gremio con un informe sobrio.",
      }),
      ACTION_FAMILIES.REPORT
    );
  });

  it("compresses repeated job scenes and tells the narrator what not to repeat", () => {
    const fingerprint = "job_shift:loc_grulla_azul:shift_grulla_morning_0700_1200";
    const recentLogs = [1, 2, 3].map((offset) => ({
      logId: `log_repeat_job_${offset}`,
      day: 14 - offset,
      timeStart: "07:00",
      type: "job_shift_completed",
      summary: "Turno laboral completado: Turno manana.",
      locationId: "loc_hoshimori_grulla_azul_comedor",
      tags: ["job_shift", "complete_shift"],
      mechanicalChanges: {
        narrativeTracking: {
          actionFamily: ACTION_FAMILIES.JOB_SHIFT,
          actionFingerprint: fingerprint,
        },
      },
    }));

    const hints = buildNarrativeHintsFromRecentLogs({
      gameState: {
        gameId: "test_narrative",
        currentDay: 14,
        time: "12:00",
        locationId: "loc_hoshimori_grulla_azul_comedor",
      },
      actionSummary: "Lucas trabaja normalmente ayudando cuando puede a Yara y Fern.",
      changes: {
        ledger: { shiftId: "shift_grulla_morning_0700_1200" },
      },
      recentLogs,
      actionFamily: ACTION_FAMILIES.JOB_SHIFT,
      seed: "shift_grulla_morning_0700_1200",
    });

    assert.equal(hints.schemaVersion, "narrative_hints_v2");
    assert.equal(hints.actionFamily, ACTION_FAMILIES.JOB_SHIFT);
    assert.equal(hints.repetition.level, "high");
    assert.equal(hints.sceneMode, "compressed_with_new_detail");
    assert.equal(hints.scenePlan.schemaVersion, "scene_plan_v1");
    assert.match(hints.scenePlan.paragraphTarget, /1-2/);
    assert.match(hints.scenePlan.noveltyRule, /diferencia observable/);
    assert.match(hints.scenePlan.stateCalloutRule, /displayLines/);
    assert.ok(hints.avoidRepeating.some((entry) => entry.includes("mesas")));
    assert.ok(hints.variationGuidance.primaryLever);
    assert.match(hints.variationGuidance.compression, /Comprimir/);
    assert.match(hints.variationGuidance.consequenceFocus, /No repetir recompensa/);
    assert.match(hints.mechanicsBoundary, /No agregan dinero/);
  });

  it("keeps repeated social texture separate from numeric rewards", () => {
    const recentLogs = [1, 2].map((offset) => ({
      logId: `log_repeat_social_${offset}`,
      day: 13,
      timeStart: `21:0${offset}`,
      type: "turn_update",
      summary: "Lucas cena y charla con Yara despues del cierre.",
      locationId: "loc_hoshimori_grulla_azul_comedor",
      involvedNpcIds: ["npc_yara_mils"],
      tags: ["social"],
      mechanicalChanges: {
        narrativeTracking: {
          actionFamily: ACTION_FAMILIES.SOCIAL,
          actionFingerprint: "social:loc_grulla_azul:npc_yara_mils",
        },
      },
    }));

    const hints = buildNarrativeHintsFromRecentLogs({
      gameState: {
        gameId: "test_narrative",
        currentDay: 14,
        time: "21:20",
        locationId: "loc_hoshimori_grulla_azul_comedor",
      },
      actionSummary: "Lucas charla tranquilamente con Yara despues de comer.",
      involvedNpcIds: ["npc_yara_mils"],
      recentLogs,
      actionFamily: ACTION_FAMILIES.SOCIAL,
    });

    assert.equal(hints.actionFamily, ACTION_FAMILIES.SOCIAL);
    assert.equal(hints.repetition.level, "medium");
    assert.equal(hints.socialGuidance.outcome, "memory_or_texture_only");
    assert.match(hints.scenePlan.npcReactionRule, /no sumar otra recompensa social/);
    assert.ok(hints.scenePlan.reactionFocus);
    assert.equal(hints.npcBeats[0].npcId, "npc_yara_mils");
    assert.ok(["brief_line", "gesture"].includes(hints.npcBeats[0].dialogueMode));
    assert.ok(["silencio", "gesto", "limite", "cansancio", "continuidad de confianza"].includes(
      hints.variationGuidance.primaryLever
    ));
  });

  it("prefers stored narrative tracking over noisy log text", () => {
    const log = {
      type: "eddan_guard_distance_training",
      summary: "Lucas trabaja guardia, distancia y retirada en el gremio antes de volver.",
      tags: ["physical_training", "action_family_physical_training"],
      mechanicalChanges: {
        location: { before: "loc_a", after: "loc_b" },
        time: { before: "08:00", after: "08:30" },
        narrativeTracking: {
          actionFamily: ACTION_FAMILIES.PHYSICAL_TRAINING,
          actionFingerprint: "physical_training:loc_guild:npc_eddan_rusk",
        },
      },
    };

    assert.equal(getTrackedActionFamily(log), ACTION_FAMILIES.PHYSICAL_TRAINING);
    assert.equal(inferActionFamily({ log }), ACTION_FAMILIES.PHYSICAL_TRAINING);
  });
});
