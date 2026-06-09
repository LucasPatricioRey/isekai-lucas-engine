const { after, before, describe, it } = require("node:test");

const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");
const Mission = require("../models/Mission");
const Npc = require("../models/Npc");
const WorldEvent = require("../models/WorldEvent");
const {
  assert,
  assertCanonState,
  assertSameState,
  getCanonicalState,
  post,
  startApi,
  stopApi,
} = require("./apiTestClient");

let tempGameId = "";
let tempMissionId = "";

async function createIsolatedGameState() {
  tempGameId = `test_turn_hardening_${Date.now()}`;
  tempMissionId = `mission_test_turn_hardening_${Date.now()}`;

  const base = await GameState.findOne({ gameId: "isekai_lucas_main" }).lean();
  assert.ok(base, "Base GameState is required for isolated API tests.");

  const payload = {
    ...base,
    _id: undefined,
    gameId: tempGameId,
    currentDay: 10,
    time: "12:00",
    block: "Mediodía",
    locationId: "loc_hoshimori_grulla_azul_comedor",
    activeMissionIds: [],
    biologicalClock: {
      lastProcessedTime: "12:00",
      currentHourBlock: "12:00-13:00",
      pendingAccumulation: [],
      pendingAccumulations: [],
    },
  };

  payload.lucasStatus.satiety.current = 30;
  payload.lucasStatus.satiety.label = "hambre fuerte";
  payload.lucasStatus.energy.current = 59;
  payload.lucasStatus.energy.label = "cansancio leve/energia media";
  payload.lucasStatus.mp.current = 200;

  delete payload.createdAt;
  delete payload.updatedAt;
  await GameState.create(payload);

  await Mission.create({
    missionId: tempMissionId,
    templateId: "test_turn_hardening",
    title: "Test controlado de mision",
    description: "Mision temporal para probar missionPatch sin tocar canon vivo.",
    sourceFactionId: "faction_hoshimori_guild",
    clientNpcId: "npc_garrick_thorne",
    locationId: "loc_hoshimori_guild",
    rank: "Porcelana",
    requirements: [],
    reward: { moneyCopper: 1, items: [], other: "" },
    mgReward: 0,
    riskLevel: "none",
    status: "available",
    postedDay: 10,
    postedTime: "12:00",
    proofRequired: "Reporte de prueba.",
    proofStatus: "pending",
    flags: { testSuite: true },
  });
}

async function cleanupIsolatedState() {
  if (tempGameId) await GameState.deleteOne({ gameId: tempGameId });
  if (tempGameId) await WorldEvent.deleteMany({ gameId: tempGameId });
  if (tempMissionId) await Mission.deleteOne({ missionId: tempMissionId });
  await EventLog.deleteMany({
    $or: [
      { tags: "test_turn_hardening" },
      { gameId: tempGameId },
    ],
  });
}

