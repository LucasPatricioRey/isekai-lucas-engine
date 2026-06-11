require("dotenv").config({ quiet: true });

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");
const WorldEvent = require("../models/WorldEvent");
const { createAutomaticCheckpoint } = require("../services/checkpointService");
const {
  DAILY_EVENT_TAG,
  EVENT_LAYERS,
  MAIN_EVENT_OPEN_STATUSES,
  eventGameFilter,
  isMainEvent,
  toAbsoluteMinutes,
} = require("../services/dailyEventSchedulerService");

const GAME_ID = process.env.REPAIR_GAME_ID || process.env.GAME_ID || "isekai_lucas_main";
const WRITE = process.argv.includes("--write") || process.env.WRITE_EVENT_LAYERS === "true";
const SOURCE = "event_layer_repair";

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function severityWeight(event) {
  if (event.severity === "critical") return 4;
  if (event.severity === "major") return 3;
  if (event.severity === "moderate") return 2;
  return 1;
}

function sortOpenMainCandidates(events) {
  return [...events].sort((a, b) => {
    const startDiff =
      toAbsoluteMinutes(a.startDay, a.startTime) - toAbsoluteMinutes(b.startDay, b.startTime);
    if (startDiff !== 0) return startDiff;
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return severityWeight(b) - severityWeight(a);
  });
}

function isLegacyDailyEvent(event) {
  return (
    (event.tags || []).includes(DAILY_EVENT_TAG) &&
    !hasOwn(event, "eventLayer") &&
    !hasOwn(event, "countsAsMainEvent") &&
    !hasOwn(event, "blocksMainEventGeneration")
  );
}

function demotedLayerFor(event) {
  return ["major", "critical"].includes(event.severity)
    ? EVENT_LAYERS.BACKGROUND
    : EVENT_LAYERS.MINOR_RUMOR;
}

function dailyEventTags(tags = []) {
  return tags.filter((tag) => tag === DAILY_EVENT_TAG || String(tag).startsWith("daily_event_"));
}

function formerDailyEventTags(event) {
  return unique([
    "former_daily_event",
    event.templateId ? `former_daily_event_template_${event.templateId}` : "",
    event.startDay ? `former_daily_event_day_${event.startDay}` : "",
  ]);
}

function summarizeEvent(event) {
  if (!event) return null;
  return {
    eventId: event.eventId,
    title: event.title,
    status: event.status,
    eventLayer: event.eventLayer,
    countsAsMainEvent: event.countsAsMainEvent,
    blocksMainEventGeneration: event.blocksMainEventGeneration,
    startDay: event.startDay,
    startTime: event.startTime,
    endDay: event.endDay,
    endTime: event.endTime,
    severity: event.severity,
    tags: event.tags || [],
  };
}

async function buildRepairPlan() {
  const gameState = await GameState.findOne({ gameId: GAME_ID }).lean();
  if (!gameState) throw new Error(`No existe GameState para gameId: ${GAME_ID}`);

  const dailyEvents = await WorldEvent.find({
    ...eventGameFilter(GAME_ID),
    tags: DAILY_EVENT_TAG,
  })
    .select(
      "eventId title status templateId eventLayer countsAsMainEvent blocksMainEventGeneration startDay startTime endDay endTime severity tags"
    )
    .lean();

  const openMainCandidates = sortOpenMainCandidates(
    dailyEvents.filter((event) => MAIN_EVENT_OPEN_STATUSES.includes(event.status) && isMainEvent(event))
  );
  const keptMainEvent = openMainCandidates[0] || null;
  const duplicateOpenEvents = openMainCandidates.slice(1);
  const changes = [];

  for (const event of dailyEvents.filter(isLegacyDailyEvent)) {
    const isDuplicateOpen = duplicateOpenEvents.some((entry) => entry.eventId === event.eventId);
    if (isDuplicateOpen) continue;
    changes.push({
      type: "mark_legacy_daily_event_as_main",
      eventId: event.eventId,
      before: summarizeEvent(event),
      after: {
        eventLayer: EVENT_LAYERS.MAIN,
        countsAsMainEvent: true,
        blocksMainEventGeneration: true,
        addTags: ["main_event", SOURCE],
      },
    });
  }

  for (const event of duplicateOpenEvents) {
    const nextLayer = demotedLayerFor(event);
    changes.push({
      type: "demote_duplicate_open_daily_event",
      eventId: event.eventId,
      before: summarizeEvent(event),
      after: {
        eventLayer: nextLayer,
        countsAsMainEvent: false,
        blocksMainEventGeneration: false,
        addTags: [nextLayer, "demoted_from_duplicate_main_event", SOURCE, ...formerDailyEventTags(event)],
        removeTags: unique(["main_event", ...dailyEventTags(event.tags || [])]),
      },
    });
  }

  for (const event of dailyEvents.filter(
    (entry) =>
      entry.countsAsMainEvent === false &&
      entry.eventLayer !== EVENT_LAYERS.MAIN &&
      (entry.tags || []).includes(DAILY_EVENT_TAG)
  )) {
    changes.push({
      type: "strip_demoted_daily_event_tags",
      eventId: event.eventId,
      before: summarizeEvent(event),
      after: {
        eventLayer: event.eventLayer || EVENT_LAYERS.MINOR_RUMOR,
        countsAsMainEvent: false,
        blocksMainEventGeneration: false,
        addTags: [event.eventLayer || EVENT_LAYERS.MINOR_RUMOR, SOURCE, ...formerDailyEventTags(event)],
        removeTags: unique(["main_event", ...dailyEventTags(event.tags || [])]),
      },
    });
  }

  const expectedActiveEventIds = keptMainEvent && keptMainEvent.status === "active" ? [keptMainEvent.eventId] : [];
  const currentActiveEventIds = unique(gameState.activeEventIds || []);

  if (JSON.stringify(expectedActiveEventIds) !== JSON.stringify(currentActiveEventIds)) {
    changes.push({
      type: "reconcile_main_active_event_ids",
      before: currentActiveEventIds,
      after: expectedActiveEventIds,
    });
  }

  return {
    gameState: {
      gameId: gameState.gameId,
      currentDay: gameState.currentDay,
      time: gameState.time,
      block: gameState.block,
      activeEventIds: gameState.activeEventIds || [],
    },
    keptMainEvent: summarizeEvent(keptMainEvent),
    duplicateOpenEvents: duplicateOpenEvents.map(summarizeEvent),
    changes,
  };
}

