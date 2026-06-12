const { after, before, describe, it } = require("node:test");

const Checkpoint = require("../models/Checkpoint");
const CombatEncounter = require("../models/CombatEncounter");
const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");
const JobContract = require("../models/JobContract");
const Mission = require("../models/Mission");
const Npc = require("../models/Npc");
const NpcSocialLedger = require("../models/NpcSocialLedger");
const WeatherState = require("../models/WeatherState");
const WorldEvent = require("../models/WorldEvent");
const { pruneAutomaticCheckpoints } = require("../services/checkpointService");
const { ensureDailyEventForGameState } = require("../services/dailyEventSchedulerService");
const { ensureCurrentWeatherForGameState } = require("../services/weatherService");
const {
  assert,
  assertCanonState,
  assertSameState,
  get,
  getCanonicalState,
  post,
  requestWithApiKey,
  startApi,
  stopApi,
} = require("./apiTestClient");

let tempGameId = "";
let tempMissionId = "";
let tempExpiredMissionId = "";
let tempGuildMissionId = "";
let tempJobContractId = "";
let tempCreatedJobContractId = "";
let tempNpcId = "";
let tempRemoteNpcId = "";
let tempWeatherRegionId = "";

async function createIsolatedGameState() {
  tempGameId = `test_turn_hardening_${Date.now()}`;
  tempMissionId = `mission_test_turn_hardening_${Date.now()}`;
  tempExpiredMissionId = `mission_test_turn_hardening_expired_${Date.now()}`;
  tempGuildMissionId = `mission_test_turn_hardening_cobre_${Date.now()}`;
  tempJobContractId = `contract_test_turn_hardening_${Date.now()}`;
  tempNpcId = `npc_test_relationship_${Date.now()}`;
  tempRemoteNpcId = `npc_test_relationship_remote_${Date.now()}`;
  tempWeatherRegionId = `region_test_turn_hardening_${Date.now()}`;

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

  await Mission.create({
    missionId: tempExpiredMissionId,
    templateId: "test_turn_hardening_expired",
    title: "Test controlado de mision vencida",
    description: "Mision temporal para probar que la cartelera no ofrece encargos vencidos.",
    sourceFactionId: "faction_hoshimori_guild",
    clientNpcId: "npc_garrick_thorne",
    locationId: "loc_test_turn_hardening_board",
    rank: "Porcelana",
    requirements: [],
    reward: { moneyCopper: 1, items: [], other: "" },
    mgReward: 0,
    riskLevel: "none",
    status: "available",
    postedDay: 10,
    postedTime: "10:00",
    expiresDay: 10,
    expiresTime: "11:00",
    proofRequired: "Reporte de prueba.",
    proofStatus: "pending",
    flags: { testSuite: true },
  });

  await Mission.create({
    missionId: tempGuildMissionId,
    templateId: "test_turn_hardening_cobre",
    title: "Test controlado de registro gremial",
    description: "Mision temporal Cobre para validar registro formal pendiente.",
    sourceFactionId: "faction_hoshimori_guild",
    clientNpcId: "npc_garrick_thorne",
    locationId: "loc_hoshimori_guild",
    rank: "Cobre",
    requirements: [],
    reward: { moneyCopper: 1, items: [], other: "" },
    mgReward: 0,
    riskLevel: "low",
    status: "available",
    postedDay: 10,
    postedTime: "12:00",
    expiresDay: 10,
    expiresTime: "18:00",
    proofRequired: "Reporte de prueba.",
    proofStatus: "pending",
    flags: { testSuite: true },
  });

  await JobContract.create({
    contractId: tempJobContractId,
    characterId: "char_lucas",
    jobId: "job_test_turn_hardening",
    title: "Contrato temporal de test",
    employerNpcId: "npc_roberto_valen",
    locationId: "loc_hoshimori_grulla_azul",
    factionId: "faction_grulla_azul",
    status: "active",
    startDay: 10,
    pay: {
      dailyCopper: 70,
      notes: "Fixture temporal.",
    },
    includesMeals: true,
    mealBenefits: [
      {
        mealId: "meal_test_breakfast",
        name: "Desayuno temporal de test",
        satietyBonus: 20,
        energyBonus: 2,
      },
    ],
    shifts: [
      {
        shiftId: "shift_test_morning_0700_1200",
        name: "Turno temporal mañana",
        startTime: "07:00",
        endTime: "12:00",
        activityCategory: "trabajo_normal",
        expectedMinutes: 300,
        payCopper: 70,
        includedMealIds: ["meal_test_breakfast"],
        typicalTasks: ["Fixture temporal de trabajo."],
        rules: ["No tocar contrato canon."],
      },
    ],
    flags: { testSuite: true },
  });

  await Npc.create({
    npcId: tempNpcId,
    name: "NPC Test Relacion",
    role: "fixture social",
    currentLocationId: "loc_hoshimori_grulla_azul_comedor",
    relationshipWithLucas: {
      trust: 10,
      familiarity: 0,
      affection: 0,
      suspicion: 0,
      respect: 5,
      fear: 0,
      jealousy: 0,
      socialDebt: 0,
      notes: "Fixture temporal de pruebas.",
    },
  });

  await Npc.create({
    npcId: tempRemoteNpcId,
    name: "NPC Test Relacion Remota",
    role: "fixture social remoto",
    currentLocationId: "loc_hoshimori_market",
    relationshipWithLucas: {
      trust: 10,
      familiarity: 0,
      affection: 0,
      suspicion: 0,
      respect: 5,
      fear: 0,
      jealousy: 0,
      socialDebt: 0,
      notes: "Fixture temporal remota de pruebas.",
    },
  });
}

