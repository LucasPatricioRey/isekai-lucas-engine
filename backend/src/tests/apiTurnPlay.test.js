const { after, before, describe, it } = require("node:test");

const BiologicalAccumulationArchive = require("../models/BiologicalAccumulationArchive");
const Checkpoint = require("../models/Checkpoint");
const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");
const TurnTrace = require("../models/TurnTrace");
const {
  assert,
  getCanonicalState,
  post,
  startApi,
  stopApi,
} = require("./apiTestClient");

let tempGameId = "";

async function cleanupFixture() {
  if (!tempGameId) return;

  await Promise.all([
    GameState.deleteMany({ gameId: tempGameId }),
    EventLog.deleteMany({ gameId: tempGameId }),
    TurnTrace.deleteMany({ gameId: tempGameId }),
    Checkpoint.deleteMany({ gameId: tempGameId }),
    BiologicalAccumulationArchive.deleteMany({ gameId: tempGameId }),
  ]);

  tempGameId = "";
}

async function createFixture({ time = "06:30", block = "Mañana" } = {}) {
  await cleanupFixture();
  const suffix = Date.now();
  tempGameId = `test_turn_play_${suffix}`;

  const base = await GameState.findOne({ gameId: "isekai_lucas_main" }).lean();
  assert.ok(base, "Base GameState is required for turn play tests.");

  const payload = {
    ...base,
    _id: undefined,
    gameId: tempGameId,
    currentDay: 19,
    time,
    block,
    activeEventIds: [],
    activeMissionIds: [],
    biologicalClock: {
      lastProcessedTime: time,
      currentHourBlock: `${time.slice(0, 2)}:00-${String(Number(time.slice(0, 2)) + 1).padStart(2, "0")}:00`,
      pendingAccumulation: [],
      pendingAccumulations: [],
    },
    flags: {},
  };
  delete payload.createdAt;
  delete payload.updatedAt;

  await GameState.create(payload);
}

describe("turn play API", () => {
  before(startApi);
  after(async () => {
    await cleanupFixture();
    await stopApi();
  });

  it("serves a single read-only narration packet without exposing internal action packets", async () => {
    const beforeState = await getCanonicalState();
    const response = await post("/api/turn/play", {
      text: "continuar historia",
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.schemaVersion, "turn_play_v1");
    assert.equal(response.data.mode, "read_only");
    assert.equal(response.data.readOnly, true);
    assert.equal(response.data.actionRequired, false);
    assert.equal(response.data.decision.selectedOperation, "narrateOnly");
    assert.equal(response.data.narrativePacket.schemaVersion, "turn_play_narrative_packet_v1");
    assert.ok(response.data.displayBundle.renderLines.includes("## Estado actual"));
    assert.equal(response.data.actionPacket, undefined);
    assert.equal(response.data.resolverPacket, undefined);
    assert.equal(response.data.actionPlanPacket, undefined);

    const afterState = await getCanonicalState();
    assert.deepEqual(afterState, beforeState);
  });

  it("applies a common timed turn through the facade and returns a compact narrative packet", async () => {
    await createFixture({ time: "06:30", block: "Mañana" });

    const response = await post("/api/turn/play", {
      gameId: tempGameId,
      text: "Lucas espera hasta las 08:00.",
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.mode, "applied");
    assert.equal(response.data.readOnly, false);
    assert.equal(response.data.decision.selectedOperation, "resolveTurn");
    assert.equal(response.data.execution.operationCount, 1);
    assert.deepEqual(
      response.data.execution.operationsExecuted.map((operation) => operation.selectedOperation),
      ["resolveTurn"]
    );
    assert.ok(response.data.displayBundle.renderLines.includes("## Estado actual"));
    assert.ok(Buffer.byteLength(JSON.stringify(response.data), "utf8") < 25000);

    const afterState = await GameState.findOne({ gameId: tempGameId }).lean();
    assert.equal(afterState.time, "08:00");
  });

  it("returns needs_clarification for unsupported mutating turns instead of exposing manual tools", async () => {
    await createFixture({ time: "12:00", block: "Mediodía" });
    const beforeState = await GameState.findOne({ gameId: tempGameId }).lean();

    const response = await post("/api/turn/play", {
      gameId: tempGameId,
      text: "Lucas intenta lanzar una descarga electrica durante diez minutos.",
    });

    assert.equal(response.status, 200, JSON.stringify(response.data));
    assert.equal(response.data.ok, true);
    assert.equal(response.data.mode, "needs_clarification");
    assert.equal(response.data.readOnly, true);
    assert.equal(response.data.actionRequired, false);
    assert.equal(response.data.decision.capabilityId, "magic_practice");
    assert.match(response.data.decision.clarificationPrompt, /concrete/);
    assert.equal(response.data.actionPacket, undefined);
    assert.equal(response.data.resolverPacket, undefined);
    assert.equal(response.data.actionPlanPacket, undefined);

    const afterState = await GameState.findOne({ gameId: tempGameId }).lean();
    assert.equal(afterState.time, beforeState.time);
  });
});
