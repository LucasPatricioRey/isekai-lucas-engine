const { after, before, describe, it } = require("node:test");

const EventLog = require("../models/EventLog");
const Faction = require("../models/Faction");
const GameState = require("../models/GameState");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const NpcSocialLedger = require("../models/NpcSocialLedger");
const WorldEvent = require("../models/WorldEvent");
const {
  assert,
  get,
  post,
  startApi,
  stopApi,
} = require("./apiTestClient");
const {
  buildDailyEventPayload,
  EVENT_LAYERS,
  IMPORTANT_TEMPLATES,
  MINOR_TEMPLATES,
} = require("../services/dailyEventSchedulerService");

let tempGameId = "";
let tempSocialNpcId = "";

async function createIsolatedGameState() {
  tempGameId = `test_daily_event_${Date.now()}`;
  tempSocialNpcId = `npc_test_daily_event_social_${Date.now()}`;

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

  await Npc.create({
    npcId: tempSocialNpcId,
    name: "NPC Test Evento Diario",
    role: "fixture social de evento diario",
    relationshipWithLucas: {
      trust: 20,
      familiarity: 0,
      respect: 10,
      suspicion: 0,
      fear: 0,
      jealousy: 0,
      socialDebt: 0,
      notes: "Fixture temporal para consecuencias sociales de evento diario.",
    },
    flags: { testSuite: true },
  });
}

