const GameState = require("../models/GameState");
const WorldEvent = require("../models/WorldEvent");
const { syncNpcRoutines } = require("../services/routineService");
const { eventGameFilter } = require("../services/dailyEventSchedulerService");
const { previewWorldTick } = require("../services/worldTickService");
const { summarizeWorldEvent, toIntQuery } = require("../utils/responseShaping");

function listQueryValues(value) {
  if (value === undefined || value === null || value === "") return [];
  const values = Array.isArray(value) ? value : String(value).split(",");
  return values.map((entry) => String(entry).trim()).filter(Boolean);
}

function buildWorldEventQuery(query) {
  const gameId = query.gameId || "isekai_lucas_main";
  const filter = {
    ...eventGameFilter(gameId),
  };

  const statuses = listQueryValues(query.status || query.statuses);
  if (statuses.length > 0) {
    filter.status = statuses.length === 1 ? statuses[0] : { $in: statuses };
  }

  const tags = listQueryValues(query.tag || query.tags);
  if (tags.length > 0) {
    filter.tags = { $all: tags };
  }

  const severities = listQueryValues(query.severity || query.severities);
  if (severities.length > 0) {
    filter.severity = severities.length === 1 ? severities[0] : { $in: severities };
  }

  if (query.npcId) filter.affectedNpcIds = query.npcId;
  if (query.locationId) filter.affectedLocationIds = query.locationId;

  return {
    gameId,
    filter,
  };
}

async function listWorldEvents(req, res) {
  try {
    const { gameId, filter } = buildWorldEventQuery(req.query || {});
    const limit = toIntQuery(req.query.limit, 20, 1, 50);

    const events = await WorldEvent.find(filter)
      .sort({ startDay: -1, startTime: -1, updatedAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      ok: true,
      filters: {
        gameId,
        status: req.query.status || req.query.statuses || "",
        tag: req.query.tag || req.query.tags || "",
        severity: req.query.severity || req.query.severities || "",
        npcId: req.query.npcId || "",
        locationId: req.query.locationId || "",
        limit,
      },
      count: events.length,
      events: events.map(summarizeWorldEvent),
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error listando eventos del mundo.",
      details: error.message,
    });
  }
}

async function getWorldEvent(req, res) {
  try {
    const gameId = req.query.gameId || "isekai_lucas_main";
    const event = await WorldEvent.findOne({
      ...eventGameFilter(gameId),
      eventId: req.params.eventId,
    }).lean();

    if (!event) {
      return res.status(404).json({
        ok: false,
        error: `No existe WorldEvent con id: ${req.params.eventId}`,
      });
    }

    return res.json({
      ok: true,
      event: summarizeWorldEvent(event),
      raw: event,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error obteniendo evento del mundo.",
      details: error.message,
    });
  }
}

async function syncRoutines(req, res) {
  try {
    const body = req.body || {};
    const query = req.query || {};

    const gameId = body.gameId || query.gameId || "isekai_lucas_main";

    const gameState = await GameState.findOne({ gameId }).lean();

    if (!gameState) {
      return res.status(404).json({
        ok: false,
        error: `No existe GameState para gameId: ${gameId}`,
      });
    }

    const result = await syncNpcRoutines({
      day: gameState.currentDay,
      time: gameState.time,
    });

    return res.json({
      ok: true,
      message: "Rutinas sincronizadas correctamente.",
      result,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: "Error sincronizando rutinas.",
      details: error.message,
    });
  }
}

async function previewWorldTickController(req, res) {
  try {
    const body = req.body || {};

    const preview = await previewWorldTick({
      gameId: body.gameId || "isekai_lucas_main",
      fromDay: body.fromDay ?? null,
      fromTime: body.fromTime || "",
      toDay: body.toDay ?? null,
      toTime: body.toTime || "",
      dryRun: body.dryRun !== false,
    });

    return res.json({
      ok: true,
      preview,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

module.exports = {
  getWorldEvent,
  listWorldEvents,
  syncRoutines,
  previewWorldTickController,
};