async function cleanupIsolatedState() {
  if (tempGameId) await GameState.deleteOne({ gameId: tempGameId });
  if (tempGameId) await Checkpoint.deleteMany({ gameId: tempGameId });
  if (tempGameId) await CombatEncounter.deleteMany({ gameId: tempGameId });
  if (tempGameId) await WorldEvent.deleteMany({ gameId: tempGameId });
  await Mission.deleteMany({
    missionId: { $in: [tempMissionId, tempExpiredMissionId, tempGuildMissionId].filter(Boolean) },
  });
  await JobContract.deleteMany({
    contractId: { $in: [tempJobContractId, tempCreatedJobContractId].filter(Boolean) },
  });
  if (tempNpcId) await Npc.deleteOne({ npcId: tempNpcId });
  if (tempNpcId) await NpcSocialLedger.deleteMany({ npcId: tempNpcId });
  if (tempRemoteNpcId) await Npc.deleteOne({ npcId: tempRemoteNpcId });
  if (tempRemoteNpcId) await NpcSocialLedger.deleteMany({ npcId: tempRemoteNpcId });
  if (tempWeatherRegionId) await WeatherState.deleteMany({ regionId: tempWeatherRegionId });
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

  it("hides expired available missions from the normal board", async () => {
    const board = await get(
      `/api/missions/board?gameId=${encodeURIComponent(tempGameId)}&status=available&locationId=loc_test_turn_hardening_board`
    );
    assert.equal(board.status, 200);
    assert.equal(board.data.ok, true);
    assert.equal(board.data.missions.some((mission) => mission.missionId === tempExpiredMissionId), false);

    const debugBoard = await get(
      `/api/missions/board?gameId=${encodeURIComponent(tempGameId)}&status=available&locationId=loc_test_turn_hardening_board&includeExpiredAvailable=true`
    );
    assert.equal(debugBoard.status, 200);
    assert.equal(debugBoard.data.ok, true);
    assert.equal(debugBoard.data.missions.some((mission) => mission.missionId === tempExpiredMissionId), true);
  });

  it("refreshes stale weather for the current time block idempotently", async () => {
    await WeatherState.create({
      weatherId: `weather_${tempWeatherRegionId}_stale_fixture`,
      regionId: tempWeatherRegionId,
      currentCondition: "clear",
      intensity: 1,
      startedDay: 10,
      startedTime: "06:00",
      expectedUntilDay: 10,
      expectedUntilTime: "12:00",
      effects: [],
      source: "test_turn_hardening",
      tags: ["test_turn_hardening"],
    });

    const first = await ensureCurrentWeatherForGameState(
      { currentDay: 12, time: "06:25" },
      { regionId: tempWeatherRegionId }
    );
    assert.equal(first.changed, true);
    assert.equal(first.weather.regionId, tempWeatherRegionId);
    assert.equal(first.weather.currentCondition, "cloudy");
    assert.equal(first.weather.startedDay, 12);
    assert.equal(first.weather.startedTime, "06:00");
    assert.equal(first.weather.expectedUntilDay, 12);
    assert.equal(first.weather.expectedUntilTime, "12:00");

    const second = await ensureCurrentWeatherForGameState(
      { currentDay: 12, time: "06:25" },
      { regionId: tempWeatherRegionId }
    );
    assert.equal(second.changed, false);
    assert.equal(second.weather.weatherId, first.weather.weatherId);
  });

  it("enforces scoped API keys for gameplay and admin-write routes", async () => {
    const previousGameplay = process.env.GAMEPLAY_API_KEY;
    const previousAdminReadonly = process.env.ADMIN_READONLY_API_KEY;
    const previousAdminWrite = process.env.ADMIN_WRITE_API_KEY;

    process.env.GAMEPLAY_API_KEY = "test_gameplay_scope_key";
    process.env.ADMIN_READONLY_API_KEY = "test_admin_read_scope_key";
    process.env.ADMIN_WRITE_API_KEY = "test_admin_write_scope_key";

    try {
      const readWithAdminReadonly = await requestWithApiKey(
        `/api/context/compact?gameId=${encodeURIComponent(tempGameId)}`,
        process.env.ADMIN_READONLY_API_KEY
      );
      assert.equal(readWithAdminReadonly.status, 200);
      assert.equal(readWithAdminReadonly.data.ok, true);

      const gameplayAuthPasses = await requestWithApiKey(
        "/api/turn/apply",
        process.env.GAMEPLAY_API_KEY,
        {
          method: "POST",
          body: JSON.stringify({
            gameId: "missing_game_for_scope_test",
            actionSummary: "Test controlado de scope gameplay.",
          }),
        }
      );
      assert.equal(gameplayAuthPasses.status, 404);

      const adminReadonlyCannotApplyTurn = await requestWithApiKey(
        "/api/turn/apply",
        process.env.ADMIN_READONLY_API_KEY,
        {
          method: "POST",
          body: JSON.stringify({
            gameId: tempGameId,
            actionSummary: "Este mutador debe ser bloqueado por scope.",
          }),
        }
      );
      assert.equal(adminReadonlyCannotApplyTurn.status, 401);
      assert.equal(adminReadonlyCannotApplyTurn.data.scope, "gameplay");

      const gameplayCannotCallAdminWrite = await requestWithApiKey(
        "/api/checkpoints/test_checkpoint/rollback",
        process.env.GAMEPLAY_API_KEY,
        {
          method: "POST",
          body: JSON.stringify({ gameId: tempGameId }),
        }
      );
      assert.equal(gameplayCannotCallAdminWrite.status, 401);
      assert.equal(gameplayCannotCallAdminWrite.data.scope, "admin-write");
    } finally {
      if (previousGameplay === undefined) delete process.env.GAMEPLAY_API_KEY;
      else process.env.GAMEPLAY_API_KEY = previousGameplay;

      if (previousAdminReadonly === undefined) delete process.env.ADMIN_READONLY_API_KEY;
      else process.env.ADMIN_READONLY_API_KEY = previousAdminReadonly;

      if (previousAdminWrite === undefined) delete process.env.ADMIN_WRITE_API_KEY;
      else process.env.ADMIN_WRITE_API_KEY = previousAdminWrite;
    }
  });

  it("prunes old automatic checkpoints without touching manual checkpoints", async () => {
    await Checkpoint.deleteMany({ gameId: tempGameId });
    const now = Date.now();
    const autoDocs = Array.from({ length: 45 }, (_, index) => ({
      checkpointId: `checkpoint_auto_prune_${tempGameId}_${index}`,
      gameId: tempGameId,
      title: `Auto checkpoint prune ${index}`,
      reason: "Fixture temporal para probar retencion de checkpoints automaticos.",
      day: 10,
      time: String(index).padStart(2, "0").slice(-2) + ":00",
      gameStateSnapshot: { gameId: tempGameId, currentDay: 10, time: "12:00" },
      changedCollectionsSnapshot: {},
      auto: true,
      triggerKey: `prune_fixture:${index}`,
      createdAt: new Date(now + index),
      updatedAt: new Date(now + index),
    }));
    const manualId = `checkpoint_manual_prune_${tempGameId}`;

    await Checkpoint.insertMany([
      ...autoDocs,
      {
        checkpointId: manualId,
        gameId: tempGameId,
        title: "Manual checkpoint prune fixture",
        reason: "Debe conservarse aunque existan muchos checkpoints automaticos.",
        day: 10,
        time: "12:00",
        gameStateSnapshot: { gameId: tempGameId, currentDay: 10, time: "12:00" },
        changedCollectionsSnapshot: {},
        auto: false,
      },
    ]);

    const result = await pruneAutomaticCheckpoints({ gameId: tempGameId, keep: 40 });
    assert.equal(result.deletedCount, 5);

    const autoCount = await Checkpoint.countDocuments({ gameId: tempGameId, auto: true });
    const manual = await Checkpoint.findOne({ checkpointId: manualId }).lean();
    assert.equal(autoCount, 40);
    assert.ok(manual);
  });

  it("keeps included contract meals available unless explicitly consumed", async () => {
    const originalState = await GameState.findOne({ gameId: tempGameId }).lean();
    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: 10,
          "diegeticDate.day": 10,
          block: "MaÃ±ana",
          time: "07:00",
          moneyCopper: 100,
          "lucasStatus.satiety.current": 66,
          "lucasStatus.satiety.label": "hambre leve",
          "lucasStatus.energy.current": 100,
          "lucasStatus.energy.label": "rendimiento normal",
          biologicalClock: {
            lastProcessedTime: "07:00",
            currentHourBlock: "07:00-08:00",
            pendingAccumulation: [],
            pendingAccumulations: [],
          },
        },
      }
    );
    await JobContract.updateOne({ contractId: tempJobContractId }, { $set: { flags: { testSuite: true } } });

    const completed = await post("/api/jobs/shifts/shift_test_morning_0700_1200/complete", {
      gameId: tempGameId,
      contractId: tempJobContractId,
      completionSummary: "Test controlado: completar turno sin consumir comida disponible.",
    });

    assert.equal(completed.status, 200, JSON.stringify(completed.data));
    assert.equal(completed.data.ok, true);
    assert.deepEqual(completed.data.result.changes.meals.applied, []);
    assert.deepEqual(completed.data.result.changes.meals.availableNotConsumed, ["meal_test_breakfast"]);
    assert.equal(completed.data.result.changes.meals.policy, "explicit_only");
    assert.equal(completed.data.result.after.satiety, 51);
    assert.equal(completed.data.result.after.energy, 70);
    assert.ok(
      completed.data.result.changes.physicalBreakdown.displayLines.some((line) =>
        line.includes("sin comida de contrato aplicada")
      )
    );

    const contractAfter = await JobContract.findOne({ contractId: tempJobContractId }).lean();
    assert.equal(contractAfter.flags.consumedMeals?.day_10?.meal_test_breakfast, undefined);

    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: originalState.currentDay,
          diegeticDate: originalState.diegeticDate,
          block: originalState.block,
          time: originalState.time,
          locationId: originalState.locationId,
          moneyCopper: originalState.moneyCopper,
          lucasStatus: originalState.lucasStatus,
          biologicalClock: originalState.biologicalClock,
        },
      }
    );
    await JobContract.updateOne({ contractId: tempJobContractId }, { $set: { flags: { testSuite: true } } });
  });

  it("applies included contract meals only when consumeIncludedMealIds requests them", async () => {
    const originalState = await GameState.findOne({ gameId: tempGameId }).lean();
    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: 10,
          "diegeticDate.day": 10,
          block: "MaÃ±ana",
          time: "07:00",
          moneyCopper: 100,
          "lucasStatus.satiety.current": 66,
          "lucasStatus.satiety.label": "hambre leve",
          "lucasStatus.energy.current": 98,
          "lucasStatus.energy.label": "rendimiento normal",
          biologicalClock: {
            lastProcessedTime: "07:00",
            currentHourBlock: "07:00-08:00",
            pendingAccumulation: [],
            pendingAccumulations: [],
          },
        },
      }
    );
    await JobContract.updateOne({ contractId: tempJobContractId }, { $set: { flags: { testSuite: true } } });

    const completed = await post("/api/jobs/shifts/shift_test_morning_0700_1200/complete", {
      gameId: tempGameId,
      contractId: tempJobContractId,
      consumeIncludedMealIds: ["meal_test_breakfast"],
      completionSummary: "Test controlado: completar turno consumiendo desayuno explicitamente.",
    });

    assert.equal(completed.status, 200, JSON.stringify(completed.data));
    assert.equal(completed.data.ok, true);
    assert.deepEqual(completed.data.result.changes.meals.applied, ["meal_test_breakfast"]);
    assert.deepEqual(completed.data.result.changes.meals.availableNotConsumed, []);
    assert.equal(completed.data.result.after.satiety, 71);
    assert.equal(completed.data.result.after.energy, 70);

    const contractAfter = await JobContract.findOne({ contractId: tempJobContractId }).lean();
    assert.equal(contractAfter.flags.consumedMeals.day_10.meal_test_breakfast.status, "applied_by_complete_shift");

    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: originalState.currentDay,
          diegeticDate: originalState.diegeticDate,
          block: originalState.block,
          time: originalState.time,
          locationId: originalState.locationId,
          moneyCopper: originalState.moneyCopper,
          lucasStatus: originalState.lucasStatus,
          biologicalClock: originalState.biologicalClock,
        },
      }
    );
    await JobContract.updateOne({ contractId: tempJobContractId }, { $set: { flags: { testSuite: true } } });
  });

  it("completes job shifts without duplicating consumed meals or pay", async () => {
    const originalState = await GameState.findOne({ gameId: tempGameId }).lean();
    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: 10,
          "diegeticDate.day": 10,
          block: "Mañana",
          time: "07:00",
          moneyCopper: 100,
          "lucasStatus.satiety.current": 66,
          "lucasStatus.satiety.label": "hambre leve",
          "lucasStatus.energy.current": 100,
          "lucasStatus.energy.label": "rendimiento normal",
          biologicalClock: {
            lastProcessedTime: "07:00",
            currentHourBlock: "07:00-08:00",
            pendingAccumulation: [],
            pendingAccumulations: [
              {
                accumulationId: "bioacc_test_shift_overlap",
                gameId: tempGameId,
                characterId: "char_lucas",
                day: 10,
                blockStart: "07:00",
                blockEnd: "08:00",
                category: "actividad_normal",
                minutes: 5,
                reason: "Fixture de acumulador pendiente cubierto por turno completo.",
                source: "test",
                status: "pending",
              },
            ],
          },
        },
      }
    );

    const completed = await post("/api/jobs/shifts/shift_test_morning_0700_1200/complete", {
      gameId: tempGameId,
      contractId: tempJobContractId,
      alreadyConsumedMealIds: ["meal_test_breakfast"],
      completionSummary: "Test controlado: completar turno sin duplicar desayuno.",
    });

    assert.equal(completed.status, 200);
    assert.equal(completed.data.ok, true);
    assert.equal(completed.data.result.alreadyCompleted, false);
    assert.deepEqual(completed.data.result.changes.meals.applied, []);
    assert.deepEqual(completed.data.result.changes.meals.markedConsumed, ["meal_test_breakfast"]);
    assert.equal(completed.data.result.changes.pay.delta, 70);
    assert.equal(completed.data.result.changes.autoCheckpoint.created, true);
    assert.equal(
      completed.data.result.changes.autoCheckpoint.checkpoint.triggerKey,
      "complete_job_shift:shift_test_morning_0700_1200"
    );
    assert.equal(completed.data.result.after.moneyCopper, 170);
    assert.equal(completed.data.result.after.time, "12:00");
    assert.equal(completed.data.result.after.satiety, 51);
    assert.equal(completed.data.result.after.energy, 70);
    assert.deepEqual(completed.data.result.changes.physicalBreakdown.start, {
      satiety: 66,
      energy: 100,
    });
    assert.deepEqual(completed.data.result.changes.physicalBreakdown.afterMeals, {
      satiety: 66,
      energy: 100,
    });
    assert.deepEqual(completed.data.result.changes.physicalBreakdown.final, {
      satiety: 51,
      energy: 70,
    });
    assert.ok(
      completed.data.result.changes.physicalBreakdown.displayLines.some((line) =>
        line.includes("Saciedad: 66->51 tras trabajo (sin comida de contrato aplicada)")
      )
    );
    assert.deepEqual(
      completed.data.result.changes.biologicalClock.coveredPendingAccumulations.map((entry) => entry.accumulationId),
      ["bioacc_test_shift_overlap"]
    );
    assert.equal(completed.data.result.changes.missionExpiry.expiredCount, 1);
    assert.equal(completed.data.result.changes.missionExpiry.expired[0].missionId, tempExpiredMissionId);

    const stateAfterComplete = await GameState.findOne({ gameId: tempGameId }).lean();
    assert.equal(stateAfterComplete.moneyCopper, 170);
    assert.equal(stateAfterComplete.lucasStatus.satiety.current, 51);
    assert.equal(stateAfterComplete.lucasStatus.energy.current, 70);
    const coveredAccumulation = stateAfterComplete.biologicalClock.pendingAccumulations.find(
      (entry) => entry.accumulationId === "bioacc_test_shift_overlap"
    );
    assert.equal(coveredAccumulation.status, "processed");
    assert.equal(coveredAccumulation.processedMode, "covered_by_complete_job_shift");
    const expiredMission = await Mission.findOne({ missionId: tempExpiredMissionId }).lean();
    assert.equal(expiredMission.status, "expired");
    const shiftCheckpoint = await Checkpoint.findOne({
      gameId: tempGameId,
      auto: true,
      triggerKey: "complete_job_shift:shift_test_morning_0700_1200",
      day: 10,
      time: "12:00",
    }).lean();
    assert.ok(shiftCheckpoint);

    const repeated = await post("/api/jobs/shifts/shift_test_morning_0700_1200/complete", {
      gameId: tempGameId,
      contractId: tempJobContractId,
      completionSummary: "Test controlado: completar turno repetido.",
    });
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.ok, true);
    assert.equal(repeated.data.result.alreadyCompleted, true);

    const stateAfterRepeated = await GameState.findOne({ gameId: tempGameId }).lean();
    assert.equal(stateAfterRepeated.moneyCopper, 170);
    assert.equal(stateAfterRepeated.lucasStatus.satiety.current, 51);
    assert.equal(stateAfterRepeated.lucasStatus.energy.current, 70);

    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: originalState.currentDay,
          diegeticDate: originalState.diegeticDate,
          block: originalState.block,
          time: originalState.time,
          locationId: originalState.locationId,
          moneyCopper: originalState.moneyCopper,
          lucasStatus: originalState.lucasStatus,
          biologicalClock: originalState.biologicalClock,
        },
      }
    );
    await JobContract.updateOne({ contractId: tempJobContractId }, { $set: { flags: { testSuite: true } } });
  });

  it("formalizes inactive job shifts and blocks future completion", async () => {
    const originalState = await GameState.findOne({ gameId: tempGameId }).lean();
    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: 10,
          "diegeticDate.day": 10,
          block: "Mediodía",
          time: "12:00",
          locationId: "loc_hoshimori_grulla_azul_comedor",
          biologicalClock: {
            lastProcessedTime: "12:00",
            currentHourBlock: "12:00-13:00",
            pendingAccumulation: [],
            pendingAccumulations: [],
          },
        },
      }
    );
    await JobContract.updateOne({ contractId: tempJobContractId }, { $set: { flags: { testSuite: true } } });

    const patched = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: formalizar fin de turno laboral futuro.",
      jobContractPatch: {
        contractId: tempJobContractId,
        shiftId: "shift_test_morning_0700_1200",
        status: "ended",
        activeUntilDay: 10,
        inactiveFromDay: 11,
        reason: "Fixture: Lucas deja este turno desde Dia 11.",
      },
      biologicalCostExemptReason: "Cambio administrativo de contrato sin actividad fisica.",
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de jobContractPatch.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });

    assert.equal(patched.status, 200, JSON.stringify(patched.data));
    assert.equal(patched.data.ok, true);
    assert.equal(patched.data.changes.jobContracts[0].shiftId, "shift_test_morning_0700_1200");
    assert.equal(patched.data.changes.jobContracts[0].after.status, "ended");
    assert.equal(patched.data.changes.autoCheckpoint.created, true);

    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: 11,
          "diegeticDate.day": 11,
          block: "Mañana",
          time: "07:00",
          "lucasStatus.satiety.current": 80,
          "lucasStatus.energy.current": 90,
        },
      }
    );

    const preview = await post("/api/jobs/shifts/shift_test_morning_0700_1200/preview", {
      gameId: tempGameId,
      contractId: tempJobContractId,
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.data.preview.availability.canStart, false);
    assert.equal(preview.data.preview.availability.status, "ended");

    const blocked = await post("/api/jobs/shifts/shift_test_morning_0700_1200/complete", {
      gameId: tempGameId,
      contractId: tempJobContractId,
      completionSummary: "Test controlado: no debe completarse un turno terminado.",
    });
    assert.equal(blocked.status, 400);
    assert.match(blocked.data.error, /ya no esta activo/);

    await JobContract.updateOne({ contractId: tempJobContractId }, { $set: { flags: { testSuite: true } } });
    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: originalState.currentDay,
          diegeticDate: originalState.diegeticDate,
          block: originalState.block,
          time: originalState.time,
          locationId: originalState.locationId,
          activeEventIds: originalState.activeEventIds || [],
          activeMissionIds: originalState.activeMissionIds || [],
          lucasStatus: originalState.lucasStatus,
          biologicalClock: originalState.biologicalClock,
        },
      }
    );
  });

  it("infers already consumed contract meals from formal meal logs", async () => {
    const originalState = await GameState.findOne({ gameId: tempGameId }).lean();
    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: 10,
          "diegeticDate.day": 10,
          block: "Mañana",
          time: "07:00",
          moneyCopper: 100,
          "lucasStatus.satiety.current": 66,
          "lucasStatus.satiety.label": "hambre leve",
          "lucasStatus.energy.current": 100,
          "lucasStatus.energy.label": "rendimiento normal",
          biologicalClock: {
            lastProcessedTime: "07:00",
            currentHourBlock: "07:00-08:00",
            pendingAccumulation: [],
            pendingAccumulations: [],
          },
        },
      }
    );
    await JobContract.updateOne({ contractId: tempJobContractId }, { $set: { flags: { testSuite: true } } });

    try {
      const mealLogId = `log_test_contract_breakfast_${Date.now()}`;
      await EventLog.create({
        logId: mealLogId,
        gameId: tempGameId,
        day: 10,
        timeStart: "06:55",
        timeEnd: "07:00",
        locationId: "loc_hoshimori_grulla_azul",
        type: "meal",
        summary: "Lucas comio rapidamente el desayuno de contrato antes de empezar el turno.",
        involvedCharacterIds: ["char_lucas"],
        involvedNpcIds: ["npc_roberto_valen"],
        mechanicalChanges: {
          mealId: "meal_test_breakfast",
          satietyDelta: 10,
        },
        visibility: "hidden",
        source: "backend_validation",
        tags: ["test_turn_hardening", "meal", "contract_breakfast", "quick_meal"],
      });

      const preview = await post("/api/jobs/shifts/shift_test_morning_0700_1200/preview", {
        gameId: tempGameId,
        contractId: tempJobContractId,
      });
      assert.equal(preview.status, 200);
      assert.equal(preview.data.ok, true);
      assert.deepEqual(preview.data.preview.inferredConsumedMealIds, ["meal_test_breakfast"]);
      assert.equal(preview.data.preview.mealBenefits[0].consumedToday, true);
      assert.equal(preview.data.preview.availableMealBenefits.length, 0);

      const completed = await post("/api/jobs/shifts/shift_test_morning_0700_1200/complete", {
        gameId: tempGameId,
        contractId: tempJobContractId,
        completionSummary: "Test controlado: completar turno con desayuno inferido desde log.",
      });

      assert.equal(completed.status, 200);
      assert.equal(completed.data.ok, true);
      assert.equal(completed.data.result.alreadyCompleted, false);
      assert.deepEqual(completed.data.result.changes.meals.applied, []);
      assert.deepEqual(completed.data.result.changes.meals.markedConsumed, ["meal_test_breakfast"]);
      assert.deepEqual(completed.data.result.changes.meals.inferredConsumed, ["meal_test_breakfast"]);
      assert.equal(completed.data.result.changes.pay.delta, 70);
      assert.equal(completed.data.result.after.moneyCopper, 170);
      assert.equal(completed.data.result.after.time, "12:00");
      assert.equal(completed.data.result.after.satiety, 51);
      assert.equal(completed.data.result.after.energy, 70);
      assert.equal(completed.data.result.changes.ledger.mealInferredConsumedIds[0], "meal_test_breakfast");

      const contractAfter = await JobContract.findOne({ contractId: tempJobContractId }).lean();
      const mealLedger = contractAfter.flags.consumedMeals.day_10.meal_test_breakfast;
      assert.equal(mealLedger.status, "inferred_consumed_before_shift_completion");
      assert.equal(mealLedger.inferredFromEventLogId, mealLogId);
    } finally {
      await GameState.updateOne(
        { gameId: tempGameId },
        {
          $set: {
            currentDay: originalState.currentDay,
            diegeticDate: originalState.diegeticDate,
            block: originalState.block,
            time: originalState.time,
            locationId: originalState.locationId,
            moneyCopper: originalState.moneyCopper,
            lucasStatus: originalState.lucasStatus,
            biologicalClock: originalState.biologicalClock,
          },
        }
      );
      await JobContract.updateOne({ contractId: tempJobContractId }, { $set: { flags: { testSuite: true } } });
    }
  });

  it("blocks Cobre mission acceptance while formal guild registration is pending unless overridden", async () => {
    const blocked = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Intento invalido de test: aceptar Cobre con registro pendiente.",
      missionPatch: {
        op: "accept",
        missionId: tempGuildMissionId,
      },
    });
    assert.equal(blocked.status, 400);
    assert.match(blocked.data.error, /registro formal del gremio/);

    const overridden = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: aceptar Cobre con override formal.",
      missionPatch: {
        op: "accept",
        missionId: tempGuildMissionId,
        registrationOverride: true,
        overrideReason: "Fixture de test con supervisor autorizado.",
      },
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de registro gremial con override.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });
    assert.equal(overridden.status, 200);
    assert.equal(overridden.data.ok, true);
    assert.equal(overridden.data.changes.missions[0].after.status, "accepted");
    assert.equal(
      overridden.data.changes.missions[0].after.flags.acceptedWithRegistrationOverride.reason,
      "Fixture de test con supervisor autorizado."
    );
  });

  it("closes main events formally and delays the next main event until the next day", async () => {
    const eventId = `event_${tempGameId}_main_resolution`;
    const originalState = await GameState.findOne({ gameId: tempGameId }).lean();
    await WorldEvent.deleteMany({ gameId: tempGameId, tags: "daily_event" });
    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: 15,
          "diegeticDate.day": 15,
          block: "Tarde",
          time: "15:00",
          activeEventIds: [eventId],
          biologicalClock: {
            lastProcessedTime: "15:00",
            currentHourBlock: "15:00-16:00",
            pendingAccumulation: [],
            pendingAccumulations: [],
          },
        },
      }
    );

    await WorldEvent.create({
      eventId,
      gameId: tempGameId,
      templateId: "test_main_event_resolution",
      title: "Evento principal temporal de test",
      type: "test_main_event",
      scope: "local",
      status: "active",
      eventLayer: "main_event",
      countsAsMainEvent: true,
      blocksMainEventGeneration: true,
      startDay: 15,
      startTime: "14:00",
      endDay: 15,
      endTime: "18:00",
      affectedLocationIds: ["loc_hoshimori_grulla_azul"],
      affectedNpcIds: ["npc_roberto_valen"],
      affectedFactionIds: ["faction_grulla_azul"],
      effects: [],
      visibility: "local",
      cause: "Fixture temporal para cierre de evento principal.",
      severity: "minor",
      createdBy: "system",
      tags: ["test_turn_hardening", "daily_event", "daily_event_day_15"],
    });

    const closed = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: cerrar evento principal.",
      worldEventPatches: [
        {
          eventId,
          status: "resolved",
          reason: "Fixture: Lucas resolvio el evento principal.",
          resolutionSummary: "Lucas resolvio el asunto sin consecuencias mayores.",
          consequenceSummary: "La siguiente tirada principal queda para el dia siguiente.",
          socialOutcome: "resolved",
          resolvedByCharacterId: "char_lucas",
        },
      ],
      biologicalCostExemptReason: "Cierre tecnico de evento sin actividad fisica.",
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de cierre formal de evento principal.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });

    assert.equal(closed.status, 200);
    assert.equal(closed.data.ok, true);
    const eventChange = closed.data.changes.worldEvents[0];
    assert.equal(eventChange.eventId, eventId);
    assert.equal(eventChange.status, "resolved");
    assert.equal(eventChange.blocksMainEventGeneration, false);
    assert.equal(eventChange.resolution.outcome, "resolved");
    assert.equal(eventChange.resolution.day, 15);
    assert.equal(eventChange.resolution.nextMainEventEligibleDay, 16);
    assert.ok(eventChange.tags.includes("event_resolved"));
    assert.ok(eventChange.tags.includes("event_outcome_resolved"));
    assert.ok(eventChange.effects.some((effect) => effect.type === "event_resolution"));

    const stateAfterClose = await GameState.findOne({ gameId: tempGameId }).lean();
    assert.equal(stateAfterClose.activeEventIds.includes(eventId), false);

    const sameDayEnsure = await ensureDailyEventForGameState(stateAfterClose, {
      rolls: { blockRoll: 1, importanceRoll: 1, durationRoll: 1, importance: "minor" },
    });
    assert.equal(sameDayEnsure.generated, false);
    assert.ok(
      ["daily_event_already_exists_for_day", "main_event_closed_today_next_generation_tomorrow"].includes(
        sameDayEnsure.reason
      )
    );
    if (sameDayEnsure.reason === "daily_event_already_exists_for_day") {
      assert.equal(sameDayEnsure.event.eventId, eventId);
    } else {
      assert.equal(sameDayEnsure.nextEligibleDay, 16);
    }

    const nextDayState = {
      ...stateAfterClose,
      currentDay: 16,
      time: "06:00",
      block: "MaÃ±ana",
      activeEventIds: [],
    };
    const nextDayEnsure = await ensureDailyEventForGameState(nextDayState, {
      rolls: { blockRoll: 2, importanceRoll: 8, durationRoll: 2, importance: "important" },
    });
    assert.equal(nextDayEnsure.generated, true);
    assert.equal(nextDayEnsure.event.startDay, 16);
    assert.ok(nextDayEnsure.event.tags.includes("daily_event_day_16"));

    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: originalState.currentDay,
          diegeticDate: originalState.diegeticDate,
          block: originalState.block,
          time: originalState.time,
          locationId: originalState.locationId,
          activeEventIds: originalState.activeEventIds || [],
          activeMissionIds: originalState.activeMissionIds || [],
          lucasStatus: originalState.lucasStatus,
          moneyCopper: originalState.moneyCopper,
          biologicalClock: originalState.biologicalClock,
        },
      }
    );
  });

  it("creates generic job contracts and records attendance formally", async () => {
    tempCreatedJobContractId = `contract_test_secondary_${Date.now()}`;

    const created = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: crear un contrato laboral generico.",
      jobContractPatch: {
        op: "create_contract",
        contractId: tempCreatedJobContractId,
        jobId: "job_test_market_helper",
        title: "Ayudante temporal del mercado",
        employerNpcId: "npc_irma",
        locationId: "loc_hoshimori_market",
        factionId: "faction_hoshimori_merchants",
        startDay: 10,
        pay: { dailyCopper: 50, notes: "Pago temporal de test." },
        includesMeals: false,
        shifts: [
          {
            shiftId: "shift_test_market_0800_1000",
            name: "Turno temporal de mercado",
            startTime: "08:00",
            endTime: "10:00",
            expectedMinutes: 120,
            activityCategory: "trabajo_normal",
            payCopper: 50,
            lateGraceMinutes: 10,
            absenceConsequences: ["Perder confianza comercial si falta sin avisar."],
            typicalTasks: ["Ordenar cajones", "llevar recados simples"],
          },
        ],
        typicalTasks: ["Apoyo simple de mercado."],
        absenceRules: ["Avisar antes del inicio si no puede ir."],
        source: "test_turn_hardening",
        tags: ["test_turn_hardening"],
        reason: "Fixture de contrato laboral generico.",
      },
      biologicalCostExemptReason: "Alta administrativa de contrato sin actividad fisica.",
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de create_contract.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });

    assert.equal(created.status, 200);
    assert.equal(created.data.ok, true);
    assert.equal(created.data.changes.jobContracts[0].op, "create_contract");
    assert.equal(created.data.changes.jobContracts[0].contractId, tempCreatedJobContractId);
    assert.ok(created.data.changes.jobContracts[0].displayLines[0].includes("Contrato laboral creado"));

    const recordedLate = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: registrar llegada tarde a un trabajo generico.",
      jobContractPatch: {
        op: "record_shift_late",
        contractId: tempCreatedJobContractId,
        shiftId: "shift_test_market_0800_1000",
        day: 11,
        time: "08:12",
        minutesLate: 12,
        excused: true,
        consequenceApplied: false,
        reason: "Fixture: Lucas aviso y llego tarde por causa justificada.",
      },
      biologicalCostExemptReason: "Registro administrativo sin actividad fisica.",
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de asistencia laboral.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });

    assert.equal(recordedLate.status, 200);
    assert.equal(recordedLate.data.ok, true);
    const attendanceChange = recordedLate.data.changes.jobContracts[0];
    assert.equal(attendanceChange.op, "record_shift_late");
    assert.equal(attendanceChange.attendance.status, "late");
    assert.equal(attendanceChange.attendance.minutesLate, 12);
    assert.equal(attendanceChange.attendance.excused, true);

    const contract = await JobContract.findOne({ contractId: tempCreatedJobContractId }).lean();
    assert.equal(contract.flags.attendance.day_11.shift_test_market_0800_1000.status, "late");
    assert.equal(contract.flags.attendance.day_11.shift_test_market_0800_1000.minutesLate, 12);
  });

  it("applies skill patches only through validated progression ranges", async () => {
    const beforeState = await getCanonicalState(tempGameId);
    const beforeSkill = await GameState.findOne(
      { gameId: tempGameId },
      { skills: { $elemMatch: { skillId: "skill_percepcion" } } }
    ).lean();
    const initialPerception = beforeSkill.skills[0];

    const missingCategory = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Intento invalido de test: skillPatch sin categoria.",
      skillPatch: [
        {
          skillId: "skill_percepcion",
          expDelta: 1,
          reason: "Revision de detalles sin categoria canonica.",
        },
      ],
    });
    assert.equal(missingCategory.status, 400);
    assert.match(missingCategory.data.error, /category es obligatorio/);
    assertSameState(beforeState, await getCanonicalState(tempGameId));

    const unknownCategory = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Intento invalido de test: skillPatch con categoria inventada.",
      skillPatch: [
        {
          skillId: "skill_percepcion",
          expDelta: 1,
          category: "categoria_inventada",
          reason: "Revision de detalles con categoria inexistente.",
        },
      ],
    });
    assert.equal(unknownCategory.status, 400);
    assert.match(unknownCategory.data.error, /rango conocido/);
    assertSameState(beforeState, await getCanonicalState(tempGameId));

    const oversized = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Intento invalido de test: skillPatch con EXP excesiva.",
      skillPatch: [
        {
          skillId: "skill_percepcion",
          expDelta: 50,
          category: "buscar_detalles_30min",
          reason: "Revision de detalles con EXP excesiva para el rango.",
        },
      ],
    });
    assert.equal(oversized.status, 400);
    assert.match(oversized.data.error, /Skill patch invalido/);
    assert.match(oversized.data.details.issues[0], /supera el rango/);
    assertSameState(beforeState, await getCanonicalState(tempGameId));

    const valid = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: progreso perceptivo validado.",
      skillPatch: [
        {
          skillId: "skill_percepcion",
          expDelta: 2,
          category: "buscar_detalles_30min",
          reason: "Lucas revisa detalles durante media hora de prueba.",
        },
      ],
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de skillPatch validado.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });
    assert.equal(valid.status, 200);
    assert.equal(valid.data.ok, true);
    assert.equal(valid.data.changes.skills[0].skillId, "skill_percepcion");
    assert.equal(valid.data.changes.skills[0].category, "buscar_detalles_30min");
    assert.equal(valid.data.changes.skills[0].baseExpDelta, 2);
    assert.equal(valid.data.changes.skills[0].effectiveExpDelta, 2);
    assert.equal(valid.data.changes.skills[0].after.exp, initialPerception.exp + 2);

    const afterSkill = await GameState.findOne(
      { gameId: tempGameId },
      { skills: { $elemMatch: { skillId: "skill_percepcion" } } }
    ).lean();
    assert.equal(afterSkill.skills[0].exp, initialPerception.exp + 2);
  });

  it("applies npc relationship patches through applyTurn", async () => {
    const oversizedDelta = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Intento invalido de test: delta social excesivo.",
      npcRelationshipPatches: [
        {
          npcId: tempNpcId,
          trustDelta: 4,
          reason: "Delta fuera de rango.",
        },
      ],
    });
    assert.equal(oversizedDelta.status, 400);
    assert.match(oversizedDelta.data.error, /entre -3 y 3/);

    const missingReason = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Intento invalido de test: relacion sin motivo.",
      npcRelationshipPatches: [
        {
          npcId: tempNpcId,
          trustDelta: 1,
        },
      ],
    });
    assert.equal(missingReason.status, 400);
    assert.match(missingReason.data.error, /reason es obligatorio/);

    const beforeNpc = await Npc.findOne({ npcId: tempNpcId }).lean();
    assert.equal(beforeNpc.relationshipWithLucas.trust, 10);

    const relationship = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: cambio social validado.",
      npcRelationshipPatches: [
        {
          npcId: tempNpcId,
          trustDelta: 2,
          respectDelta: 1,
          familiarityDelta: 1,
          reason: "Accion social relevante validada por test.",
          actionType: "test_reliable_help",
          notes: "Fixture temporal actualizado por applyTurn.",
          tags: ["test_turn_hardening"],
        },
      ],
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de npcRelationshipPatches.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });

    assert.equal(relationship.status, 200);
    assert.equal(relationship.data.ok, true);
    assert.equal(relationship.data.changes.npcRelationships[0].npcId, tempNpcId);
    assert.equal(relationship.data.changes.npcRelationships[0].after.trust, 12);
    assert.equal(relationship.data.changes.npcRelationships[0].after.respect, 6);
    assert.equal(relationship.data.changes.npcRelationships[0].after.familiarity, 1);
    assert.equal(relationship.data.changes.npcRelationships[0].appliedDeltas.trust, 2);
    assert.deepEqual(
      relationship.data.changes.npcRelationships[0].fieldChanges
        .filter((entry) => ["trust", "respect", "familiarity"].includes(entry.field))
        .map((entry) => ({
          field: entry.field,
          before: entry.before,
          after: entry.after,
          appliedDelta: entry.appliedDelta,
          display: entry.display,
        })),
      [
        { field: "trust", before: 10, after: 12, appliedDelta: 2, display: "Confianza: 10->12 (+2)" },
        { field: "familiarity", before: 0, after: 1, appliedDelta: 1, display: "Familiaridad: 0->1 (+1)" },
        { field: "respect", before: 5, after: 6, appliedDelta: 1, display: "Respeto: 5->6 (+1)" },
      ]
    );
    assert.ok(relationship.data.changes.npcRelationships[0].displayLines.includes("Confianza: 10->12 (+2)"));
    assert.ok(Array.isArray(relationship.data.changes.npcRelationships[0].milestoneLines));
    assert.equal(relationship.data.changes.npcRelationships[0].milestoneLines.length, 0);
    assert.ok(Array.isArray(relationship.data.changes.npcRelationships[0].milestoneSceneCues));
    assert.equal(relationship.data.changes.npcRelationships[0].milestoneSceneCues.length, 0);
    assert.ok(relationship.data.changes.npcRelationships[0].ledgerId);

    const firstLedger = await NpcSocialLedger.findOne({
      ledgerId: relationship.data.changes.npcRelationships[0].ledgerId,
    }).lean();
    assert.equal(firstLedger.npcId, tempNpcId);
    assert.equal(firstLedger.appliedDeltas.trust, 2);
    assert.equal(firstLedger.appliedDeltas.respect, 1);

    const cappedRelationship = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: cap diario social.",
      npcRelationshipPatches: [
        {
          npcId: tempNpcId,
          trustDelta: 3,
          reason: "Accion social repetida que debe respetar cap diario.",
          actionType: "test_reliable_help",
          tags: ["test_turn_hardening"],
        },
      ],
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de cap diario social.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });

    assert.equal(cappedRelationship.status, 200);
    assert.equal(cappedRelationship.data.ok, true);
    assert.equal(cappedRelationship.data.changes.npcRelationships[0].requestedDeltas.trust, 3);
    assert.equal(cappedRelationship.data.changes.npcRelationships[0].appliedDeltas.trust, 1);
    assert.equal(cappedRelationship.data.changes.npcRelationships[0].after.trust, 13);
    assert.equal(cappedRelationship.data.changes.npcRelationships[0].fieldChanges[0].before, 12);
    assert.equal(cappedRelationship.data.changes.npcRelationships[0].fieldChanges[0].after, 13);
    assert.equal(cappedRelationship.data.changes.npcRelationships[0].fieldChanges[0].display, "Confianza: 12->13 (+1)");
    assert.equal(
      cappedRelationship.data.changes.npcRelationships[0].caps.fields.trust.reason,
      "daily_cap_trust"
    );
  });

  it("reports social milestone lines when a relationship crosses a band", async () => {
    await NpcSocialLedger.deleteMany({ npcId: tempNpcId, gameId: tempGameId });
    await Npc.updateOne(
      { npcId: tempNpcId },
      {
        $set: {
          "relationshipWithLucas.trust": 24,
          "relationshipWithLucas.familiarity": 0,
          "relationshipWithLucas.respect": 5,
        },
      }
    );

    const milestone = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: hito social por cruce de rango.",
      npcRelationshipPatches: [
        {
          npcId: tempNpcId,
          trustDelta: 1,
          reason: "Accion social suficiente para cruzar rango de confianza.",
          actionType: "test_milestone_help",
          tags: ["test_turn_hardening"],
        },
      ],
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de hito social.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });

    assert.equal(milestone.status, 200);
    const relationship = milestone.data.changes.npcRelationships[0];
    assert.equal(relationship.after.trust, 25);
    assert.equal(relationship.fieldChanges[0].bandChanged, true);
    assert.equal(relationship.fieldChanges[0].beforeBandKey, "low");
    assert.equal(relationship.fieldChanges[0].afterBandKey, "moderate");
    assert.ok(relationship.milestoneLines[0].includes("Confianza"));
    assert.ok(relationship.milestoneLines[0].includes("moderado"));
    assert.equal(relationship.milestoneSceneCues[0].npcName, "NPC Test Relacion");
    assert.equal(relationship.milestoneSceneCues[0].field, "trust");
    assert.equal(relationship.milestoneSceneCues[0].afterBand, "moderado");
    assert.ok(relationship.milestoneSceneCues[0].cue);
  });

  it("creates automatic checkpoints before direct combat mutations", async () => {
    await CombatEncounter.deleteMany({ gameId: tempGameId });
    await Checkpoint.deleteMany({ gameId: tempGameId, triggerKey: /^combat_/ });

    const started = await post("/api/combat/encounters/start", {
      gameId: tempGameId,
      enemyId: "enemy_lobo_borde",
      reason: "Test controlado: iniciar combate temporal.",
    });

    assert.equal(started.status, 200);
    assert.equal(started.data.ok, true);
    assert.equal(started.data.encounter.autoCheckpoint.created, true);
    assert.equal(started.data.encounter.autoCheckpoint.checkpoint.triggerKey, "combat_start:enemy_lobo_borde");

    const startCheckpoint = await Checkpoint.findOne({
      gameId: tempGameId,
      auto: true,
      triggerKey: "combat_start:enemy_lobo_borde",
    }).lean();
    assert.ok(startCheckpoint);

    const encounterId = started.data.encounter.encounterId;
    const invalidRound = await post(`/api/combat/encounters/${encodeURIComponent(encounterId)}/round`, {
      gameId: tempGameId,
      summary: "Test controlado: herida con severidad invalida.",
      enemyDamage: 0,
      addInjuries: [
        {
          injuryId: `injury_invalid_${Date.now()}`,
          location: "antebrazo",
          severity: "minor",
          description: "Severidad legacy no permitida.",
        },
      ],
    });

    assert.equal(invalidRound.status, 400);
    assert.equal(invalidRound.data.ok, false);
    assert.match(invalidRound.data.error, /severity invalida/);

    const skippedInvalidCheckpoint = await Checkpoint.findOne({
      gameId: tempGameId,
      auto: true,
      triggerKey: `combat_round:${encounterId}:r1`,
    }).lean();
    assert.equal(skippedInvalidCheckpoint, null);

    const round = await post(`/api/combat/encounters/${encodeURIComponent(encounterId)}/round`, {
      gameId: tempGameId,
      summary: "Test controlado: ronda con rasguno menor.",
      enemyDamage: 1,
      lucasPatch: { lifeDelta: -1 },
      addInjuries: [
        {
          injuryId: `injury_test_${Date.now()}`,
          location: "antebrazo",
          severity: "leve",
          description: "Rasguno menor de test.",
        },
      ],
    });

    assert.equal(round.status, 200);
    assert.equal(round.data.ok, true);
    assert.equal(round.data.autoCheckpoint.created, true);
    assert.equal(round.data.autoCheckpoint.checkpoint.triggerKey, `combat_round:${encounterId}:r1`);

    const roundCheckpoint = await Checkpoint.findOne({
      gameId: tempGameId,
      auto: true,
      triggerKey: `combat_round:${encounterId}:r1`,
    }).lean();
    assert.ok(roundCheckpoint);
  });

  it("blocks remote npc relationship patches unless a valid source links the npc", async () => {
    const remoteBefore = await Npc.findOne({ npcId: tempRemoteNpcId }).lean();
    assert.equal(remoteBefore.relationshipWithLucas.trust, 10);

    const blocked = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Intento invalido de test: cambio social remoto sin fuente.",
      npcRelationshipPatches: [
        {
          npcId: tempRemoteNpcId,
          trustDelta: 1,
          reason: "El NPC no esta presente ni vinculado por fuente.",
          actionType: "test_remote_invalid",
          tags: ["test_turn_hardening"],
        },
      ],
    });
    assert.equal(blocked.status, 400);
    assert.match(blocked.data.error, /NPC presente\/cercano o una fuente valida/);

    const remoteAfterBlocked = await Npc.findOne({ npcId: tempRemoteNpcId }).lean();
    assert.equal(remoteAfterBlocked.relationshipWithLucas.trust, 10);

    const sourceEventId = `event_${tempGameId}_remote_social_source`;
    await WorldEvent.create({
      eventId: sourceEventId,
      gameId: tempGameId,
      title: "Fixture de fuente social remota",
      type: "test_event",
      scope: "local",
      status: "active",
      startDay: 10,
      startTime: "12:00",
      endDay: 10,
      endTime: "18:00",
      affectedLocationIds: ["loc_hoshimori_market"],
      affectedNpcIds: [tempRemoteNpcId],
      affectedFactionIds: [],
      effects: [],
      visibility: "hidden",
      cause: "Fixture de test.",
      severity: "minor",
      createdBy: "system",
      tags: ["test_turn_hardening"],
    });

    const sourced = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: cambio social remoto con evento fuente valido.",
      npcRelationshipPatches: [
        {
          npcId: tempRemoteNpcId,
          trustDelta: 1,
          reason: "Evento fuente valido vincula al NPC remoto.",
          actionType: "test_remote_valid",
          sourceEventId,
          tags: ["test_turn_hardening"],
        },
      ],
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de fuente social remota.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });
    assert.equal(sourced.status, 200);
    assert.equal(sourced.data.ok, true);
    assert.equal(sourced.data.changes.npcRelationships[0].npcId, tempRemoteNpcId);
    assert.equal(sourced.data.changes.npcRelationships[0].after.trust, 11);
    assert.equal(sourced.data.changes.npcRelationships[0].validationContext.type, "sourceEventId");
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
    assert.equal(reportedMission.data.changes.missions[0].outcome.outcome, "awaiting_verification");
    assert.ok(
      reportedMission.data.changes.missions[0].outcome.nextSteps.some((line) =>
        line.includes("verificacion formal")
      )
    );

    const completeWithoutVerification = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Intento invalido de test: completar mision sin verificacion.",
      missionPatch: {
        op: "complete",
        missionId: tempMissionId,
        completionSummary: "Este cierre debe ser rechazado.",
      },
    });
    assert.equal(completeWithoutVerification.status, 400);
    assert.match(completeWithoutVerification.data.error, /proofStatus verified/);

    const verifiedMission = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: verificacion formal de mision.",
      missionPatch: {
        op: "verify",
        missionId: tempMissionId,
        proofStatus: "verified",
        verificationSummary: "Prueba revisada y aceptada por test.",
      },
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de missionPatch verify.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });
    assert.equal(verifiedMission.status, 200);
    assert.equal(verifiedMission.data.ok, true);
    assert.equal(verifiedMission.data.changes.missions[0].op, "verify");
    assert.equal(verifiedMission.data.changes.missions[0].after.proofStatus, "verified");
    assert.equal(verifiedMission.data.changes.missions[0].outcome.outcome, "ready_to_complete");

    const beforeComplete = await GameState.findOne({ gameId: tempGameId }).lean();
    const completedMission = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: completar y pagar mision formalmente.",
      missionPatch: {
        op: "complete",
        missionId: tempMissionId,
        completionSummary: "Mision temporal completada por test.",
      },
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de missionPatch complete.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });
    assert.equal(completedMission.status, 200);
    assert.equal(completedMission.data.ok, true);
    assert.equal(completedMission.data.changes.missions[0].op, "complete");
    assert.equal(completedMission.data.changes.missions[0].after.status, "completed");
    assert.equal(completedMission.data.changes.missions[0].after.completedDay, 10);
    assert.equal(completedMission.data.changes.missions[0].reward.money.delta, 1);
    assert.equal(completedMission.data.changes.missions[0].reward.alreadyPaid, false);
    assert.equal(completedMission.data.changes.missions[0].outcome.outcome, "completed");
    assert.ok(
      completedMission.data.changes.missions[0].outcome.rewardLines.includes("Recompensa pagada: 0 oro, 0 plata, 1 cobre.")
    );
    assert.equal(completedMission.data.gameState.moneyCopper, beforeComplete.moneyCopper + 1);
    assert.equal(completedMission.data.gameState.activeMissionIds.includes(tempMissionId), false);

    const repeatedComplete = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: repetir cierre idempotente.",
      missionPatch: {
        op: "complete",
        missionId: tempMissionId,
        completionSummary: "Reintento idempotente.",
      },
    });
    assert.equal(repeatedComplete.status, 200);
    assert.equal(repeatedComplete.data.ok, true);
    assert.equal(repeatedComplete.data.changes.missions[0].reward.alreadyPaid, true);
    assert.ok(
      repeatedComplete.data.changes.missions[0].outcome.rewardLines.includes(
        "Recompensa no duplicada: ya estaba pagada o la mision ya estaba cerrada."
      )
    );
    assert.equal(repeatedComplete.data.gameState.moneyCopper, beforeComplete.moneyCopper + 1);

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
    assert.equal(overnightSleep.data.changes.autoCheckpoint.created, true);
    assert.equal(overnightSleep.data.changes.autoCheckpoint.checkpoint.triggerKey, "apply_turn:day_change");
    assert.equal(overnightSleep.data.gameState.currentDay, 11);
    assert.equal(overnightSleep.data.gameState.diegeticDate.day, 11);
    assert.equal(overnightSleep.data.gameState.time, "06:00");
    assert.equal(overnightSleep.data.gameState.block, "Mañana");
    assert.equal(overnightSleep.data.gameState.lucasStatus.satiety.current, 69);
    assert.equal(overnightSleep.data.gameState.lucasStatus.energy.current, 100);
    const sleepCheckpoint = await Checkpoint.findOne({
      gameId: tempGameId,
      auto: true,
      triggerKey: "apply_turn:day_change",
      day: 11,
      time: "06:00",
    }).lean();
    assert.ok(sleepCheckpoint);

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