async function cleanupIsolatedState() {
  if (tempGameId) {
    await GameState.deleteOne({ gameId: tempGameId });
    await WorldEvent.deleteMany({ gameId: tempGameId });
    await EventLog.deleteMany({ gameId: tempGameId });
    if (tempSocialNpcId) await Npc.deleteOne({ npcId: tempSocialNpcId });
    if (tempSocialNpcId) await NpcSocialLedger.deleteMany({ npcId: tempSocialNpcId });
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

  it("has broad non-duplicated template pools", () => {
    const minorIds = MINOR_TEMPLATES.map((template) => template.id);
    const importantIds = IMPORTANT_TEMPLATES.map((template) => template.id);
    const allIds = [...minorIds, ...importantIds];

    assert.equal(MINOR_TEMPLATES.length, 30);
    assert.equal(IMPORTANT_TEMPLATES.length, 20);
    assert.equal(new Set(minorIds).size, minorIds.length);
    assert.equal(new Set(importantIds).size, importantIds.length);
    assert.equal(new Set(allIds).size, allIds.length);
  });

  it("daily event templates reference existing canon entities", async () => {
    const templates = [...MINOR_TEMPLATES, ...IMPORTANT_TEMPLATES];
    const npcIds = Array.from(new Set(templates.flatMap((template) => template.affectedNpcIds || [])));
    const locationIds = Array.from(new Set(templates.flatMap((template) => template.affectedLocationIds || [])));
    const factionIds = Array.from(new Set(templates.flatMap((template) => template.affectedFactionIds || [])));

    const [npcs, locations, factions] = await Promise.all([
      Npc.find({ npcId: { $in: npcIds } }).select("npcId").lean(),
      Location.find({ locationId: { $in: locationIds } }).select("locationId").lean(),
      Faction.find({ factionId: { $in: factionIds } }).select("factionId").lean(),
    ]);

    const existingNpcIds = new Set(npcs.map((npc) => npc.npcId));
    const existingLocationIds = new Set(locations.map((location) => location.locationId));
    const existingFactionIds = new Set(factions.map((faction) => faction.factionId));

    assert.deepEqual(npcIds.filter((npcId) => !existingNpcIds.has(npcId)), []);
    assert.deepEqual(locationIds.filter((locationId) => !existingLocationIds.has(locationId)), []);
    assert.deepEqual(factionIds.filter((factionId) => !existingFactionIds.has(factionId)), []);
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
    assert.ok(applied.data.changes.dailyEvents.generated.notice);
    assert.match(applied.data.changes.dailyEvents.generated.notice.text, /Evento diario:/);

    const events = await WorldEvent.find({
      gameId: tempGameId,
      tags: { $all: ["daily_event", "daily_event_day_12"] },
    }).lean();
    assert.equal(events.length, 1);

    const event = events[0];
    assert.match(event.eventId, /^event_test_daily_event_/);
    assert.ok(["scheduled", "active"].includes(event.status));
    assert.equal(event.eventLayer, EVENT_LAYERS.MAIN);
    assert.equal(event.countsAsMainEvent, true);
    assert.equal(event.blocksMainEventGeneration, true);
    assert.ok(["minor", "major"].includes(event.severity));
    assert.ok(event.effects.some((effect) => effect.type === "daily_event_rolls"));
    assert.ok(event.effects.some((effect) => effect.type === "consequence_if_ignored"));
    assert.ok(event.effects.some((effect) => effect.type === "social_consequence_rules"));

    const compact = await get(`/api/context/compact?gameId=${encodeURIComponent(tempGameId)}`);
    assert.equal(compact.status, 200);
    assert.equal(compact.data.ok, true);
    assert.equal(compact.data.context.dailyEvents.length, 1);
    assert.equal(compact.data.context.mainEvent.eventId, event.eventId);
    assert.equal(compact.data.context.eventForStatusLine.eventId, event.eventId);
    assert.equal(compact.data.context.currentDailyEvent.eventId, event.eventId);
    assert.equal(compact.data.context.currentDailyEvent.dailyEventNotice.title, event.title);
    assert.ok(compact.data.context.currentDailyEvent.dailyEventNotice.block);
    assert.ok(compact.data.context.currentDailyEvent.dailyEventNotice.text.includes(event.title));
    const exposedEvents = [
      ...(compact.data.context.activeEvents || []),
      ...(compact.data.context.scheduledEvents || []),
    ];
    const exposedEvent = exposedEvents.find((entry) => entry.eventId === event.eventId);
    assert.ok(exposedEvent);
    assert.ok(exposedEvent.dailyEventNotice.text.includes(exposedEvent.title));
    assert.equal(
      compact.data.context.alerts.some((alert) => alert.type === "daily_event_missing"),
      false
    );

    const tickPreview = await post("/api/world/tick/preview", {
      gameId: tempGameId,
      fromDay: 12,
      fromTime: "06:00",
      toDay: 12,
      toTime: "15:00",
      dryRun: true,
    });
    assert.equal(tickPreview.status, 200);
    assert.equal(tickPreview.data.ok, true);
    assert.equal(tickPreview.data.preview.generatedContent.willCreateDailyEvent, false);
    assert.equal(tickPreview.data.preview.generatedContent.existingDailyEvent.eventId, event.eventId);
  });

  it("does not generate a second main event while an earlier main event is still open", async () => {
    await WorldEvent.updateMany(
      { gameId: tempGameId, tags: "daily_event" },
      { $set: { status: "resolved" }, $addToSet: { tags: "test_resolved_for_open_main_blocker" } }
    );

    const blockingEventId = `event_${tempGameId}_open_main_blocker`;
    await WorldEvent.create({
      eventId: blockingEventId,
      gameId: tempGameId,
      title: "Fixture de evento principal abierto",
      type: "test_event",
      scope: "local",
      status: "active",
      eventLayer: EVENT_LAYERS.MAIN,
      countsAsMainEvent: true,
      blocksMainEventGeneration: true,
      startDay: 12,
      startTime: "14:00",
      endDay: 14,
      endTime: "18:00",
      affectedLocationIds: ["loc_hoshimori_grulla_azul"],
      affectedNpcIds: [tempSocialNpcId],
      affectedFactionIds: [],
      effects: [],
      visibility: "hidden",
      cause: "Fixture: evento principal abierto bloquea otro principal.",
      severity: "minor",
      createdBy: "world_tick",
      tags: ["daily_event", "main_event", "daily_event_day_12", "test_daily_event_scheduler"],
    });

    await GameState.updateOne(
      { gameId: tempGameId },
      { $set: { currentDay: 13, time: "06:00", block: "Ma\u00f1ana", activeEventIds: [blockingEventId] } }
    );

    const applied = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: no generar segundo evento principal.",
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de bloqueo por evento principal abierto.",
          visibility: "hidden",
          tags: ["test_daily_event_scheduler"],
        },
      ],
    });

    assert.equal(applied.status, 200);
    assert.equal(applied.data.ok, true);

    const day13Events = await WorldEvent.find({
      gameId: tempGameId,
      $and: [
        { tags: "daily_event" },
        { tags: "daily_event_day_13" },
        {
          $or: [
            { countsAsMainEvent: true },
            { eventLayer: EVENT_LAYERS.MAIN },
          ],
        },
      ],
    }).lean();
    assert.equal(day13Events.length, 0);

    const compact = await get(`/api/context/compact?gameId=${encodeURIComponent(tempGameId)}`);
    assert.equal(compact.status, 200);
    assert.equal(compact.data.ok, true);
    assert.equal(compact.data.context.mainEvent.eventId, blockingEventId);
    assert.equal(compact.data.context.activeEvents.length, 1);
    assert.equal(compact.data.context.activeEvents[0].eventId, blockingEventId);
    assert.equal(
      compact.data.context.alerts.some((alert) => alert.type === "daily_event_missing"),
      false
    );

    await WorldEvent.updateMany(
      { gameId: tempGameId, tags: "daily_event" },
      { $set: { status: "resolved" }, $addToSet: { tags: "test_resolved_for_followup" } }
    );
    await GameState.updateOne(
      { gameId: tempGameId },
      { $set: { currentDay: 12, time: "06:00", block: "Ma\u00f1ana", activeEventIds: [] } }
    );
  });

  it("avoids recently used daily event templates when generating a new day", async () => {
    const gameState = {
      gameId: tempGameId,
      currentDay: 20,
      time: "06:00",
      locationId: "loc_hoshimori_grulla_azul",
    };
    const rolls = {
      blockRoll: 1,
      importanceRoll: 2,
      durationRoll: 1,
      importance: "minor",
    };
    const baseline = buildDailyEventPayload({ gameState, rolls });

    await WorldEvent.create({
      eventId: `event_${tempGameId}_recent_${baseline.templateId}`,
      gameId: tempGameId,
      templateId: baseline.templateId,
      rolls,
      title: "Fixture de template reciente",
      type: "test_event",
      scope: "local",
      status: "resolved",
      eventLayer: EVENT_LAYERS.MAIN,
      countsAsMainEvent: true,
      blocksMainEventGeneration: true,
      startDay: 19,
      startTime: "06:00",
      endDay: 20,
      endTime: "06:00",
      affectedLocationIds: ["loc_hoshimori_grulla_azul"],
      affectedNpcIds: [tempSocialNpcId],
      affectedFactionIds: [],
      effects: [],
      visibility: "hidden",
      cause: "Fixture de cooldown.",
      severity: "minor",
      createdBy: "world_tick",
      tags: ["daily_event", "daily_event_day_19", `daily_event_template_${baseline.templateId}`, "test_daily_event_scheduler"],
    });

    await GameState.updateOne(
      { gameId: tempGameId },
      { $set: { currentDay: 20, time: "06:00", block: "Ma\u00f1ana", activeEventIds: [] } }
    );

    const applied = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: generar evento con cooldown de template.",
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de cooldown de templates diarios.",
          visibility: "hidden",
          tags: ["test_daily_event_scheduler"],
        },
      ],
    });

    assert.equal(applied.status, 200);
    assert.equal(applied.data.ok, true);
    assert.ok(applied.data.changes.dailyEvents.generated);
    assert.ok(applied.data.changes.dailyEvents.generated.excludedTemplateIds.includes(baseline.templateId));
    assert.notEqual(applied.data.changes.dailyEvents.generated.templateId, baseline.templateId);

    const generated = await WorldEvent.findOne({
      gameId: tempGameId,
      tags: { $all: ["daily_event", "daily_event_day_20"] },
    }).lean();
    assert.ok(generated);
    assert.equal(generated.templateId, applied.data.changes.dailyEvents.generated.templateId);
    assert.notEqual(generated.templateId, baseline.templateId);

    await WorldEvent.updateMany(
      { gameId: tempGameId, tags: "daily_event" },
      { $set: { status: "resolved" }, $addToSet: { tags: "test_resolved_for_followup" } }
    );
    await GameState.updateOne(
      { gameId: tempGameId },
      { $set: { currentDay: 12, time: "06:00", block: "Ma\u00f1ana", activeEventIds: [] } }
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
      eventLayer: EVENT_LAYERS.MAIN,
      countsAsMainEvent: true,
      blocksMainEventGeneration: true,
      startDay: 11,
      startTime: "06:00",
      endDay: 12,
      endTime: "06:00",
      affectedLocationIds: ["loc_hoshimori_grulla_azul"],
      affectedNpcIds: [tempSocialNpcId],
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
    assert.equal(applied.data.changes.worldEventSocialConsequences[0].outcome, "ignored");
    assert.equal(applied.data.changes.npcRelationships[0].npcId, tempSocialNpcId);
    assert.equal(applied.data.changes.npcRelationships[0].appliedDeltas.trust, -1);
    assert.equal(applied.data.changes.npcRelationships[0].appliedDeltas.respect, -1);

    const expired = await WorldEvent.findOne({ eventId: `event_${tempGameId}_expired_fixture` }).lean();
    assert.equal(expired.status, "expired");
    assert.ok(expired.tags.includes("expired_unresolved"));
    assert.ok(expired.tags.includes("consequence_pending"));
    assert.ok(expired.tags.includes("minor_consequence_pending"));
    assert.ok(expired.tags.includes("social_consequence_ignored"));

    const ignoredLedger = await NpcSocialLedger.findOne({
      gameId: tempGameId,
      npcId: tempSocialNpcId,
      sourceEventId: `event_${tempGameId}_expired_fixture`,
    }).lean();
    assert.equal(ignoredLedger.actionType, "daily_event_ignored");
  });

  it("resolves an active world event patch and removes it from active event ids", async () => {
    const eventId = `event_${tempGameId}_resolved_fixture`;

    await WorldEvent.create({
      eventId,
      gameId: tempGameId,
      title: "Fixture de evento resuelto",
      type: "test_event",
      scope: "local",
      status: "active",
      eventLayer: EVENT_LAYERS.MAIN,
      countsAsMainEvent: true,
      blocksMainEventGeneration: true,
      startDay: 12,
      startTime: "06:00",
      endDay: 13,
      endTime: "06:00",
      affectedLocationIds: ["loc_hoshimori_grulla_azul"],
      affectedNpcIds: [tempSocialNpcId],
      affectedFactionIds: [],
      effects: [
        {
          type: "daily_event_rolls",
          target: "scheduler",
          value: { blockRoll: 1, importanceRoll: 3, durationRoll: 1 },
          reason: "Fixture previo que debe conservarse al resolver el evento.",
        },
      ],
      visibility: "hidden",
      cause: "Fixture de test.",
      severity: "minor",
      createdBy: "world_tick",
      tags: ["daily_event", "daily_event_day_12", "test_daily_event_scheduler"],
    });

    await GameState.updateOne(
      { gameId: tempGameId },
      { $addToSet: { activeEventIds: eventId }, $set: { currentDay: 12, time: "07:00", block: "Mañana" } }
    );

    const applied = await post("/api/turn/apply", {
      gameId: tempGameId,
      actionSummary: "Test controlado: resolver evento diario.",
      worldEventPatches: [
        {
          eventId,
          status: "resolved",
          tags: ["event_resolved", "test_resolution"],
        },
      ],
      eventLogs: [
        {
          source: "system_correction",
          summary: "Test controlado de resolucion de evento diario.",
          visibility: "hidden",
          tags: ["test_daily_event_scheduler", "event_resolved"],
        },
      ],
    });

    assert.equal(applied.status, 200);
    assert.equal(applied.data.ok, true);
    assert.equal(applied.data.changes.worldEvents[0].status, "resolved");
    assert.equal(applied.data.changes.worldEventSocialConsequences[0].outcome, "resolved");
    assert.equal(applied.data.changes.npcRelationships[0].npcId, tempSocialNpcId);
    assert.equal(applied.data.changes.npcRelationships[0].appliedDeltas.trust, 1);
    assert.equal(applied.data.changes.npcRelationships[0].appliedDeltas.respect, 1);
    assert.equal(applied.data.changes.npcRelationships[0].appliedDeltas.familiarity, 1);

    const resolved = await WorldEvent.findOne({ eventId }).lean();
    assert.equal(resolved.status, "resolved");
    assert.ok(resolved.tags.includes("event_resolved"));
    assert.ok(resolved.tags.includes("test_resolution"));
    assert.ok(resolved.tags.includes("social_consequence_resolved"));
    assert.ok(resolved.effects.some((effect) => effect.type === "daily_event_rolls"));
    assert.ok(resolved.effects.some((effect) => effect.type === "social_consequence_applied"));

    const gameState = await GameState.findOne({ gameId: tempGameId }).lean();
    assert.equal((gameState.activeEventIds || []).includes(eventId), false);
  });

  it("does not warn daily event missing when the current day event is already resolved", async () => {
    const eventId = `event_${tempGameId}_resolved_day_14_fixture`;

    await WorldEvent.create({
      eventId,
      gameId: tempGameId,
      title: "Fixture de evento diario ya resuelto",
      type: "test_event",
      scope: "local",
      status: "resolved",
      eventLayer: EVENT_LAYERS.MAIN,
      countsAsMainEvent: true,
      blocksMainEventGeneration: true,
      startDay: 14,
      startTime: "06:00",
      endDay: 15,
      endTime: "06:00",
      affectedLocationIds: ["loc_hoshimori_grulla_azul"],
      affectedNpcIds: ["npc_fern"],
      affectedFactionIds: [],
      effects: [],
      visibility: "hidden",
      cause: "Fixture de test.",
      severity: "minor",
      createdBy: "world_tick",
      tags: ["daily_event", "daily_event_day_14", "event_resolved", "test_daily_event_scheduler"],
    });

    await GameState.updateOne(
      { gameId: tempGameId },
      { $set: { currentDay: 14, time: "20:00", block: "Noche", activeEventIds: [] } }
    );

    const compact = await get(`/api/context/compact?gameId=${encodeURIComponent(tempGameId)}`);

    assert.equal(compact.status, 200);
    assert.equal(compact.data.ok, true);
    assert.equal(
      compact.data.context.alerts.some((alert) => alert.type === "daily_event_missing"),
      false
    );
  });

  it("lists and reads world events through read-only endpoints", async () => {
    const list = await get(`/api/world/events?gameId=${encodeURIComponent(tempGameId)}&tag=daily_event&limit=10`);

    assert.equal(list.status, 200);
    assert.equal(list.data.ok, true);
    assert.ok(Array.isArray(list.data.events));
    assert.ok(list.data.events.length > 0);
    assert.ok(list.data.events[0].dailyEventNotice);

    const eventId = list.data.events[0].eventId;
    const detail = await get(`/api/world/events/${encodeURIComponent(eventId)}?gameId=${encodeURIComponent(tempGameId)}`);

    assert.equal(detail.status, 200);
    assert.equal(detail.data.ok, true);
    assert.equal(detail.data.event.eventId, eventId);
    assert.ok(detail.data.event.dailyEventNotice.text.includes(detail.data.event.title));
    assert.equal(detail.data.raw.eventId, eventId);
  });
});
