const { after, before, describe, it } = require("node:test");

const Checkpoint = require("../models/Checkpoint");
const {
  assert,
  assertCanonState,
  assertSameState,
  getCanonicalState,
  post,
  startApi,
  stopApi,
} = require("./apiTestClient");

const OFFICIAL_CHECKPOINT_ID = "checkpoint_d10_1200_1779723391623";

describe("turn hardening and rollback coverage", () => {
  before(startApi);

  after(async () => {
    await post(`/api/checkpoints/${OFFICIAL_CHECKPOINT_ID}/rollback`, {});
    await Checkpoint.deleteMany({ checkpointId: /^checkpoint_test_turn_hardening_/ });
    await stopApi();
  });

  it("previews travel biology and applies activity cost/location atomically", async () => {
    const beforeState = await getCanonicalState();
    assertCanonState(beforeState);

    const tempCheckpointId = `checkpoint_test_turn_hardening_${Date.now()}`;
    const checkpoint = await post("/api/checkpoints", {
      checkpointId: tempCheckpointId,
      title: "Test turn hardening checkpoint",
      reason: "Temporary checkpoint for API mutation safety test.",
    });
    assert.equal(checkpoint.status, 200);
    assert.equal(checkpoint.data.ok, true);

    const travelPreview = await post("/api/travel/preview", {
      fromLocationId: "loc_hoshimori_grulla_azul",
      toLocationId: "loc_hoshimori_guild",
      conditions: {
        ignoreCurrentWeather: true,
        startTime: "12:40",
      },
    });
    assert.equal(travelPreview.status, 200);
    assert.equal(travelPreview.data.preview.timing.finalMinutes, 20);
    assert.equal(travelPreview.data.preview.timing.expectedArrivalTime, "13:00");
    assert.equal(travelPreview.data.preview.biologicalCostPreview.satietyDelta, -1);
    assert.equal(travelPreview.data.preview.biologicalCostPreview.energyDelta, -2);
    assert.equal(travelPreview.data.preview.biologicalCostPreview.processesAtHourBoundary, true);

    const missingCost = await post("/api/turn/apply", {
      actionSummary: "Intento invalido de test: hora exacta sin coste biologico.",
      timeAdvance: {
        from: "12:00",
        to: "13:00",
      },
    });
    assert.equal(missingCost.status, 400);
    assert.match(missingCost.data.error, /hour boundary/);
    assertSameState(beforeState, await getCanonicalState());

    const invalidSource = await post("/api/turn/apply", {
      actionSummary: "Intento invalido de test: fuente de EventLog invalida.",
      timeAdvance: {
        from: "12:00",
        to: "12:20",
      },
      activityCost: {
        category: "viaje_caminata_suave",
        minutes: 20,
        reason: "Viaje interno La Grulla Azul al Gremio",
      },
      gameStatePatch: {
        locationId: "loc_hoshimori_guild",
      },
      eventLogs: [
        {
          source: "technical_invalid_source",
          summary: "Este log debe ser rechazado antes de mutar GameState.",
        },
      ],
    });
    assert.equal(invalidSource.status, 400);
    assert.equal(invalidSource.data.ok, false);
    assertSameState(beforeState, await getCanonicalState());

    const applied = await post("/api/turn/apply", {
      actionSummary: "Test controlado: viaje interno La Grulla Azul al Gremio.",
      timeAdvance: {
        from: "12:00",
        to: "12:20",
      },
      activityCost: {
        category: "viaje_caminata_suave",
        minutes: 20,
        reason: "Viaje interno La Grulla Azul al Gremio",
      },
      gameStatePatch: {
        locationId: "loc_hoshimori_guild",
      },
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de source tecnico aceptado.",
          visibility: "hidden",
        },
      ],
    });
    assert.equal(applied.status, 200);
    assert.equal(applied.data.ok, true);
    assert.equal(applied.data.changes.activityCost.satiety.delta, -1);
    assert.equal(applied.data.changes.activityCost.energy.delta, -2);
    assert.equal(applied.data.changes.location.after, "loc_hoshimori_guild");
    assert.equal(applied.data.gameState.locationId, "loc_hoshimori_guild");
    assert.equal(applied.data.gameState.lucasStatus.satiety.current, 29);
    assert.equal(applied.data.gameState.lucasStatus.energy.current, 57);

    const tempRollback = await post(`/api/checkpoints/${tempCheckpointId}/rollback`, {});
    assert.equal(tempRollback.status, 200);
    assert.equal(tempRollback.data.ok, true);
    assertSameState(beforeState, await getCanonicalState());

    const officialRollback = await post(`/api/checkpoints/${OFFICIAL_CHECKPOINT_ID}/rollback`, {});
    assert.equal(officialRollback.status, 200);
    assert.equal(officialRollback.data.ok, true);
    assertCanonState(await getCanonicalState());

    await Checkpoint.deleteOne({ checkpointId: tempCheckpointId });
  });
});
