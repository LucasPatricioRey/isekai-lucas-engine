const { after, before, describe, it } = require("node:test");

const BiologicalAccumulationArchive = require("../models/BiologicalAccumulationArchive");
const Checkpoint = require("../models/Checkpoint");
const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");
const JobContract = require("../models/JobContract");
const NpcMemory = require("../models/NpcMemory");
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

let tempGameId = "";
let tempCharacterId = "";
let tempContractId = "";

async function createResolverFixture() {
  const suffix = Date.now();
  tempGameId = `test_turn_resolver_${suffix}`;
  tempCharacterId = `char_test_turn_resolver_${suffix}`;
  tempContractId = `job_contract_test_turn_resolver_${suffix}`;

  const base = await GameState.findOne({ gameId: "isekai_lucas_main" }).lean();
  assert.ok(base, "Base GameState is required for resolver tests.");

  const payload = {
    ...base,
    _id: undefined,
    gameId: tempGameId,
    characterId: tempCharacterId,
    currentDay: 19,
    time: "13:50",
    block: "Mediodía",
    locationId: "loc_hoshimori_forest_whispers_edge",
    biologicalClock: {
      lastProcessedTime: "13:50",
      currentHourBlock: "13:00-14:00",
      pendingAccumulation: [],
      pendingAccumulations: [],
    },
    activeMissionIds: [],
  };

  payload.lucasStatus.satiety.current = 73;
  payload.lucasStatus.satiety.label = "satisfecho";
  payload.lucasStatus.energy.current = 76;
  payload.lucasStatus.energy.label = "rendimiento normal";
  payload.lucasStatus.mp.current = 190;
  delete payload.createdAt;
  delete payload.updatedAt;

  await GameState.create(payload);
  await JobContract.create({
    contractId: tempContractId,
    characterId: tempCharacterId,
    jobId: "job_test_grulla_afternoon",
    title: "Test Turno tarde La Grulla Azul",
    employerNpcId: "npc_roberto_valen",
    locationId: "loc_hoshimori_grulla_azul",
    status: "active",
    startDay: 19,
    shifts: [
      {
        shiftId: "shift_test_grulla_afternoon_1400_2030",
        name: "Turno tarde La Grulla Azul",
        startTime: "14:00",
        endTime: "20:30",
        activityCategory: "trabajo_normal",
        expectedMinutes: 390,
        payCopper: 0,
        status: "active",
        lateGraceMinutes: 0,
      },
    ],
    source: "test_turn_resolver",
    tags: ["testSuite", tempGameId],
    flags: { testSuite: true },
  });
}

async function cleanupResolverFixture() {
  if (!tempGameId) return;

  await Promise.all([
    GameState.deleteMany({ gameId: tempGameId }),
    EventLog.deleteMany({ gameId: tempGameId }),
    TurnTrace.deleteMany({ gameId: tempGameId }),
    Checkpoint.deleteMany({ gameId: tempGameId }),
    BiologicalAccumulationArchive.deleteMany({ gameId: tempGameId }),
    JobContract.deleteMany({ contractId: tempContractId }),
    NpcMemory.deleteMany({ tags: tempGameId }),
  ]);

  tempGameId = "";
  tempCharacterId = "";
  tempContractId = "";
}