describe("turn hardening coverage", () => {
  before(async () => {
    await startApi();
    await createIsolatedGameState();
  });

  after(async () => {
    await cleanupIsolatedState();
    await stopApi();
  });

  it("previews travel biology and applies validated turn mutations atomically", async () => {
    const beforeState = await getCanonicalState(tempGameId);
    const yaraBefore = await Npc.findOne({ npcId: "npc_yara_mils" }).lean();
    assertCanonState(beforeState);

    const travelPreview = await post("/api/travel/preview", {
      gameId: tempGameId,
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
      gameId: tempGameId,
      actionSummary: "Intento invalido de test: hora exacta sin coste biologico.",
      timeAdvance: {
        from: "12:00",
        to: "13:00",
      },
    });
    assert.equal(missingCost.status, 400);
    assert.match(missingCost.data.error, /hour boundary/);
    assertSameState(beforeState, await getCanonicalState(tempGameId));

    const invalidSource = await post("/api/turn/apply", {
      gameId: tempGameId,
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
          tags: ["test_turn_hardening"],
        },
      ],
    });
    assert.equal(invalidSource.status, 400);
    assert.equal(invalidSource.data.ok, false);
    assertSameState(beforeState, await getCanonicalState(tempGameId));

    const mismatchedActivityCost = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Intento invalido de test: activityCost no coincide con tiempo real.",
      timeAdvance: {
        from: "12:00",
        to: "12:20",
      },
      activityCost: {
        category: "viaje_caminata_suave",
        minutes: 10,
        reason: "Coste biologico inconsistente de test",
      },
    });
    assert.equal(mismatchedActivityCost.status, 400);
    assert.match(mismatchedActivityCost.data.error, /activityCost\.minutes/);
    assertSameState(beforeState, await getCanonicalState(tempGameId));

    const acceptedMission = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: Lucas acepta una mision simple.",
      missionPatch: {
        op: "accept",
        missionId: tempMissionId,
      },
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de missionPatch accept.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });
    assert.equal(acceptedMission.status, 200);
    assert.equal(acceptedMission.data.ok, true);
    assert.equal(acceptedMission.data.changes.missions[0].op, "accept");
    assert.equal(acceptedMission.data.changes.missions[0].after.status, "accepted");
    assert.ok(acceptedMission.data.gameState.activeMissionIds.includes(tempMissionId));

    const reportedMission = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: Lucas presenta reporte de mision.",
      missionPatch: {
        op: "report",
        missionId: tempMissionId,
        reportSummary: "Reporte de prueba controlada.",
      },
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de missionPatch report.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });
    assert.equal(reportedMission.status, 200);
    assert.equal(reportedMission.data.ok, true);
    assert.equal(reportedMission.data.changes.missions[0].op, "report");
    assert.equal(reportedMission.data.changes.missions[0].after.proofStatus, "submitted");

    const applied = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: viaje interno La Grulla Azul al Gremio.",
      timeAdvance: {
        from: "12:00",
        to: "13:00",
      },
      activityCost: {
        category: "viaje_caminata_suave",
        minutes: 60,
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
          tags: ["test_turn_hardening"],
        },
      ],
    });
    assert.equal(applied.status, 200);
    assert.equal(applied.data.ok, true);
    assert.equal(applied.data.changes.activityCost.satiety.delta, -3);
    assert.equal(applied.data.changes.activityCost.energy.delta, -5);
    assert.equal(applied.data.changes.location.after, "loc_hoshimori_guild");
    assert.equal(applied.data.gameState.locationId, "loc_hoshimori_guild");
    assert.equal(applied.data.gameState.lucasStatus.satiety.current, 27);
    assert.equal(applied.data.gameState.lucasStatus.energy.current, 54);

    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: 10,
          "diegeticDate.day": 10,
          block: "Noche",
          time: "23:00",
          "lucasStatus.satiety.current": 76,
          "lucasStatus.satiety.label": "satisfecho",
          "lucasStatus.energy.current": 28,
          "lucasStatus.energy.label": "cansancio serio",
          biologicalClock: {
            lastProcessedTime: "23:00",
            currentHourBlock: "23:00-00:00",
            pendingAccumulation: [],
            pendingAccumulations: [],
          },
        },
      }
    );

    const overnightSleep = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: Lucas duerme cruzando medianoche.",
      timeAdvance: {
        fromDay: 10,
        from: "23:00",
        toDay: 11,
        to: "06:00",
      },
      activityCost: {
        category: "sueno_profundo",
        minutes: 420,
        reason: "Sueño profundo nocturno cruzando medianoche.",
      },
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de sueño nocturno cruzando medianoche.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });
    assert.equal(overnightSleep.status, 200);
    assert.equal(overnightSleep.data.ok, true);
    assert.equal(overnightSleep.data.changes.time.dayBefore, 10);
    assert.equal(overnightSleep.data.changes.time.dayAfter, 11);
    assert.equal(overnightSleep.data.changes.time.elapsedMinutes, 420);
    assert.equal(overnightSleep.data.changes.time.crossesMidnight, true);
    assert.equal(overnightSleep.data.changes.biologicalClock.processedBlocks.length, 7);
    assert.equal(overnightSleep.data.gameState.currentDay, 11);
    assert.equal(overnightSleep.data.gameState.diegeticDate.day, 11);
    assert.equal(overnightSleep.data.gameState.time, "06:00");
    assert.equal(overnightSleep.data.gameState.block, "Mañana");
    assert.equal(overnightSleep.data.gameState.lucasStatus.satiety.current, 69);
    assert.equal(overnightSleep.data.gameState.lucasStatus.energy.current, 100);

    const mainState = await getCanonicalState();
    assertCanonState(mainState);
    const yaraAfter = await Npc.findOne({ npcId: "npc_yara_mils" }).lean();
    assert.deepEqual(
      {
        currentLocationId: yaraAfter.currentLocationId,
        currentTask: yaraAfter.currentTask,
        availability: yaraAfter.availability,
      },
      {
        currentLocationId: yaraBefore.currentLocationId,
        currentTask: yaraBefore.currentTask,
        availability: yaraBefore.availability,
      }
    );
  });
});
