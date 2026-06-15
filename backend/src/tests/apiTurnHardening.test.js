const { after, before, describe, it } = require("node:test");

const Checkpoint = require("../models/Checkpoint");
const CombatEncounter = require("../models/CombatEncounter");
const Commitment = require("../models/Commitment");
const Evidence = require("../models/Evidence");
const EventLog = require("../models/EventLog");
const Faction = require("../models/Faction");
const GameState = require("../models/GameState");
const InjuryRecord = require("../models/InjuryRecord");
const JobContract = require("../models/JobContract");
const CharacterMagicKnowledge = require("../models/CharacterMagicKnowledge");
const Mission = require("../models/Mission");
const Npc = require("../models/Npc");
const NpcSocialLedger = require("../models/NpcSocialLedger");
const TurnTrace = require("../models/TurnTrace");
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
let tempCanonLeakMissionId = "";
let tempJobContractId = "";
let tempCreatedJobContractId = "";
let tempNpcId = "";
let tempIdempotentNpcId = "";
let tempRemoteNpcId = "";
let tempFactionId = "";
let tempWeatherRegionId = "";
let tempMagicCharacterId = "";

async function createIsolatedGameState() {
  tempGameId = `test_turn_hardening_${Date.now()}`;
  tempMissionId = `mission_test_turn_hardening_${Date.now()}`;
  tempExpiredMissionId = `mission_test_turn_hardening_expired_${Date.now()}`;
  tempGuildMissionId = `mission_test_turn_hardening_cobre_${Date.now()}`;
  tempCanonLeakMissionId = `mission_test_turn_hardening_canon_leak_${Date.now()}`;
  tempJobContractId = `contract_test_turn_hardening_${Date.now()}`;
  tempNpcId = `npc_test_relationship_${Date.now()}`;
  tempIdempotentNpcId = `npc_test_idempotent_${Date.now()}`;
  tempRemoteNpcId = `npc_test_relationship_remote_${Date.now()}`;
  tempFactionId = `faction_test_institution_${Date.now()}`;
  tempWeatherRegionId = `region_test_turn_hardening_${Date.now()}`;
  tempMagicCharacterId = `char_test_magic_${Date.now()}`;

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

  await Mission.create({
    missionId: tempCanonLeakMissionId,
    templateId: "test_turn_hardening_canon_leak",
    title: "Test controlado invisible en canon",
    description: "Mision temporal para validar que fixtures testSuite no entren al contexto canon.",
    sourceFactionId: "faction_hoshimori_guild",
    clientNpcId: "npc_garrick_thorne",
    locationId: "loc_hoshimori_guild",
    rank: "Porcelana",
    requirements: [],
    reward: { moneyCopper: 1, items: [], other: "" },
    mgReward: 0,
    riskLevel: "none",
    status: "accepted",
    postedDay: 10,
    postedTime: "12:00",
    expiresDay: 10,
    expiresTime: "18:00",
    acceptedByCharacterId: "char_lucas",
    acceptedDay: 10,
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

  await Npc.create({
    npcId: tempIdempotentNpcId,
    name: "NPC Test Idempotencia",
    role: "fixture social idempotente",
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
      notes: "Fixture temporal para reintentos idempotentes.",
    },
  });

  await Faction.create({
    factionId: tempFactionId,
    name: "Institucion temporal de test",
    type: "guild",
    scope: "local",
    relationshipWithLucas: {
      reputation: 0,
      trust: 0,
      suspicion: 0,
      institutionalCredit: 0,
      merit: 0,
      accessLevel: "basic",
      notes: "Fixture temporal institucional.",
    },
    flags: { testSuite: true },
  });
}

async function cleanupIsolatedState() {
  if (tempGameId) await GameState.deleteOne({ gameId: tempGameId });
  if (tempGameId) await Checkpoint.deleteMany({ gameId: tempGameId });
  if (tempGameId) await CombatEncounter.deleteMany({ gameId: tempGameId });
  if (tempGameId) await Commitment.deleteMany({ gameId: tempGameId });
  if (tempGameId) await Evidence.deleteMany({ gameId: tempGameId });
  if (tempGameId) await InjuryRecord.deleteMany({ gameId: tempGameId });
  if (tempGameId) await TurnTrace.deleteMany({ gameId: tempGameId });
  if (tempGameId) await WorldEvent.deleteMany({ gameId: tempGameId });
  await Mission.deleteMany({
    missionId: {
      $in: [tempMissionId, tempExpiredMissionId, tempGuildMissionId, tempCanonLeakMissionId].filter(Boolean),
    },
  });
  await JobContract.deleteMany({
    contractId: { $in: [tempJobContractId, tempCreatedJobContractId].filter(Boolean) },
  });
  if (tempNpcId) await Npc.deleteOne({ npcId: tempNpcId });
  if (tempNpcId) await NpcSocialLedger.deleteMany({ npcId: tempNpcId });
  if (tempIdempotentNpcId) await Npc.deleteOne({ npcId: tempIdempotentNpcId });
  if (tempIdempotentNpcId) await NpcSocialLedger.deleteMany({ npcId: tempIdempotentNpcId });
  if (tempRemoteNpcId) await Npc.deleteOne({ npcId: tempRemoteNpcId });
  if (tempRemoteNpcId) await NpcSocialLedger.deleteMany({ npcId: tempRemoteNpcId });
  if (tempFactionId) await Faction.deleteOne({ factionId: tempFactionId });
  if (tempWeatherRegionId) await WeatherState.deleteMany({ regionId: tempWeatherRegionId });
  if (tempMagicCharacterId) await CharacterMagicKnowledge.deleteMany({ characterId: tempMagicCharacterId });
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

  it("keeps testSuite missions out of canonical board and compact context", async () => {
    const canonicalBoard = await get("/api/missions/board?status=accepted&locationId=loc_hoshimori_guild");
    assert.equal(canonicalBoard.status, 200);
    assert.equal(
      canonicalBoard.data.missions.some((mission) => mission.missionId === tempCanonLeakMissionId),
      false
    );

    const debugBoard = await get(
      `/api/missions/board?status=accepted&locationId=loc_hoshimori_guild&includeTestSuite=true`
    );
    assert.equal(debugBoard.status, 200);
    assert.equal(
      debugBoard.data.missions.some((mission) => mission.missionId === tempCanonLeakMissionId),
      true
    );

    const canonicalCompact = await get("/api/context/compact");
    assert.equal(canonicalCompact.status, 200);
    assert.equal(
      (canonicalCompact.data.context.activeMissions || []).some(
        (mission) => mission.missionId === tempCanonLeakMissionId
      ),
      false
    );
    assert.equal(
      (canonicalCompact.data.context.missionAgenda?.acceptedExpired || []).some(
        (mission) => mission.missionId === tempCanonLeakMissionId
      ),
      false
    );

    const isolatedCompact = await get(`/api/context/compact?gameId=${encodeURIComponent(tempGameId)}`);
    assert.equal(isolatedCompact.status, 200);
    assert.equal(
      (isolatedCompact.data.context.activeMissions || []).some(
        (mission) => mission.missionId === tempCanonLeakMissionId
      ),
      true
    );
  });

  it("shows formally blocked guild missions on the board with a clear block reason", async () => {
    const board = await get(
      `/api/missions/board?gameId=${encodeURIComponent(tempGameId)}&status=available&locationId=loc_hoshimori_guild`
    );
    assert.equal(board.status, 200, JSON.stringify(board.data));
    assert.equal(board.data.ok, true);

    const mission = board.data.missions.find((entry) => entry.missionId === tempGuildMissionId);
    assert.ok(mission, "Cobre mission should stay visible on the live board.");
    assert.equal(mission.status, "available");
    assert.equal(mission.boardVisibility.blocked, true);
    assert.equal(mission.boardVisibility.canAccept, false);
    assert.equal(mission.boardVisibility.displayStatus, "blocked_by_registration");
    assert.match(mission.boardVisibility.blockReason, /registro formal/);
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
          block: "Mañana",
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
    await Promise.all([
      Checkpoint.deleteMany({
        gameId: tempGameId,
        auto: true,
        triggerKey: "complete_job_shift:shift_test_morning_0700_1200",
        day: 10,
        time: "12:00",
      }),
      Mission.updateOne(
        { missionId: tempExpiredMissionId },
        {
          $set: {
            status: "available",
            proofStatus: "pending",
            expiresDay: 10,
            expiresTime: "11:00",
            flags: { testSuite: true },
          },
        }
      ),
    ]);
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

  it("tracks narrative commitments formally and removes them from pending context when fulfilled", async () => {
    const commitmentId = `commitment_test_${Date.now()}`;

    const created = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: Lucas promete preguntar en el gremio manana.",
      biologicalCostExemptReason: "Cambio formal de agenda sin actividad fisica.",
      commitmentPatches: {
        op: "create",
        commitmentId,
        title: "Preguntar en el gremio por los rastros del bosque",
        summary: "Lucas dijo que verificara el rumor con el gremio por la manana.",
        type: "promise",
        priority: "high",
        visibility: "private",
        dueDay: 11,
        dueTime: "09:00",
        targetNpcIds: [tempNpcId],
        tags: ["test_turn_hardening", "forest_tracks"],
      },
    });

    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.equal(created.data.ok, true);
    assert.equal(created.data.changes.commitments[0].commitmentId, commitmentId);
    assert.equal(created.data.changes.commitments[0].after.status, "pending");
    assert.equal(created.data.changes.autoCheckpoint.created, true);

    const compactWithPending = await get(`/api/context/compact?gameId=${encodeURIComponent(tempGameId)}`);
    assert.equal(compactWithPending.status, 200);
    assert.ok(
      compactWithPending.data.context.pendingCommitments.some(
        (commitment) => commitment.commitmentId === commitmentId && commitment.status === "pending"
      )
    );

    const fulfilled = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: Lucas cumplio la promesa de consultar el gremio.",
      biologicalCostExemptReason: "Cierre formal de compromiso sin actividad fisica.",
      commitmentPatches: {
        op: "fulfill",
        commitmentId,
        resolutionSummary: "Lucas consulto al gremio sobre los rastros del bosque.",
        reason: "Promesa cumplida.",
      },
    });

    assert.equal(fulfilled.status, 200, JSON.stringify(fulfilled.data));
    assert.equal(fulfilled.data.ok, true);
    assert.equal(fulfilled.data.changes.commitments[0].before.status, "pending");
    assert.equal(fulfilled.data.changes.commitments[0].after.status, "fulfilled");

    const compactAfterFulfill = await get(`/api/context/compact?gameId=${encodeURIComponent(tempGameId)}`);
    assert.equal(compactAfterFulfill.status, 200);
    assert.equal(
      compactAfterFulfill.data.context.pendingCommitments.some((commitment) => commitment.commitmentId === commitmentId),
      false
    );
  });

  it("surfaces overdue commitment consequences in compact context agenda", async () => {
    const originalState = await GameState.findOne({ gameId: tempGameId }).lean();
    const commitmentId = `commitment_consequence_test_${Date.now()}`;

    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: 10,
          time: "12:00",
          block: "Mediodía",
        },
      }
    );

    const created = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: Lucas fijo una cita que ya vencio.",
      biologicalCostExemptReason: "Creacion de compromiso de prueba sin actividad fisica.",
      commitmentPatches: {
        op: "create",
        commitmentId,
        title: "Encontrarse con Roberto antes del mediodia",
        summary: "Compromiso de prueba para verificar alertas de consecuencia.",
        type: "appointment",
        priority: "high",
        failureSeverity: "moderate",
        failureConsequence: "Roberto podria considerar que Lucas no respeta los horarios acordados.",
        successConsequence: "Roberto confirma que Lucas cumple con avisos importantes.",
        graceMinutes: 15,
        requiresExplicitResolution: true,
        dueDay: 10,
        dueTime: "11:00",
        targetNpcIds: [tempNpcId],
        tags: ["test_turn_hardening", "commitment_consequence"],
      },
    });

    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.equal(created.data.ok, true);
    assert.equal(created.data.changes.commitments[0].after.failureSeverity, "moderate");

    const compact = await get(`/api/context/compact?gameId=${encodeURIComponent(tempGameId)}`);
    assert.equal(compact.status, 200);

    const commitment = compact.data.context.pendingCommitments.find((entry) => entry.commitmentId === commitmentId);
    assert.ok(commitment, "Expected overdue commitment in compact context.");
    assert.equal(commitment.urgency, "consequence_ready");
    assert.equal(commitment.consequencePreview.pastGrace, true);
    assert.equal(commitment.consequencePreview.severity, "moderate");
    assert.equal(commitment.consequencePreview.requiresExplicitResolution, true);
    assert.ok(
      compact.data.context.commitmentAgenda.consequenceReady.some((entry) => entry.commitmentId === commitmentId)
    );
    assert.ok(
      compact.data.context.alerts.some(
        (alert) =>
          alert.type === "commitments_consequence_ready" &&
          alert.commitmentIds.includes(commitmentId)
      )
    );

    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: originalState.currentDay,
          time: originalState.time,
          block: originalState.block,
        },
      }
    );
  });

  it("surfaces promise/process reviews and unscheduled trackable commitments", async () => {
    const originalState = await GameState.findOne({ gameId: tempGameId }).lean();
    const reviewCommitmentId = `commitment_review_test_${Date.now()}`;
    const unscheduledCommitmentId = `commitment_unscheduled_test_${Date.now()}`;
    const conditionalCommitmentId = `commitment_conditional_test_${Date.now()}`;

    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: 10,
          time: "12:00",
          block: originalState.block,
        },
      }
    );

    const created = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: Mara da una estimacion cauta de tramite administrativo.",
      biologicalCostExemptReason: "Registro formal de pendiente administrativo sin actividad fisica.",
      commitmentPatches: [
        {
          op: "create",
          commitmentId: reviewCommitmentId,
          title: "Revisar cierre administrativo del registro",
          summary: "Mara debe revisar si el expediente de Lucas ya puede cerrarse o explicar el bloqueo.",
          type: "follow_up",
          promiseType: "administrative_process",
          promiseStrength: "soft",
          priority: "high",
          requiresExplicitResolution: true,
          nextCheckDay: 10,
          nextCheckTime: "11:45",
          speakerNpcId: tempNpcId,
          responsibleNpcId: tempNpcId,
          tags: ["test_turn_hardening", "commitment_review"],
        },
        {
          op: "create",
          commitmentId: unscheduledCommitmentId,
          title: "Confirmar una promesa sin fecha",
          summary: "Compromiso importante creado para probar que no queda flotando sin revision.",
          type: "promise",
          promiseType: "hard_promise",
          promiseStrength: "normal",
          priority: "normal",
          requiresExplicitResolution: true,
          targetNpcIds: [tempNpcId],
          tags: ["test_turn_hardening", "commitment_needs_schedule"],
        },
        {
          op: "create",
          commitmentId: conditionalCommitmentId,
          title: "Devolver un favor cuando la condicion exista",
          summary: "Promesa condicional de largo plazo para probar que no bloquea escenas normales.",
          type: "promise",
          promiseType: "debt_or_favor",
          promiseStrength: "soft",
          priority: "low",
          requiresExplicitResolution: true,
          conditionSummary: "Solo se activa si Lucas obtiene reconocimiento publico suficiente para cumplir el favor.",
          targetNpcIds: [tempNpcId],
          tags: ["test_turn_hardening", "commitment_conditional_dormant"],
        },
      ],
    });

    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.equal(created.data.ok, true);

    const compactWithReview = await get(`/api/context/compact?gameId=${encodeURIComponent(tempGameId)}`);
    assert.equal(compactWithReview.status, 200);

    const reviewCommitment = compactWithReview.data.context.pendingCommitments.find(
      (entry) => entry.commitmentId === reviewCommitmentId
    );
    assert.ok(reviewCommitment, "Expected process review commitment in compact context.");
    assert.equal(reviewCommitment.promiseType, "administrative_process");
    assert.equal(reviewCommitment.promiseStrength, "soft");
    assert.equal(reviewCommitment.nextCheckStatus, "review_overdue");
    assert.equal(reviewCommitment.urgency, "review_overdue");
    assert.ok(
      compactWithReview.data.context.commitmentAgenda.reviewDue.some(
        (entry) => entry.commitmentId === reviewCommitmentId
      )
    );
    assert.ok(
      compactWithReview.data.context.alerts.some(
        (alert) => alert.type === "commitments_review_due" && alert.commitmentIds.includes(reviewCommitmentId)
      )
    );

    const unscheduledCommitment = compactWithReview.data.context.pendingCommitments.find(
      (entry) => entry.commitmentId === unscheduledCommitmentId
    );
    assert.ok(unscheduledCommitment, "Expected unscheduled trackable commitment in compact context.");
    assert.equal(unscheduledCommitment.urgency, "needs_schedule");
    assert.ok(
      compactWithReview.data.context.commitmentAgenda.needsSchedule.some(
        (entry) => entry.commitmentId === unscheduledCommitmentId
      )
    );
    assert.ok(
      compactWithReview.data.context.alerts.some(
        (alert) =>
          alert.type === "commitments_need_schedule" && alert.commitmentIds.includes(unscheduledCommitmentId)
      )
    );
    assert.equal(
      compactWithReview.data.context.alerts.some(
        (alert) => alert.type === "commitments_need_schedule" && alert.commitmentIds.includes(conditionalCommitmentId)
      ),
      false
    );

    const conditionalCommitment = compactWithReview.data.context.pendingCommitments.find(
      (entry) => entry.commitmentId === conditionalCommitmentId
    );
    assert.ok(conditionalCommitment, "Expected conditional dormant commitment in compact context.");
    assert.equal(conditionalCommitment.urgency, "conditional_dormant");
    assert.ok(
      compactWithReview.data.context.commitmentAgenda.conditionalDormant.some(
        (entry) => entry.commitmentId === conditionalCommitmentId
      )
    );

    const reprogrammed = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: Mara explica demora y fija una nueva revision.",
      biologicalCostExemptReason: "Reprogramacion formal de pendiente administrativo sin actividad fisica.",
      commitmentPatches: {
        op: "update",
        commitmentId: reviewCommitmentId,
        nextCheckDay: 10,
        nextCheckTime: "13:00",
        blockerSummary: "Falta una firma interna; Mara se responsabiliza de revisar antes de media tarde.",
      },
    });

    assert.equal(reprogrammed.status, 200, JSON.stringify(reprogrammed.data));
    assert.equal(reprogrammed.data.ok, true);
    assert.equal(reprogrammed.data.changes.commitments[0].after.blockerSummary.includes("Falta una firma"), true);

    const compactAfterReprogram = await get(`/api/context/compact?gameId=${encodeURIComponent(tempGameId)}`);
    assert.equal(compactAfterReprogram.status, 200);
    const updatedReview = compactAfterReprogram.data.context.pendingCommitments.find(
      (entry) => entry.commitmentId === reviewCommitmentId
    );
    assert.ok(updatedReview, "Expected reprogrammed commitment in compact context.");
    assert.equal(updatedReview.nextCheckStatus, "review_soon");
    assert.equal(updatedReview.urgency, "review_soon");
    assert.ok(
      compactAfterReprogram.data.context.commitmentAgenda.reviewSoon.some(
        (entry) => entry.commitmentId === reviewCommitmentId
      )
    );

    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: originalState.currentDay,
          time: originalState.time,
          block: originalState.block,
        },
      }
    );
  });

  it("generates offscreen commitment review plans and applies controlled guild registration closure", async () => {
    const originalState = await GameState.findOne({ gameId: tempGameId }).lean();
    const commitmentId = `commitment_offscreen_review_test_${Date.now()}`;

    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: 10,
          time: "12:00",
          block: originalState.block,
          flags: {
            ...(originalState.flags || {}),
            formalGuildRegistrationPending: true,
            guild: {
              ...((originalState.flags || {}).guild || {}),
              registrationStatus: "pending",
            },
          },
        },
      }
    );

    await Commitment.create({
      gameId: tempGameId,
      commitmentId,
      title: "Cerrar registro formal de aspirante",
      summary: "Lucas completo su parte y el gremio debe cerrar la revision interna.",
      type: "follow_up",
      promiseType: "administrative_process",
      promiseStrength: "soft",
      status: "pending",
      priority: "high",
      requiresExplicitResolution: true,
      createdDay: 10,
      createdTime: "10:00",
      nextCheckDay: 10,
      nextCheckTime: "11:45",
      speakerNpcId: tempNpcId,
      responsibleNpcId: tempNpcId,
      responsibleFactionId: "faction_hoshimori_guild",
      relatedNpcIds: [tempNpcId],
      tags: ["test_turn_hardening", "guild_registration", "applicant_part_completed"],
    });

    try {
      const tickPreview = await post("/api/world/tick/preview", {
        gameId: tempGameId,
        fromDay: 10,
        fromTime: "10:00",
        toDay: 10,
        toTime: "12:00",
        dryRun: true,
      });

      assert.equal(tickPreview.status, 200, JSON.stringify(tickPreview.data));
      assert.equal(tickPreview.data.preview.willMutateGameState, false);
      const tickPlan = tickPreview.data.preview.commitmentReviews.plans.find(
        (plan) => plan.commitmentId === commitmentId
      );
      assert.ok(tickPlan, "Expected world tick to preview the due commitment review.");
      assert.equal(tickPlan.outcome, "fulfill");
      assert.equal(tickPlan.suggestedCommitmentPatch.op, "fulfill");
      assert.equal(tickPlan.suggestedGameStatePatch.formalGuildRegistrationPending, false);

      const compact = await get(`/api/context/compact?gameId=${encodeURIComponent(tempGameId)}`);
      assert.equal(compact.status, 200);
      const plan = compact.data.context.commitmentReviewAgenda.plans.find(
        (entry) => entry.commitmentId === commitmentId
      );
      assert.ok(plan, "Expected compact context to expose an offscreen review plan.");
      assert.equal(plan.outcome, "fulfill");
      assert.equal(plan.suggestedGameStatePatch.guildRegistrationStatus, "complete");
      assert.ok(
        compact.data.context.alerts.some(
          (alert) =>
            alert.type === "commitments_review_due" &&
            alert.reviewPlans.some((reviewPlan) => reviewPlan.commitmentId === commitmentId)
        )
      );

      const applied = await post("/api/turn/apply", {
        gameId: tempGameId,
        actionSummary: "Test controlado: el gremio cierra el registro formal segun reviewPlan.",
        biologicalCostExemptReason: "Cierre administrativo sin actividad fisica.",
        commitmentPatches: plan.suggestedCommitmentPatch,
        gameStatePatch: plan.suggestedGameStatePatch,
      });

      assert.equal(applied.status, 200, JSON.stringify(applied.data));
      assert.equal(applied.data.ok, true);
      assert.equal(applied.data.changes.commitments[0].after.status, "fulfilled");
      assert.equal(applied.data.changes.guildRegistration.after.formalGuildRegistrationPending, false);
      assert.equal(applied.data.changes.guildRegistration.after.registrationStatus, "complete");

      const afterCompact = await get(`/api/context/compact?gameId=${encodeURIComponent(tempGameId)}`);
      assert.equal(afterCompact.status, 200);
      assert.equal(afterCompact.data.context.guildState.formalGuildRegistrationPending, false);
      assert.equal(
        afterCompact.data.context.pendingCommitments.some((commitment) => commitment.commitmentId === commitmentId),
        false
      );
    } finally {
      await GameState.updateOne(
        { gameId: tempGameId },
        {
          $set: {
            currentDay: originalState.currentDay,
            time: originalState.time,
            block: originalState.block,
            flags: originalState.flags || {},
          },
        }
      );
    }
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
      block: "Mañana",
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

  it("persists narrative evidence and partial world event progress without using inventory", async () => {
    const eventId = `event_test_evidence_${Date.now()}`;
    const evidenceId = `evidence_test_sample_${Date.now()}`;

    await WorldEvent.create({
      eventId,
      gameId: tempGameId,
      title: "Rastro temporal de test",
      type: "test_investigation",
      scope: "local",
      status: "active",
      eventLayer: "main_event",
      countsAsMainEvent: true,
      blocksMainEventGeneration: true,
      startDay: 10,
      startTime: "08:00",
      affectedLocationIds: ["loc_hoshimori_forest_edge"],
      affectedNpcIds: [],
      effects: [],
      visibility: "local",
      cause: "Fixture temporal para evidencia.",
      severity: "minor",
      createdBy: "system",
      tags: ["test_turn_hardening", "daily_event"],
    });

    const collected = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: Lucas recoge una muestra fisica y reporta progreso parcial.",
      biologicalCostExemptReason: "Registro formal de evidencia sin coste fisico relevante.",
      evidencePatches: [
        {
          op: "collect",
          evidenceId,
          name: "Muestra fisica temporal",
          summary: "Muestra de prueba creada por test para representar evidencia fisica no vendible.",
          type: "sample",
          sourceEventId: eventId,
          relatedEventIds: [eventId],
          locationId: "loc_hoshimori_forest_edge",
          holderType: "character",
          holderId: "char_lucas",
          condition: "guardada",
          observationSummary: "La muestra fue recogida con cuidado para mostrarla a una autoridad.",
          tags: ["test_turn_hardening", "evidence_sample"],
        },
      ],
      worldEventPatches: [
        {
          eventId,
          status: "active",
          reason: "Fixture: evidencia parcial encontrada, evento aun no resuelto.",
          progress: {
            stage: "evidence_collected",
            statusLabel: "evidencia parcial recogida",
            summary: "Lucas encontro una muestra fisica, pero todavia no hay conclusion.",
            confidence: "partial",
            nextAction: "Reportar a una autoridad o conseguir identificacion.",
            evidenceIds: [evidenceId],
          },
        },
      ],
    });

    assert.equal(collected.status, 200, JSON.stringify(collected.data));
    assert.equal(collected.data.ok, true);
    assert.equal(collected.data.changes.evidence[0].evidenceId, evidenceId);
    assert.equal(collected.data.changes.evidence[0].after.status, "collected");
    assert.equal(collected.data.changes.worldEvents[0].progress.stage, "evidence_collected");
    assert.equal(collected.data.changes.worldEvents[0].status, "active");

    const compact = await get(`/api/context/compact?gameId=${encodeURIComponent(tempGameId)}&eventLimit=6`);
    assert.equal(compact.status, 200, JSON.stringify(compact.data));
    assert.ok(compact.data.context.carriedEvidence.some((entry) => entry.evidenceId === evidenceId));
    assert.equal(compact.data.context.mainEvent.progress.stage, "evidence_collected");

    const reported = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: Lucas reporta la muestra a un NPC responsable.",
      biologicalCostExemptReason: "Reporte formal de evidencia sin coste fisico relevante.",
      evidencePatches: [
        {
          op: "report",
          evidenceId,
          name: "Muestra fisica temporal",
          reportedToNpcIds: [tempNpcId],
          observationSummary: "La muestra fue mostrada a un NPC responsable sin convertirla en recompensa.",
          tags: ["test_turn_hardening", "evidence_reported"],
        },
      ],
      worldEventPatches: [
        {
          eventId,
          status: "active",
          reason: "Fixture: reporte parcial recibido, evento sigue abierto.",
          progress: {
            stage: "reported_partial",
            statusLabel: "evidencia parcial reportada",
            summary: "La evidencia fue reportada, pero aun requiere identificacion.",
            confidence: "partial",
            nextAction: "Evaluar la muestra antes de resolver el evento.",
            evidenceIds: [evidenceId],
            reportIds: ["report_test_partial"],
          },
        },
      ],
    });

    assert.equal(reported.status, 200, JSON.stringify(reported.data));
    assert.equal(reported.data.changes.evidence[0].after.status, "reported");
    assert.ok(reported.data.changes.evidence[0].after.reportedToNpcIds.includes(tempNpcId));
    assert.equal(reported.data.changes.worldEvents[0].progress.stage, "reported_partial");
    assert.equal(reported.data.changes.worldEvents[0].status, "active");
  });

  it("records institutional credit separately from NPC social debt and honors explicit actionFamily", async () => {
    const credited = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: Lucas reporta evidencia util ante una institucion.",
      actionFamily: "report",
      biologicalCostExemptReason: "Registro institucional de test sin coste fisico relevante.",
      factionReputationPatches: [
        {
          factionId: tempFactionId,
          reputationDelta: 1,
          institutionalCreditDelta: 2,
          meritDelta: 1,
          reason: "Reporte util registrado por una institucion de test.",
          notes: "Fixture temporal: credito institucional separado del vinculo con NPCs.",
        },
      ],
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de credito institucional separado de deuda social personal.",
          visibility: "hidden",
          tags: ["test_turn_hardening", "institutional_credit"],
        },
      ],
    });

    assert.equal(credited.status, 200, JSON.stringify(credited.data));
    assert.equal(credited.data.ok, true);
    assert.equal(credited.data.changes.factions[0].factionId, tempFactionId);
    assert.equal(credited.data.changes.factions[0].after.reputation, 1);
    assert.equal(credited.data.changes.factions[0].after.institutionalCredit, 2);
    assert.equal(credited.data.changes.factions[0].after.merit, 1);
    assert.equal(credited.data.changes.npcRelationships, undefined);
    assert.equal(credited.data.changes.narrativeHints.tracking.actionFamily, "report");
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
    assert.equal(attendanceChange.attendance.consequenceLevel, "none");
    assert.equal(attendanceChange.attendance.requiresFollowUp, false);

    const recordedAbsence = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: registrar ausencia laboral injustificada.",
      jobContractPatch: {
        op: "record_shift_absence",
        contractId: tempCreatedJobContractId,
        shiftId: "shift_test_market_0800_1000",
        day: 12,
        time: "08:00",
        excused: false,
        consequenceApplied: false,
        sourceCommitmentId: "commitment_test_market_shift",
        reason: "Fixture: Lucas falto sin avisar al turno temporal.",
      },
      biologicalCostExemptReason: "Registro administrativo sin actividad fisica.",
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de ausencia laboral.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });

    assert.equal(recordedAbsence.status, 200);
    assert.equal(recordedAbsence.data.ok, true);
    const absenceChange = recordedAbsence.data.changes.jobContracts[0];
    assert.equal(absenceChange.op, "record_shift_absence");
    assert.equal(absenceChange.attendance.status, "absent");
    assert.equal(absenceChange.attendance.consequenceLevel, "moderate");
    assert.equal(absenceChange.attendance.requiresFollowUp, true);
    assert.equal(absenceChange.attendance.sourceCommitmentId, "commitment_test_market_shift");
    assert.equal(absenceChange.consequencePlan.suggestedRelationshipPatch.npcId, "npc_irma");
    assert.equal(absenceChange.consequencePlan.suggestedRelationshipPatch.trustDelta, -2);

    const contract = await JobContract.findOne({ contractId: tempCreatedJobContractId }).lean();
    assert.equal(contract.flags.attendance.day_11.shift_test_market_0800_1000.status, "late");
    assert.equal(contract.flags.attendance.day_11.shift_test_market_0800_1000.minutesLate, 12);
    assert.equal(contract.flags.attendance.day_12.shift_test_market_0800_1000.status, "absent");
    assert.equal(contract.flags.attendance.day_12.shift_test_market_0800_1000.consequenceLevel, "moderate");
    assert.equal(contract.flags.attendance.day_12.shift_test_market_0800_1000.requiresFollowUp, true);
  });

  it("applies skill patches only through validated progression ranges", async () => {
    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          "lucasStatus.energy.current": 80,
          "lucasStatus.energy.label": "rendimiento normal",
        },
      }
    );
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
    assert.equal(valid.data.changes.skills[0].effectiveExpDelta, 15);
    assert.equal(valid.data.changes.skills[0].after.exp, initialPerception.exp + 15);

    const afterSkill = await GameState.findOne(
      { gameId: tempGameId },
      { skills: { $elemMatch: { skillId: "skill_percepcion" } } }
    ).lean();
    assert.equal(afterSkill.skills[0].exp, initialPerception.exp + 15);
  });

  it("infers skillPatch duration from timeAdvance without fromDay", async () => {
    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: 10,
          time: "12:00",
          block: "MediodÃ­a",
          "lucasStatus.energy.current": 80,
          "lucasStatus.energy.label": "rendimiento normal",
        },
      }
    );
    const before = await GameState.findOne(
      { gameId: tempGameId },
      { skills: { $elemMatch: { skillId: "skill_fuerza" } } }
    ).lean();
    const initial = before.skills[0];

    const applied = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: entreno con duracion inferida.",
      timeAdvance: {
        from: "12:00",
        to: "12:30",
      },
      biologicalCostExemptReason: "Fixture de test: duracion de skill sin coste biologico aplicado.",
      skillPatch: [
        {
          skillId: "skill_fuerza",
          expDelta: 6,
          category: "entreno_moderado",
          reason: "Entreno moderado de media hora con duracion inferida.",
        },
      ],
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de skillPatch con duracion inferida.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });

    assert.equal(applied.status, 200, JSON.stringify(applied.data));
    assert.equal(applied.data.changes.skills[0].durationMinutes, 30);
    assert.equal(applied.data.changes.skills[0].durationAdjustedBaseExpDelta, 3);
    assert.equal(applied.data.changes.skills[0].effectiveExpDelta, 15);

    const after = await GameState.findOne(
      { gameId: tempGameId },
      { skills: { $elemMatch: { skillId: "skill_fuerza" } } }
    ).lean();
    assert.equal(after.skills[0].exp, initial.exp + 15);
  });

  it("applies magicPractice only with real time, biological cost and backend skill validation", async () => {
    const fixtureState = await GameState.findOne({ gameId: tempGameId });
    fixtureState.currentDay = 10;
    fixtureState.time = "12:00";
    fixtureState.block = "Tarde";
    fixtureState.lucasStatus.mp.current = 200;
    fixtureState.lucasStatus.energy.current = 80;
    fixtureState.lucasStatus.energy.label = "rendimiento normal";
    fixtureState.biologicalClock = {
      lastProcessedTime: "12:00",
      currentHourBlock: "12:00-13:00",
      pendingAccumulation: [],
      pendingAccumulations: [],
    };
    for (const skill of fixtureState.skills) {
      if (["skill_mana", "skill_magia"].includes(skill.skillId)) {
        skill.phase = "Principiante";
        skill.level = 1;
        skill.exp = 0;
        skill.expToNext = 100;
      }
    }
    fixtureState.markModified("skills");
    await fixtureState.save();

    const beforeState = await getCanonicalState(tempGameId);
    const missingTime = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Intento invalido de test: practica magica instantanea.",
      activityCost: {
        category: "descanso_sentado",
        minutes: 30,
        reason: "Practica magica sentada de fixture.",
      },
      magicPractice: [
        {
          techniqueId: "technique_mana_breathing_basic",
          minutes: 30,
          reason: "Lucas practica respiracion de mana sin avanzar tiempo real.",
          modifiers: { newTechnique: true },
        },
      ],
    });
    assert.equal(missingTime.status, 400);
    assert.match(missingTime.data.error, /timeAdvance/);
    assertSameState(beforeState, await getCanonicalState(tempGameId));

    const before = await GameState.findOne(
      { gameId: tempGameId },
      { skills: { $elemMatch: { skillId: "skill_mana" } } }
    ).lean();
    const initialMana = before.skills[0];

    const applied = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: practica real de respiracion de mana.",
      timeAdvance: {
        from: "12:00",
        to: "12:30",
      },
      activityCost: {
        category: "descanso_sentado",
        minutes: 30,
        reason: "Practica magica sentada y contenida durante media hora.",
      },
      magicPractice: [
        {
          techniqueId: "technique_mana_breathing_basic",
          minutes: 30,
          reason: "Lucas practica respiracion de mana con control real y sin efecto externo.",
          modifiers: { newTechnique: true },
        },
      ],
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de magicPractice validado.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    });

    assert.equal(applied.status, 200, JSON.stringify(applied.data));
    assert.equal(applied.data.changes.magicPractice[0].techniqueId, "technique_mana_breathing_basic");
    assert.equal(applied.data.changes.magicPractice[0].mp.delta, 0);
    assert.equal(applied.data.changes.magicPractice[0].shouldLearnSpell, false);
    assert.equal(applied.data.changes.magicPractice[0].canProduceVisibleEffect, false);
    assert.ok(
      applied.data.changes.skills.some(
        (change) => change.source === "magicPractice" && change.skillId === "skill_mana" && change.effectiveExpDelta > 0
      )
    );

    const after = await GameState.findOne(
      { gameId: tempGameId },
      { skills: { $elemMatch: { skillId: "skill_mana" } }, lucasStatus: 1, biologicalClock: 1 }
    ).lean();
    assert.ok(after.skills[0].exp > initialMana.exp || after.skills[0].level > initialMana.level);
    assert.equal(after.lucasStatus.mp.current, 200);
    assert.ok((after.biologicalClock.pendingAccumulations || []).some((entry) => entry.category === "descanso_sentado"));
  });

  it("applies formal magic patches and blocks unsafe spell unlocks", async () => {
    await CharacterMagicKnowledge.deleteMany({ characterId: tempMagicCharacterId });
    const fixtureState = await GameState.findOne({ gameId: tempGameId });
    const originalCharacterId = fixtureState.characterId || "char_lucas";
    fixtureState.currentDay = 10;
    fixtureState.time = "12:00";
    fixtureState.block = "Tarde";
    fixtureState.characterId = tempMagicCharacterId;
    fixtureState.flags = {
      ...(fixtureState.flags || {}),
      knownSpells: [],
    };
    fixtureState.skills = (fixtureState.skills || []).filter((skill) => skill.skillId !== "skill_magia_ofensiva");
    for (const skill of fixtureState.skills) {
      if (["skill_mana", "skill_magia"].includes(skill.skillId)) {
        skill.phase = "Principiante";
        skill.level = 2;
        skill.exp = 0;
        skill.expToNext = 100;
      }
    }
    fixtureState.markModified("skills");
    fixtureState.markModified("flags");
    await fixtureState.save();

    const unlocked = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: desbloqueo formal de rama ofensiva.",
      magicPatches: [
        {
          op: "unlock_skill",
          skillId: "skill_magia_ofensiva",
          reason: "Lucas cumple base de Mana y Magia para estudiar ofensiva sin hechizo.",
        },
      ],
    });

    assert.equal(unlocked.status, 200, JSON.stringify(unlocked.data));
    assert.equal(unlocked.data.changes.magic[0].op, "unlock_skill");
    assert.equal(unlocked.data.changes.magic[0].after.skillId, "skill_magia_ofensiva");

    const blockedSpell = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Intento invalido de test: hechizo ofensivo sin requisitos.",
      magicPatches: [
        {
          op: "set_technique",
          characterId: tempMagicCharacterId,
          techniqueId: "technique_locked_offensive_spark",
          status: "known",
          source: "autodidactic_breakthrough",
          reason: "Lucas intenta declarar chispa ofensiva antes de cumplir requisitos completos.",
          breakthrough: true,
          safetyConfirmed: true,
        },
      ],
    });
    assert.equal(blockedSpell.status, 400);
    assert.match(blockedSpell.data.error, /requisitos magicos/);
    assert.equal(
      await CharacterMagicKnowledge.countDocuments({ characterId: tempMagicCharacterId }),
      0
    );

    const wrongCharacter = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Intento invalido de test: magia para otro personaje.",
      magicPatches: [
        {
          op: "set_technique",
          characterId: "char_test_wrong_magic_owner",
          techniqueId: "technique_locked_offensive_spark",
          status: "known",
          source: "autodidactic_breakthrough",
          reason: "Lucas intenta guardar un desbloqueo magico sobre otro personaje.",
          breakthrough: true,
          safetyConfirmed: true,
        },
      ],
    });
    assert.equal(wrongCharacter.status, 400);
    assert.match(wrongCharacter.data.error, /characterId/);

    const readyState = await GameState.findOne({ gameId: tempGameId });
    for (const skill of readyState.skills) {
      if (["skill_mana", "skill_magia_ofensiva"].includes(skill.skillId)) {
        skill.phase = "Principiante";
        skill.level = 3;
        skill.exp = 0;
        skill.expToNext = 100;
      }
    }
    readyState.markModified("skills");
    await readyState.save();

    const learnedSpell = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: breakthrough formal de chispa ofensiva.",
      magicPatches: [
        {
          op: "set_technique",
          characterId: tempMagicCharacterId,
          techniqueId: "technique_locked_offensive_spark",
          status: "known",
          source: "autodidactic_breakthrough",
          reason: "Lucas completa un prototipo seguro, repetible y contenido de chispa ofensiva controlada.",
          breakthrough: true,
          safetyConfirmed: true,
          tags: ["test_turn_hardening"],
        },
      ],
    });

    assert.equal(learnedSpell.status, 200, JSON.stringify(learnedSpell.data));
    assert.equal(learnedSpell.data.changes.magic[0].isRealSpell, true);
    assert.equal(learnedSpell.data.changes.magic[0].knownSpells.after.includes("technique_locked_offensive_spark"), true);

    const knowledge = await CharacterMagicKnowledge.findOne({
      characterId: tempMagicCharacterId,
      techniqueId: "technique_locked_offensive_spark",
    }).lean();
    assert.equal(knowledge.status, "known");

    const afterState = await GameState.findOne({ gameId: tempGameId }).lean();
    assert.equal(afterState.flags.knownSpells.includes("technique_locked_offensive_spark"), true);

    const practicedSpell = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: uso practico de chispa ofensiva ya conocida.",
      timeAdvance: {
        from: "12:00",
        to: "12:10",
      },
      activityCost: {
        category: "actividad_normal",
        minutes: 10,
        reason: "Prueba magica breve con salida externa controlada.",
      },
      magicPractice: [
        {
          characterId: tempMagicCharacterId,
          techniqueId: "technique_locked_offensive_spark",
          minutes: 10,
          reason: "Lucas practica una chispa ofensiva que ya fue desbloqueada formalmente.",
          modifiers: { realRisk: true },
        },
      ],
    });

    assert.equal(practicedSpell.status, 200, JSON.stringify(practicedSpell.data));
    assert.equal(practicedSpell.data.changes.magicPractice[0].techniqueId, "technique_locked_offensive_spark");
    assert.equal(practicedSpell.data.changes.magicPractice[0].mp.delta, -15);
    assert.equal(practicedSpell.data.changes.magicPractice[0].canProduceVisibleEffect, true);
    assert.equal(practicedSpell.data.changes.magicPractice[0].shouldLearnSpell, false);
    assert.ok(
      practicedSpell.data.changes.skills.some(
        (change) => change.source === "magicPractice" && change.skillId === "skill_magia_ofensiva"
      )
    );

    const afterPracticeState = await GameState.findOne({ gameId: tempGameId }).lean();
    assert.equal(afterPracticeState.lucasStatus.mp.current, 185);

    await GameState.updateOne({ gameId: tempGameId }, { $set: { characterId: originalCharacterId } });
  });

  it("applies C20 known non-offensive magic effects with formal targets", async () => {
    await CharacterMagicKnowledge.deleteMany({ characterId: tempMagicCharacterId });
    const injuryId = `injury_magic_c20_${Date.now()}`;
    const fixtureState = await GameState.findOne({ gameId: tempGameId });
    const originalCharacterId = fixtureState.characterId || "char_lucas";
    const lifeBefore = fixtureState.lucasStatus.life.current;

    function upsertSkill(skillId, name, level) {
      const existing = fixtureState.skills.find((skill) => skill.skillId === skillId);
      if (existing) {
        existing.name = name;
        existing.phase = "Principiante";
        existing.level = level;
        existing.exp = 0;
        existing.expToNext = 100;
        return;
      }

      fixtureState.skills.push({
        skillId,
        name,
        phase: "Principiante",
        level,
        exp: 0,
        expToNext: 100,
      });
    }

    fixtureState.currentDay = 10;
    fixtureState.time = "12:00";
    fixtureState.block = "Tarde";
    fixtureState.characterId = tempMagicCharacterId;
    fixtureState.lucasStatus.mp.current = 200;
    fixtureState.lucasStatus.energy.current = 80;
    fixtureState.lucasStatus.energy.label = "rendimiento normal";
    fixtureState.flags = {
      ...(fixtureState.flags || {}),
      knownSpells: [],
      magicPreparedEffects: [],
    };
    fixtureState.biologicalClock = {
      lastProcessedTime: "12:00",
      currentHourBlock: "12:00-13:00",
      pendingAccumulation: [],
      pendingAccumulations: [],
    };
    upsertSkill("skill_mana", "Mana", 5);
    upsertSkill("skill_magia", "Magia", 5);
    upsertSkill("skill_magia_curativa", "Magia curativa", 1);
    upsertSkill("skill_magia_defensiva", "Magia defensiva", 1);
    fixtureState.lucasStatus.injuries = [
      ...(fixtureState.lucasStatus.injuries || []).filter((entry) => entry.injuryId !== injuryId),
      {
        injuryId,
        location: "left_arm",
        severity: "leve",
        description: "Fixture C20 magic stabilization wound.",
        effects: ["sangrado 1", "dolor 3"],
        status: "active",
        treated: false,
        healingProgress: 0,
        recoveryHoursRemaining: 18,
        createdDay: 10,
        createdTime: "12:00",
      },
    ];
    fixtureState.markModified("skills");
    fixtureState.markModified("flags");
    fixtureState.markModified("lucasStatus.injuries");
    await fixtureState.save();

    await InjuryRecord.create({
      injuryId,
      gameId: tempGameId,
      encounterId: "",
      targetType: "character",
      targetId: "char_lucas",
      bodyPart: "left_arm",
      injuryType: "cut",
      severity: "minor",
      bleeding: 1,
      pain: 3,
      mobilityPenalty: 0,
      actionPenalty: -1,
      concentrationPenalty: -1,
      untreatedRisk: "low",
      requiresTreatment: true,
      treated: false,
      createdDay: 10,
      createdTime: "12:00",
      recoveryHoursRemaining: 18,
      notes: "Fixture C20 magic stabilization wound.",
    });

    try {
      const learnedSupportMagic = await post("/api/turn/apply", {
        gameId: tempGameId,
        actionSummary: "Test controlado: aprendizaje formal de magia no ofensiva conocida.",
        magicPatches: [
          {
            op: "set_technique",
            characterId: tempMagicCharacterId,
            techniqueId: "technique_locked_minor_stabilization",
            status: "known",
            source: "supervised_breakthrough",
            reason: "Lucas valida una estabilizacion menor repetible sobre una herida de prueba controlada.",
            breakthrough: true,
            safetyConfirmed: true,
            tags: ["test_turn_hardening"],
          },
          {
            op: "set_technique",
            characterId: tempMagicCharacterId,
            techniqueId: "technique_locked_minor_ward",
            status: "known",
            source: "supervised_breakthrough",
            reason: "Lucas valida un resguardo menor contenido sin asumir mitigacion de combate.",
            breakthrough: true,
            safetyConfirmed: true,
            tags: ["test_turn_hardening"],
          },
        ],
      });

      assert.equal(learnedSupportMagic.status, 200, JSON.stringify(learnedSupportMagic.data));
      assert.equal(learnedSupportMagic.data.changes.magic.length, 2);

      const healed = await post("/api/turn/apply", {
        gameId: tempGameId,
        actionSummary: "Test controlado: estabilizacion menor conocida sobre herida real.",
        timeAdvance: {
          from: "12:00",
          to: "12:10",
        },
        activityCost: {
          category: "actividad_normal",
          minutes: 10,
          reason: "Aplicacion magica breve y controlada sobre herida real.",
        },
        magicPractice: [
          {
            characterId: tempMagicCharacterId,
            techniqueId: "technique_locked_minor_stabilization",
            minutes: 10,
            reason: "Lucas aplica estabilizacion menor conocida sobre una herida real de prueba.",
            target: {
              targetType: "injury",
              injuryId,
              mode: "stabilize_injury",
            },
            modifiers: { realRisk: true },
          },
        ],
      });

      assert.equal(healed.status, 200, JSON.stringify(healed.data));
      const healingEffect = healed.data.changes.magicPractice[0].mechanicalEffect;
      assert.equal(healingEffect.applied, true);
      assert.equal(healingEffect.effectType, "healing");
      assert.equal(healingEffect.restoredLife, false);
      assert.equal(healingEffect.bleeding.after, 0);
      assert.equal(healingEffect.pain.after, 2);

      const afterHealingState = await GameState.findOne({ gameId: tempGameId }).lean();
      assert.equal(afterHealingState.lucasStatus.life.current, lifeBefore);
      assert.equal(afterHealingState.lucasStatus.mp.current, 160);
      const afterHealingInjury = await InjuryRecord.findOne({ gameId: tempGameId, injuryId }).lean();
      assert.equal(afterHealingInjury.bleeding, 0);
      assert.equal(afterHealingInjury.status, "healing");
      assert.equal(afterHealingInjury.treated, true);
      const legacy = afterHealingState.lucasStatus.injuries.find((entry) => entry.injuryId === injuryId);
      assert.ok(legacy.effects.includes("magia_estabilizada"));
      assert.ok(legacy.effects.includes("sangrado_estabilizado"));

      const prepared = await post("/api/turn/apply", {
        gameId: tempGameId,
        actionSummary: "Test controlado: preparar resguardo menor conocido.",
        timeAdvance: {
          from: "12:10",
          to: "12:20",
        },
        activityCost: {
          category: "actividad_normal",
          minutes: 10,
          reason: "Preparacion magica defensiva breve y contenida.",
        },
        magicPractice: [
          {
            characterId: tempMagicCharacterId,
            techniqueId: "technique_locked_minor_ward",
            minutes: 10,
            reason: "Lucas prepara un resguardo menor conocido sin resolver mitigacion de combate.",
            target: {
              targetType: "self",
              mode: "prepare_defense",
            },
            modifiers: { newContext: true },
          },
        ],
      });

      assert.equal(prepared.status, 200, JSON.stringify(prepared.data));
      const preparedEffect = prepared.data.changes.magicPractice[0].mechanicalEffect;
      assert.equal(preparedEffect.applied, true);
      assert.equal(preparedEffect.effectType, "defense");
      assert.equal(preparedEffect.appliesCombatMitigation, false);
      assert.equal(preparedEffect.requiresCombatResolver, true);

      const afterPreparedState = await GameState.findOne({ gameId: tempGameId }).lean();
      assert.equal(afterPreparedState.lucasStatus.life.current, lifeBefore);
      assert.equal(afterPreparedState.lucasStatus.mp.current, 130);
      assert.equal((afterPreparedState.flags.magicPreparedEffects || []).length, 1);
      assert.equal(afterPreparedState.flags.magicPreparedEffects[0].techniqueId, "technique_locked_minor_ward");
      assert.equal(afterPreparedState.flags.magicPreparedEffects[0].appliesCombatMitigation, false);
    } finally {
      await GameState.updateOne({ gameId: tempGameId }, { $set: { characterId: originalCharacterId } });
    }
  });

  it("replays applyTurn by clientTurnId without duplicating mutation", async () => {
    const clientTurnId = `test-idempotent-${Date.now()}`;
    const body = {
      gameId: tempGameId,
      clientTurnId,
      actionSummary: "Test controlado: reintento idempotente de applyTurn.",
      npcRelationshipPatches: [
        {
          npcId: tempIdempotentNpcId,
          familiarityDelta: 1,
          reason: "Accion social unica usada para validar idempotencia.",
          actionType: "test_idempotent_turn",
          tags: ["test_turn_hardening"],
        },
      ],
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de clientTurnId idempotente.",
          visibility: "hidden",
          tags: ["test_turn_hardening"],
        },
      ],
    };

    const first = await post("/api/turn/apply", body);
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(first.data.ok, true);
    assert.equal(first.data.responseProfile, "compact");
    assert.equal(first.data.idempotentReplay, false);
    assert.equal(first.data.clientTurnId, clientTurnId);
    assert.equal(first.data.eventLogsCreated, 1);
    assert.equal(first.data.changes.npcRelationships[0].after.familiarity, 1);
    assert.equal(first.data.gameState.skills, undefined);

    const afterFirstNpc = await Npc.findOne({ npcId: tempIdempotentNpcId }).lean();
    assert.equal(afterFirstNpc.relationshipWithLucas.familiarity, 1);
    assert.equal(await EventLog.countDocuments({ gameId: tempGameId, clientTurnId }), 1);
    assert.equal(await NpcSocialLedger.countDocuments({ npcId: tempIdempotentNpcId }), 1);
    const trace = await TurnTrace.findOne({ gameId: tempGameId, clientTurnId }).lean();
    assert.ok(trace);
    assert.equal(first.data.turnTraceId, trace.traceId);
    assert.equal(trace.primaryLogId, first.data.primaryLogId);
    assert.equal(trace.status, "applied");
    assert.equal(trace.requestSanitized.clientTurnId, clientTurnId);
    assert.ok(trace.displayBundle.renderLines.includes("## Estado actual"));
    assert.ok(trace.responseSummary.changeKeys.includes("npcRelationships"));

    const replay = await post("/api/turn/apply", body);
    assert.equal(replay.status, 200, JSON.stringify(replay.data));
    assert.equal(replay.data.ok, true);
    assert.equal(replay.data.idempotentReplay, true);
    assert.equal(replay.data.clientTurnId, clientTurnId);
    assert.equal(replay.data.eventLogsCreated, 0);
    assert.equal(replay.data.primaryLogId, first.data.primaryLogId);
    assert.equal(replay.data.turnTraceId, trace.traceId);
    assert.equal(replay.data.changes.npcRelationships[0].after.familiarity, 1);

    const afterReplayNpc = await Npc.findOne({ npcId: tempIdempotentNpcId }).lean();
    assert.equal(afterReplayNpc.relationshipWithLucas.familiarity, 1);
    assert.equal(await EventLog.countDocuments({ gameId: tempGameId, clientTurnId }), 1);
    assert.equal(await NpcSocialLedger.countDocuments({ npcId: tempIdempotentNpcId }), 1);
    assert.equal(await TurnTrace.countDocuments({ gameId: tempGameId, clientTurnId }), 1);
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
    assert.ok(relationship.data.changes.npcRelationships[0].sourceEventLogId);
    assert.equal(firstLedger.sourceEventLogId, relationship.data.changes.npcRelationships[0].sourceEventLogId);

    const relationshipLog = await EventLog.findOne({
      gameId: tempGameId,
      logId: firstLedger.sourceEventLogId,
    }).lean();
    assert.ok(relationshipLog);
    assert.equal(
      relationshipLog.mechanicalChanges.npcRelationships[0].sourceEventLogId,
      relationshipLog.logId
    );

    const relationshipSearch = await get(
      `/api/search/db?gameId=${encodeURIComponent(tempGameId)}&q=${encodeURIComponent(
        `${relationshipLog.logId} ${firstLedger.ledgerId}`
      )}`
    );
    assert.equal(relationshipSearch.status, 200);
    assert.ok(
      relationshipSearch.data.results.eventLogs.some((log) => log.logId === relationshipLog.logId)
    );
    assert.ok(
      relationshipSearch.data.results.npcSocialLedgers.some((ledger) => ledger.ledgerId === firstLedger.ledgerId)
    );

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

    await GameState.updateOne(
      { gameId: tempGameId },
      {
        $set: {
          currentDay: 10,
          time: "12:00",
          biologicalClock: {
            lastProcessedTime: "12:00",
            currentHourBlock: "12:00-13:00",
            pendingAccumulation: [],
            pendingAccumulations: [],
          },
        },
      }
    );

    const biology = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: acumulador biologico trazable.",
      timeAdvance: {
        from: "12:00",
        to: "12:10",
      },
      activityCost: {
        category: "descanso_sentado",
        minutes: 10,
        reason: "Prueba trazable de descanso sentado.",
      },
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de sourceEventLogId biologico.",
          visibility: "hidden",
          tags: ["test_turn_hardening", "traceability"],
        },
      ],
    });
    assert.equal(biology.status, 200);
    assert.equal(biology.data.ok, true);
    const bioLogId = biology.data.changes.biologicalClock.sourceEventLogId;
    const bioAccumulationId = biology.data.changes.biologicalClock.pendingCreated[0].accumulationId;
    assert.ok(bioLogId);
    assert.equal(biology.data.changes.biologicalClock.pendingCreated[0].sourceEventLogId, bioLogId);

    const stateWithBio = await GameState.findOne({ gameId: tempGameId }).lean();
    const savedAccumulation = stateWithBio.biologicalClock.pendingAccumulations.find(
      (entry) => entry.accumulationId === bioAccumulationId
    );
    assert.equal(savedAccumulation.sourceEventLogId, bioLogId);

    const biologyLog = await EventLog.findOne({ gameId: tempGameId, logId: bioLogId }).lean();
    assert.equal(biologyLog.mechanicalChanges.biologicalClock.pendingCreated[0].sourceEventLogId, bioLogId);

    const biologySearch = await get(
      `/api/search/db?gameId=${encodeURIComponent(tempGameId)}&q=${encodeURIComponent(
        `${bioLogId} ${bioAccumulationId}`
      )}`
    );
    assert.equal(biologySearch.status, 200);
    assert.ok(biologySearch.data.results.eventLogs.some((log) => log.logId === bioLogId));
    assert.ok(
      biologySearch.data.results.biologicalAccumulations.some(
        (entry) => entry.accumulationId === bioAccumulationId
      )
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
    await Promise.all([
      GameState.updateOne(
        { gameId: tempGameId },
        {
          $set: {
            currentDay: 10,
            "diegeticDate.day": 10,
            block: "Mediodía",
            time: "12:00",
            locationId: "loc_hoshimori_grulla_azul",
            moneyCopper: 100,
            activeMissionIds: [],
            "lucasStatus.satiety.current": 30,
            "lucasStatus.satiety.label": "hambre fuerte",
            "lucasStatus.energy.current": 59,
            "lucasStatus.energy.label": "cansancio leve/energia media",
            biologicalClock: {
              lastProcessedTime: "12:00",
              currentHourBlock: "12:00-13:00",
              pendingAccumulation: [],
              pendingAccumulations: [],
            },
          },
        }
      ),
      Mission.updateOne(
        { missionId: tempMissionId },
        {
          $set: {
            status: "available",
            proofStatus: "pending",
            acceptedByCharacterId: "",
            acceptedDay: null,
            completedDay: null,
            flags: { testSuite: true },
          },
        }
      ),
    ]);

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

    const multiSegmentPreview = await post("/api/travel/preview", {
      gameId: tempGameId,
      fromLocationId: "loc_hoshimori_forest_whispers_edge",
      toLocationId: "loc_hoshimori_guild",
      allowMultiSegment: true,
      maxSegments: 3,
      conditions: {
        ignoreCurrentWeather: true,
        startTime: "09:10",
      },
    });
    assert.equal(multiSegmentPreview.status, 200, JSON.stringify(multiSegmentPreview.data));
    assert.equal(multiSegmentPreview.data.preview.path.multiSegment, true);
    assert.equal(multiSegmentPreview.data.preview.path.segmentCount, 2);
    assert.equal(multiSegmentPreview.data.preview.path.segments[0].route.toLocationId, "loc_hoshimori_grulla_azul");
    assert.equal(multiSegmentPreview.data.preview.path.segments[1].route.toLocationId, "loc_hoshimori_guild");
    assert.equal(multiSegmentPreview.data.preview.timing.finalMinutes, 110);
    assert.equal(multiSegmentPreview.data.preview.timing.expectedArrivalTime, "11:00");

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
        evidenceSummary: "Evidencia simple de fixture.",
        investigationSummary: "Ruta y hallazgos de prueba controlada.",
        reportQuality: "solid",
        witnessNpcIds: ["npc_garrick"],
        relatedLocationIds: ["loc_hoshimori_guild"],
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
    assert.equal(reportedMission.data.changes.missions[0].after.flags.lastReport.reportQuality, "solid");
    assert.deepEqual(reportedMission.data.changes.missions[0].after.flags.lastReport.witnessNpcIds, ["npc_garrick"]);
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