describe("turn resolver API", () => {
  before(startApi);
  after(async () => {
    await cleanupResolverFixture();
    await stopApi();
  });

  it("previews a structured composite turn without mutating canonical state", async () => {
    const beforeState = await getCanonicalState();
    assertCanonState(beforeState);
    const destination =
      beforeState.locationId === "loc_hoshimori_guild"
        ? "loc_hoshimori_grulla_azul"
        : "loc_hoshimori_guild";
    const clientTurnId = `test-resolve-preview-${Date.now()}`;

    const response = await post("/api/turn/resolve/preview", {
      gameId: "isekai_lucas_main",
      clientTurnId,
      includeResolvedPayload: true,
      intent: {
        summary: "Preview de resolver: Lucas descansa brevemente y viaja a otro punto de Hoshimori.",
      },
      sequence: [
        {
          type: "rest",
          minutes: 5,
          reason: "Lucas recupera aire antes de moverse.",
        },
        {
          type: "travel",
          toLocationId: destination,
          pace: "hurry",
          allowMultiSegment: true,
          reason: "Lucas se mueve con prisa controlada.",
        },
      ],
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.dryRun, true);
    assert.equal(response.data.clientTurnId, clientTurnId);
    assert.equal(response.data.resolverPlan.schemaVersion, "resolve_turn_v1");
    assert.equal(response.data.resolverPlan.generated.activitySegments.length, 2);
    assert.equal(response.data.resolverPlan.generated.hasJobContractPatch, false);
    assert.equal(response.data.resolvedApplyTurnPayload.dryRun, true);
    assert.ok(response.data.displayBundle.renderLines.includes("## Estado actual"));

    const afterState = await getCanonicalState();
    assertSameState(beforeState, afterState);
    assert.equal(await TurnTrace.countDocuments({ clientTurnId }), 0);
  });

  it("applies rest, urgent travel, job lateness and apology as one isolated mutation", async () => {
    await cleanupResolverFixture();
    await createResolverFixture();

    const clientTurnId = `test-resolve-apply-${Date.now()}`;
    const response = await post("/api/turn/resolve", {
      gameId: tempGameId,
      clientTurnId,
      intent: {
        summary:
          "Lucas descansa 10 minutos, vuelve corriendo a toda velocidad a la posada y se disculpa ante Roberto por llegar tarde.",
        destinationLocationId: "loc_hoshimori_grulla_azul",
        targetNpcId: "npc_roberto_valen",
      },
      tags: [tempGameId],
      sequence: [
        {
          type: "rest",
          minutes: 10,
          reason: "Lucas descansa diez minutos antes de volver.",
        },
        {
          type: "travel",
          toLocationId: "loc_hoshimori_grulla_azul",
          pace: "full_speed",
          allowMultiSegment: true,
          reason: "Lucas corre a toda velocidad para reducir la tardanza.",
        },
        {
          type: "job_attendance",
          contractId: tempContractId,
          shiftId: "shift_test_grulla_afternoon_1400_2030",
          targetNpcId: "npc_roberto_valen",
          consequenceLevel: "minor",
          consequenceApplied: true,
        },
        {
          type: "apology",
          npcId: "npc_roberto_valen",
          tags: [tempGameId],
          importance: "normal",
        },
      ],
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.notEqual(response.data.dryRun, true);
    assert.equal(response.data.clientTurnId, clientTurnId);
    assert.equal(response.data.resolverPlan.elapsedMinutes, 70);
    assert.equal(response.data.resolverPlan.generated.hasJobContractPatch, true);
    assert.equal(response.data.resolverPlan.generated.npcMemoryPatchCount, 1);
    assert.ok(response.data.changes.jobContracts?.length >= 1);
    assert.ok(response.data.changes.skills?.some((entry) => entry.skillId === "skill_resistencia"));
    assert.ok(response.data.displayBundle.renderLines.includes("## Estado actual"));

    const afterState = await GameState.findOne({ gameId: tempGameId }).lean();
    assert.equal(afterState.time, "15:00");
    assert.equal(afterState.locationId, "loc_hoshimori_grulla_azul");

    const trace = await TurnTrace.findOne({ clientTurnId }).lean();
    assert.ok(trace);
    assert.equal(trace.status, "applied");

    const contract = await JobContract.findOne({ contractId: tempContractId }).lean();
    const attendance =
      contract.flags.attendance.day_19.shift_test_grulla_afternoon_1400_2030;
    assert.equal(attendance.status, "late");
    assert.equal(attendance.minutesLate, 60);
  });
});