async function applyRepairPlan(plan) {
  if (!plan.changes.length) return { applied: false, reason: "no_changes" };

  const session = await mongoose.startSession();
  let checkpoint = null;

  try {
    await session.withTransaction(async () => {
      const gameState = await GameState.findOne({ gameId: GAME_ID }).session(session);
      if (!gameState) throw new Error(`No existe GameState para gameId: ${GAME_ID}`);

      checkpoint = await createAutomaticCheckpoint({
        gameId: GAME_ID,
        title: "Auto checkpoint - reparar capas de eventos",
        reason: "Antes de separar evento principal, rumores menores y eventos de fondo.",
        triggerKey: SOURCE,
        metadata: {
          source: SOURCE,
          changeTypes: plan.changes.map((change) => change.type),
        },
        session,
      });

      for (const change of plan.changes) {
        if (change.type === "mark_legacy_daily_event_as_main") {
          await WorldEvent.updateOne(
            { eventId: change.eventId },
            {
              $set: {
                eventLayer: EVENT_LAYERS.MAIN,
                countsAsMainEvent: true,
                blocksMainEventGeneration: true,
              },
              $addToSet: {
                tags: {
                  $each: change.after.addTags,
                },
              },
            },
            { runValidators: true, session }
          );
        }

        if (change.type === "demote_duplicate_open_daily_event") {
          await WorldEvent.updateOne(
            { eventId: change.eventId },
            {
              $pull: {
                tags: { $in: change.after.removeTags },
              },
            },
            { runValidators: true, session }
          );

          await WorldEvent.updateOne(
            { eventId: change.eventId },
            {
              $set: {
                eventLayer: change.after.eventLayer,
                countsAsMainEvent: false,
                blocksMainEventGeneration: false,
              },
              $addToSet: {
                tags: {
                  $each: change.after.addTags,
                },
              },
            },
            { runValidators: true, session }
          );
        }

        if (change.type === "strip_demoted_daily_event_tags") {
          await WorldEvent.updateOne(
            { eventId: change.eventId },
            {
              $pull: {
                tags: { $in: change.after.removeTags },
              },
            },
            { runValidators: true, session }
          );

          await WorldEvent.updateOne(
            { eventId: change.eventId },
            {
              $set: {
                eventLayer: change.after.eventLayer,
                countsAsMainEvent: false,
                blocksMainEventGeneration: false,
              },
              $addToSet: {
                tags: {
                  $each: change.after.addTags,
                },
              },
            },
            { runValidators: true, session }
          );
        }
      }

      const activeIdsChange = plan.changes.find((change) => change.type === "reconcile_main_active_event_ids");
      if (activeIdsChange) {
        gameState.activeEventIds = activeIdsChange.after;
        await gameState.save({ session });
      }

      await EventLog.create(
        [
          {
            logId: `log_${SOURCE}_${Date.now()}`,
            gameId: GAME_ID,
            day: gameState.currentDay,
            timeStart: gameState.time,
            timeEnd: gameState.time,
            locationId: gameState.locationId,
            type: "system_correction",
            summary: "Reparacion tecnica: evento principal unico y eventos secundarios separados por capa.",
            involvedCharacterIds: [gameState.characterId],
            mechanicalChanges: {
              source: SOURCE,
              changes: plan.changes,
              checkpoint,
            },
            visibility: "hidden",
            source: "admin_fix",
            tags: ["admin_fix", SOURCE],
          },
        ],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  return {
    applied: true,
    checkpoint,
  };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for repair:event-layers.");
  }

  await connectDB();
  const plan = await buildRepairPlan();

  console.log(
    JSON.stringify(
      {
        mode: WRITE ? "write" : "dry-run",
        gameId: GAME_ID,
        gameState: plan.gameState,
        keptMainEvent: plan.keptMainEvent,
        duplicateOpenEvents: plan.duplicateOpenEvents,
        changeCount: plan.changes.length,
        changes: plan.changes,
      },
      null,
      2
    )
  );

  if (!WRITE) {
    console.log("Dry-run only. Re-run with --write or WRITE_EVENT_LAYERS=true to apply.");
    return;
  }

  const result = await applyRepairPlan(plan);
  const after = await buildRepairPlan();
  console.log(
    JSON.stringify(
      {
        result,
        remainingChangeCount: after.changes.length,
        remainingChanges: after.changes,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("Event layer repair failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });

module.exports = {
  buildRepairPlan,
  demotedLayerFor,
  isLegacyDailyEvent,
};
