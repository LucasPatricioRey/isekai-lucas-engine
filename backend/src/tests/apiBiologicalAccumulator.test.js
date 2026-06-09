const { after, before, describe, it } = require("node:test");

const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");
const WorldEvent = require("../models/WorldEvent");
const {
  assert,
  get,
  post,
  startApi,
  stopApi,
} = require("./apiTestClient");

const tempGameIds = [];

async function createBiologyTestGame({ time = "13:00", satiety = 88, energy = 69 } = {}) {
  const gameId = `test_bio_acc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  tempGameIds.push(gameId);

  const base = await GameState.findOne({ gameId: "isekai_lucas_main" }).lean();
  assert.ok(base, "Base GameState is required for biological accumulator tests.");

  const payload = {
    ...base,
    _id: undefined,
    gameId,
    currentDay: 10,
    time,
    block: time < "14:00" ? "Mediodía" : "Tarde",
    locationId: "loc_hoshimori_grulla_azul",
    activeMissionIds: [],
    biologicalClock: {
      lastProcessedTime: time,
      currentHourBlock: `${time.slice(0, 2)}:00-${String(Number(time.slice(0, 2)) + 1).padStart(2, "0")}:00`,
      pendingAccumulation: [],
      pendingAccumulations: [],
    },
  };

  payload.lucasStatus.satiety.current = satiety;
  payload.lucasStatus.satiety.label = satiety >= 71 ? "satisfecho" : "hambre leve";
  payload.lucasStatus.energy.current = energy;
  payload.lucasStatus.energy.label = energy >= 70 ? "rendimiento normal" : "cansancio leve/energia media";
  payload.lucasStatus.mp.current = 200;

  delete payload.createdAt;
  delete payload.updatedAt;
  await GameState.create(payload);

  return gameId;
}

async function getGameState(gameId) {
  const response = await get(`/api/context/full?gameId=${encodeURIComponent(gameId)}`);
  assert.equal(response.status, 200);
  return response.data.context.gameState;
}

async function getPendingContext(gameId) {
  const response = await get(`/api/context/full?gameId=${encodeURIComponent(gameId)}`);
  assert.equal(response.status, 200);
  return response.data.context.pendingBiologicalAccumulations || [];
}

describe("persistent biological accumulators", () => {
  before(startApi);

  after(async () => {
    if (tempGameIds.length > 0) {
      await GameState.deleteMany({ gameId: { $in: tempGameIds } });
      await WorldEvent.deleteMany({ gameId: { $in: tempGameIds } });
    }
    await EventLog.deleteMany({
      $or: [
        { tags: "test_bio_accumulator" },
        { gameId: { $in: tempGameIds } },
      ],
    });
    await stopApi();
  });

  it("stores calm eating pending accumulation while direct meal bonus applies immediately", async () => {
    const gameId = await createBiologyTestGame({ time: "12:00", satiety: 30, energy: 59 });

    const response = await post("/api/turn/apply", {
      gameId,
      actionSummary: "Test biologico: comida tranquila con bonus directo.",
      timeAdvance: {
        from: "12:00",
        to: "12:20",
      },
      lucasPatch: {
        satietyDelta: 30,
        energyDelta: 5,
      },
      activityCost: {
        category: "comer_tranquilo",
        minutes: 20,
        reason: "Comer tranquilo durante el almuerzo de prueba.",
      },
      eventLogs: [
        {
          source: "mechanical_audit",
          visibility: "hidden",
          summary: "Test biologico: comida acumulada.",
          tags: ["test_bio_accumulator"],
        },
      ],
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.gameState.lucasStatus.satiety.current, 60);
    assert.equal(response.data.gameState.lucasStatus.energy.current, 64);
    assert.equal(response.data.changes.biologicalClock.pendingCreated.length, 1);
    assert.equal(response.data.changes.biologicalClock.pendingCreated[0].category, "comer_tranquilo");

    const pending = await getPendingContext(gameId);
    assert.equal(pending.length, 1);
    assert.equal(pending[0].minutes, 20);
  });

  it("stores short hard effort without immediate cost", async () => {
    const gameId = await createBiologyTestGame({ time: "13:00", satiety: 88, energy: 69 });

    const response = await post("/api/turn/apply", {
      gameId,
      actionSummary: "Test biologico: carrera corta.",
      timeAdvance: {
        from: "13:00",
        to: "13:10",
      },
      activityCost: {
        category: "esfuerzo_fuerte",
        minutes: 10,
        reason: "Carrera corta de prueba.",
      },
    });

    assert.equal(response.status, 200);
    assert.equal(response.data.gameState.lucasStatus.satiety.current, 88);
    assert.equal(response.data.gameState.lucasStatus.energy.current, 69);
    assert.equal(response.data.changes.biologicalClock.pendingCreated[0].category, "esfuerzo_fuerte");
  });

  it("processes pending accumulation at hour boundary and does not process it twice", async () => {
    const gameId = await createBiologyTestGame({ time: "13:00", satiety: 88, energy: 69 });

    const run = await post("/api/turn/apply", {
      gameId,
      actionSummary: "Test biologico: carrera pendiente.",
      timeAdvance: { from: "13:00", to: "13:10" },
      activityCost: {
        category: "esfuerzo_fuerte",
        minutes: 10,
        reason: "Carrera corta de prueba.",
      },
    });
    assert.equal(run.status, 200);

    const closeBlock = await post("/api/turn/apply", {
      gameId,
      actionSummary: "Test biologico: cierre de bloque horario.",
      timeAdvance: { from: "13:10", to: "14:00" },
      biologicalCostExemptReason: "Cerrar bloque y procesar acumuladores pendientes ya registrados.",
    });

    assert.equal(closeBlock.status, 200);
    assert.equal(closeBlock.data.changes.activityCost.satiety.delta, -1);
    assert.equal(closeBlock.data.changes.activityCost.energy.delta, -2);
    assert.equal(closeBlock.data.gameState.lucasStatus.satiety.current, 87);
    assert.equal(closeBlock.data.gameState.lucasStatus.energy.current, 67);

    const stateAfterClose = await getGameState(gameId);
    const processed = stateAfterClose.biologicalClock.pendingAccumulations.filter(
      (entry) => entry.status === "processed"
    );
    assert.equal(processed.length, 1);

    const nextPending = await post("/api/turn/apply", {
      gameId,
      actionSummary: "Test biologico: nueva accion del bloque siguiente.",
      timeAdvance: { from: "14:00", to: "14:10" },
      activityCost: {
        category: "charla_tranquila",
        minutes: 10,
        reason: "Charla tranquila de prueba.",
      },
    });
    assert.equal(nextPending.status, 200);
    assert.equal(nextPending.data.gameState.lucasStatus.satiety.current, 87);
    assert.equal(nextPending.data.gameState.lucasStatus.energy.current, 67);
  });

  it("groups multiple pending activities from the same block", async () => {
    const gameId = await createBiologyTestGame({ time: "13:00", satiety: 88, energy: 69 });

    const first = await post("/api/turn/apply", {
      gameId,
      actionSummary: "Test biologico: esfuerzo 1.",
      timeAdvance: { from: "13:00", to: "13:10" },
      activityCost: {
        category: "esfuerzo_fuerte",
        minutes: 10,
        reason: "Primer esfuerzo.",
      },
    });
    assert.equal(first.status, 200);

    const second = await post("/api/turn/apply", {
      gameId,
      actionSummary: "Test biologico: esfuerzo 2.",
      timeAdvance: { from: "13:10", to: "13:30" },
      activityCost: {
        category: "esfuerzo_fuerte",
        minutes: 20,
        reason: "Segundo esfuerzo.",
      },
    });
    assert.equal(second.status, 200);

    const closeBlock = await post("/api/turn/apply", {
      gameId,
      actionSummary: "Test biologico: cierre con multiples pendientes.",
      timeAdvance: { from: "13:30", to: "14:00" },
      biologicalCostExemptReason: "Cerrar bloque y procesar acumuladores pendientes ya registrados.",
    });

    assert.equal(closeBlock.status, 200);
    assert.equal(closeBlock.data.changes.activityCost.satiety.delta, -4);
    assert.equal(closeBlock.data.changes.activityCost.energy.delta, -6);
    assert.equal(closeBlock.data.gameState.lucasStatus.satiety.current, 84);
    assert.equal(closeBlock.data.gameState.lucasStatus.energy.current, 63);
  });

  it("rejects crossing an hour boundary without cost or exemption", async () => {
    const gameId = await createBiologyTestGame({ time: "13:50", satiety: 88, energy: 69 });
    const before = await getGameState(gameId);

    const response = await post("/api/turn/apply", {
      gameId,
      actionSummary: "Test biologico: cruce invalido sin coste.",
      timeAdvance: { from: "13:50", to: "14:10" },
    });

    assert.equal(response.status, 400);
    assert.match(response.data.error, /hour boundary/);

    const after = await getGameState(gameId);
    assert.equal(after.time, before.time);
    assert.equal(after.lucasStatus.satiety.current, before.lucasStatus.satiety.current);
    assert.equal(after.lucasStatus.energy.current, before.lucasStatus.energy.current);
  });
});
