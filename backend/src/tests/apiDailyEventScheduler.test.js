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
const { buildDailyEventPayload } = require("../services/dailyEventSchedulerService");

let tempGameId = "";

async function createIsolatedGameState() {
  tempGameId = `test_daily_event_${Date.now()}`;

  const base = await GameState.findOne({ gameId: "isekai_lucas_main" }).lean();
  assert.ok(base, "Base GameState is required for daily event scheduler tests.");

  const payload = {
    ...base,
    _id: undefined,
    gameId: tempGameId,
    currentDay: 12,
    diegeticDate: {
      ...(base.diegeticDate || {}),
      day: 12,
    },
    time: "05:50",
    block: "Madrugada",
    locationId: "loc_hoshimori_grulla_azul",
    activeEventIds: [],
    activeMissionIds: [],
    biologicalClock: {
      lastProcessedTime: "05:50",
      currentHourBlock: "05:00-06:00",
      pendingAccumulation: [],
      pendingAccumulations: [],
    },
  };

  delete payload.createdAt;
  delete payload.updatedAt;
  await GameState.create(payload);
}

async function cleanupIsolatedState() {
  if (tempGameId) {
    await GameState.deleteOne({ gameId: tempGameId });
    await WorldEvent.deleteMany({ gameId: tempGameId });
    await EventLog.deleteMany({ gameId: tempGameId });
  }
}

describe("daily event scheduler", () => {
  before(async () => {
    await startApi();
    await createIsolatedGameState();
  });

  after(async () => {
    await cleanupIsolatedState();
    await stopApi();
  });

  it("builds duration from the rolled start block", () => {
    const payload = buildDailyEventPayload({
      gameState: {
        gameId: tempGameId,
        currentDay: 12,
        time: "06:00",
        locationId: "loc_hoshimori_grulla_azul",
      },
      rolls: {
        blockRoll: 3,
        importanceRoll: 8,
        durationRoll: 2,
        importance: "important",
      },
    });

    assert.equal(payload.startDay, 12);
    assert.equal(payload.startTime, "14:00");
    assert.equal(payload.endDay, 14);
    assert.equal(payload.endTime, "18:00");
    assert.equal(payload.severity, "major");
    assert.ok(payload.tags.includes("requires_player_resolution"));
    assert.equal(payload.effects[0].value.block, "Tarde");
    assert.equal(payload.effects[0].value.durationDays, 2);
  });

  it("generates one daily event when morning begins and exposes it in compact context", async () => {
    const applied = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: entra la manana y se genera evento diario.",
      timeAdvance: {
        from: "05:50",
        to: "06:00",
      },
      activityCost: {
        category: "descanso_general",
        minutes: 10,
        reason: "Avance controlado hasta la manana.",
      },
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de scheduler diario.",
          visibility: "hidden",
          tags: ["test_daily_event_scheduler"],
        },
      ],
    });

    assert.equal(applied.status, 200);
    assert.equal(applied.data.ok, true);
    assert.equal(applied.data.changes.time.after, "06:00");
    assert.ok(applied.data.changes.dailyEvents.generated);

    const events = await WorldEvent.find({
      gameId: tempGameId,
      tags: { $all: ["daily_event", "daily_event_day_12"] },
    }).lean();
    assert.equal(events.length, 1);

    const event = events[0];
    assert.match(event.eventId, /^event_test_daily_event_/);
    assert.ok(["scheduled", "active"].includes(event.status));
    assert.ok(["minor", "major"].includes(event.severity));
    assert.ok(event.effects.some((effect) => effect.type === "daily_event_rolls"));
    assert.ok(event.effects.some((effect) => effect.type === "consequence_if_ignored"));

    const compact = await get(`/api/context/compact?gameId=${encodeURIComponent(tempGameId)}`);
    assert.equal(compact.status, 200);
    assert.equal(compact.data.ok, true);
    assert.equal(compact.data.context.dailyEvents.length, 1);
    assert.equal(
      compact.data.context.alerts.some((alert) => alert.type === "daily_event_missing"),
      false
    );
  });

  it("expires unresolved events and marks pending consequences", async () => {
    await WorldEvent.create({
      eventId: `event_${tempGameId}_expired_fixture`,
      gameId: tempGameId,
      title: "Fixture de evento vencido",
      type: "test_event",
      scope: "local",
      status: "active",
      startDay: 11,
      startTime: "06:00",
      endDay: 12,
      endTime: "06:00",
      affectedLocationIds: ["loc_hoshimori_grulla_azul"],
      affectedNpcIds: [],
      affectedFactionIds: [],
      effects: [
        {
          type: "consequence_if_ignored",
          target: "minor_event",
          value: { level: "minor", summary: "Consecuencia de prueba." },
          reason: "Fixture de test.",
        },
      ],
      visibility: "hidden",
      cause: "Fixture de test.",
      severity: "minor",
      createdBy: "world_tick",
      tags: ["daily_event", "daily_event_day_11", "test_daily_event_scheduler"],
    });

    const applied = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: reconciliar eventos vencidos.",
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de expiracion de evento diario.",
          visibility: "hidden",
          tags: ["test_daily_event_scheduler"],
        },
      ],
    });

    assert.equal(applied.status, 200);
    assert.equal(applied.data.ok, true);
    assert.equal(applied.data.changes.dailyEvents.expired.length, 1);

    const expired = await WorldEvent.findOne({ eventId: `event_${tempGameId}_expired_fixture` }).lean();
    assert.equal(expired.status, "expired");
    assert.ok(expired.tags.includes("expired_unresolved"));
    assert.ok(expired.tags.includes("consequence_pending"));
    assert.ok(expired.tags.includes("minor_consequence_pending"));
  });
});
