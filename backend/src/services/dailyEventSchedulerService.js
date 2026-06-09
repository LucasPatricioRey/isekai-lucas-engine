const WorldEvent = require("../models/WorldEvent");

const DAILY_EVENT_TAG = "daily_event";
const DAILY_EVENT_PENDING_CONSEQUENCE_TAG = "consequence_pending";
const DEFAULT_GAME_ID = "isekai_lucas_main";

const BLOCK_ROLLS = [
  { roll: 1, key: "morning", block: "Mañana", startTime: "06:00", endTime: "12:00" },
  { roll: 2, key: "midday", block: "Mediodía", startTime: "12:00", endTime: "14:00" },
  { roll: 3, key: "afternoon", block: "Tarde", startTime: "14:00", endTime: "18:00" },
  { roll: 4, key: "night", block: "Noche", startTime: "18:00", endTime: "00:00" },
];

const MINOR_TEMPLATES = [
  {
    id: "inn_supply_request",
    title: "Pedido menor de suministros en La Grulla Azul",
    type: "social_economy",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_grulla_azul", "loc_hoshimori_grulla_azul_cocina"],
    affectedNpcIds: ["npc_roberto_valen", "npc_yara_mils"],
    affectedFactionIds: ["faction_hoshimori_innkeepers"],
    cause: "La actividad normal de la posada deja una necesidad menor de coordinación o ayuda.",
    consequence:
      "Si Lucas no se involucra, la posada lo resuelve por su cuenta con una molestia leve, demoras chicas o menos margen de confianza práctica.",
  },
  {
    id: "market_price_argument",
    title: "Discusión menor en el mercado",
    type: "social_market",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_market"],
    affectedNpcIds: ["npc_pavo_miret", "npc_irma_solan"],
    affectedFactionIds: ["faction_hoshimori_merchants"],
    cause: "Precios, barro residual o rumores de ruta tensan una conversación cotidiana.",
    consequence:
      "Si se ignora, queda como malestar local menor y puede distorsionar un rumor o encarecer un trato pequeño.",
  },
  {
    id: "guild_board_update",
    title: "Actualización menor en la cartelera del gremio",
    type: "guild_notice",
    visibility: "public",
    affectedLocationIds: ["loc_hoshimori_guild"],
    affectedNpcIds: ["npc_mara_quent"],
    affectedFactionIds: ["faction_hoshimori_guild"],
    cause: "El gremio reorganiza encargos simples y avisos para Porcelana/Cobre.",
    consequence:
      "Si Lucas no revisa el aviso, puede perder una oportunidad menor o enterarse tarde de una tarea simple.",
  },
  {
    id: "road_minor_report",
    title: "Reporte menor sobre una ruta cercana",
    type: "travel_rumor",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_guild", "loc_hoshimori_mill_road"],
    affectedNpcIds: ["npc_garrick_thorne"],
    affectedFactionIds: ["faction_hoshimori_guild", "faction_hoshimori_guard"],
    cause: "Caminantes y guardias traen una observación breve sobre caminos, barro o rastros.",
    consequence:
      "Si se ignora, el mundo sigue sin daño fuerte, pero rutas o rumores pueden quedar menos claros para Lucas.",
  },
  {
    id: "npc_small_favor",
    title: "Favor pequeño de un vecino de Hoshimori",
    type: "social_favor",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_grulla_azul", "loc_hoshimori_market"],
    affectedNpcIds: ["npc_fern", "npc_irma_solan"],
    affectedFactionIds: [],
    cause: "Alguien cercano necesita ayuda sencilla o una respuesta breve durante su rutina.",
    consequence:
      "Si Lucas no ayuda, no hay castigo serio, pero se pierde una escena social o una impresión positiva menor.",
  },
];

const IMPORTANT_TEMPLATES = [
  {
    id: "missing_runner",
    title: "Recadero retrasado sin confirmar",
    type: "urgent_local",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_guild", "loc_hoshimori_mill_road"],
    affectedNpcIds: ["npc_mara_quent", "npc_garrick_thorne"],
    affectedFactionIds: ["faction_hoshimori_guild", "faction_hoshimori_guard"],
    cause: "Un traslado local no cerró a tiempo y el gremio necesita confirmar que no haya peligro real.",
    consequence:
      "Si Lucas no atiende el asunto, puede escalar a búsqueda formal, pérdida de confianza del gremio o riesgo para un NPC menor.",
  },
  {
    id: "supply_chain_break",
    title: "Problema serio de suministros locales",
    type: "economy_pressure",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_grulla_azul", "loc_hoshimori_market"],
    affectedNpcIds: ["npc_roberto_valen", "npc_pavo_miret"],
    affectedFactionIds: ["faction_hoshimori_merchants"],
    cause: "La economía diaria de Hoshimori depende de rutas cortas, clima y coordinación entre comerciantes.",
    consequence:
      "Si no se interviene, puede haber faltantes temporales, precios peores o tensión real entre posada y mercado.",
  },
  {
    id: "route_threat_report",
    title: "Aviso importante sobre amenaza de ruta",
    type: "route_threat",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_guild", "loc_hoshimori_mill_road"],
    affectedNpcIds: ["npc_garrick_thorne", "npc_sael_lyren"],
    affectedFactionIds: ["faction_hoshimori_guild", "faction_hoshimori_guard"],
    cause: "Rastros, rumores o demoras sugieren que una ruta cercana necesita atención antes de empeorar.",
    consequence:
      "Si se ignora, puede aumentar el peligro de viaje, bloquear encargos o causar daño a terceros fuera de escena.",
  },
  {
    id: "forest_anomaly",
    title: "Anomalía inquietante del Bosque de los Susurros",
    type: "magic_anomaly",
    visibility: "local",
    affectedLocationIds: ["loc_hoshimori_guild", "loc_hoshimori_forest_edge"],
    affectedNpcIds: ["npc_fern", "npc_mara_quent"],
    affectedFactionIds: ["faction_hoshimori_guild"],
    cause: "Los rumores sobre luces y sensaciones raras del bosque se vuelven lo bastante concretos como para exigir cuidado.",
    consequence:
      "Si Lucas no lo atiende, puede crecer el miedo local, perderse información mágica o aparecer una restricción de ruta.",
  },
  {
    id: "guild_priority_call",
    title: "Llamado prioritario del gremio local",
    type: "guild_priority",
    visibility: "public",
    affectedLocationIds: ["loc_hoshimori_guild", "loc_hoshimori_grulla_azul"],
    affectedNpcIds: ["npc_mara_quent", "npc_roberto_valen"],
    affectedFactionIds: ["faction_hoshimori_guild"],
    cause: "El gremio necesita a gente disponible para resolver un problema local antes de que cierre el día.",
    consequence:
      "Si Lucas lo ignora, puede perder confianza institucional o quedar marcado como poco fiable para tareas futuras.",
  },
];

function randomInt(min, max, rng = Math.random) {
  return min + Math.floor(rng() * (max - min + 1));
}

function rollDailyEventDice(rng = Math.random) {
  const blockRoll = randomInt(1, 4, rng);
  const importanceRoll = randomInt(1, 10, rng);
  const durationRoll = randomInt(1, 15, rng);

  return {
    blockRoll,
    importanceRoll,
    durationRoll,
    importance: importanceRoll <= 7 ? "minor" : "important",
  };
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function toAbsoluteMinutes(day, time) {
  return (Number(day || 1) - 1) * 1440 + timeToMinutes(time);
}

function eventGameFilter(gameId = DEFAULT_GAME_ID) {
  if (gameId === DEFAULT_GAME_ID) {
    return {
      $or: [
        { gameId },
        { gameId: { $exists: false } },
        { gameId: "" },
        { gameId: null },
      ],
    };
  }

  return { gameId };
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function sanitizeIdPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function hashString(value) {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function getBlockByRoll(blockRoll) {
  return BLOCK_ROLLS.find((entry) => entry.roll === blockRoll) || BLOCK_ROLLS[0];
}

function selectTemplate({ gameId, day, rolls }) {
  const templates = rolls.importance === "important" ? IMPORTANT_TEMPLATES : MINOR_TEMPLATES;
  const seed = `${gameId}:${day}:${rolls.blockRoll}:${rolls.importanceRoll}:${rolls.durationRoll}`;
  return templates[hashString(seed) % templates.length];
}

function getEndDay(startDay, durationDays, block) {
  const baseEndDay = Number(startDay) + Number(durationDays);
  return block.endTime === "00:00" ? baseEndDay + 1 : baseEndDay;
}

function getEventStatusAt(event, day, time) {
  if (["resolved", "expired", "consequences_applied", "cancelled"].includes(event.status)) {
    return event.status;
  }

  const now = toAbsoluteMinutes(day, time);
  const start = toAbsoluteMinutes(event.startDay, event.startTime);
  const end = event.endDay && event.endTime ? toAbsoluteMinutes(event.endDay, event.endTime) : null;

  if (end !== null && now >= end) return "expired";
  if (now >= start) return "active";
  return "scheduled";
}

function shouldEnsureDailyEvent(gameState) {
  if (!gameState?.currentDay || !gameState?.time) return false;
  return timeToMinutes(gameState.time) >= timeToMinutes("06:00");
}

function buildDailyEventPayload({ gameState, rolls }) {
  const gameId = gameState.gameId || DEFAULT_GAME_ID;
  const startDay = gameState.currentDay;
  const block = getBlockByRoll(rolls.blockRoll);
  const template = selectTemplate({ gameId, day: startDay, rolls });
  const durationDays = rolls.durationRoll;
  const severity = rolls.importance === "important" ? "major" : "minor";
  const endDay = getEndDay(startDay, durationDays, block);
  const endTime = block.endTime;
  const eventId = `event_${sanitizeIdPart(gameId)}_d${startDay}_daily_${template.id}`;
  const status = getEventStatusAt(
    {
      status: "scheduled",
      startDay,
      startTime: block.startTime,
      endDay,
      endTime,
    },
    gameState.currentDay,
    gameState.time
  );

  return {
    eventId,
    gameId,
    title: template.title,
    type: template.type,
    scope: "local",
    status,
    startDay,
    startTime: block.startTime,
    endDay,
    endTime,
    affectedLocationIds: template.affectedLocationIds || [gameState.locationId],
    affectedNpcIds: template.affectedNpcIds || [],
    affectedFactionIds: template.affectedFactionIds || [],
    effects: [
      {
        type: "daily_event_rolls",
        target: "scheduler",
        value: {
          blockRoll: rolls.blockRoll,
          block: block.block,
          startTime: block.startTime,
          importanceRoll: rolls.importanceRoll,
          importance: rolls.importance,
          durationRoll: rolls.durationRoll,
          durationDays,
        },
        reason: "Tiradas del evento diario: bloque, importancia y duracion.",
      },
      {
        type: "consequence_if_ignored",
        target: rolls.importance === "important" ? "major_event" : "minor_event",
        value: {
          level: rolls.importance === "important" ? "major" : "minor",
          summary: template.consequence,
          requiresPlayerResolution: rolls.importance === "important",
        },
        reason:
          rolls.importance === "important"
            ? "Evento importante: debe atenderse o resolver sus consecuencias."
            : "Evento menor: opcional, con consecuencias leves si se ignora.",
      },
    ],
    visibility: template.visibility || "local",
    cause: template.cause,
    severity,
    createdBy: "world_tick",
    tags: unique([
      DAILY_EVENT_TAG,
      `daily_event_day_${startDay}`,
      `daily_event_${rolls.importance}`,
      `daily_event_start_${block.key}`,
      `daily_event_duration_${durationDays}`,
      `daily_event_template_${template.id}`,
      rolls.importance === "important" ? "requires_player_resolution" : "optional_event",
    ]),
    templateId: template.id,
    rolls: {
      ...rolls,
      block: block.block,
      startTime: block.startTime,
      durationDays,
    },
  };
}

async function findDailyEventForDay({ gameId = DEFAULT_GAME_ID, day, session = null }) {
  return WorldEvent.findOne({
    ...eventGameFilter(gameId),
    tags: { $all: [DAILY_EVENT_TAG, `daily_event_day_${day}`] },
  })
    .session(session)
    .lean();
}

async function ensureDailyEventForGameState(gameState, { session = null, rng = Math.random, rolls = null } = {}) {
  if (!shouldEnsureDailyEvent(gameState)) {
    return {
      generated: false,
      reason: "daily_event_generation_waits_for_morning",
    };
  }

  const gameId = gameState.gameId || DEFAULT_GAME_ID;
  const existing = await findDailyEventForDay({ gameId, day: gameState.currentDay, session });

  if (existing) {
    return {
      generated: false,
      reason: "daily_event_already_exists_for_day",
      event: existing,
    };
  }

  const effectiveRolls = rolls || rollDailyEventDice(rng);
  const payload = buildDailyEventPayload({ gameState, rolls: effectiveRolls });
  const { templateId, rolls: resolvedRolls, ...eventPayload } = payload;

  const event = await WorldEvent.findOneAndUpdate(
    { eventId: eventPayload.eventId },
    { $setOnInsert: eventPayload },
    { upsert: true, returnDocument: "after", runValidators: true, session }
  ).lean();

  if (event.status === "active") {
    gameState.activeEventIds = unique([...(gameState.activeEventIds || []), event.eventId]);
  }

  return {
    generated: true,
    event,
    templateId,
    rolls: resolvedRolls,
  };
}

async function getLifecycleCandidates(gameId, session) {
  return WorldEvent.find({
    ...eventGameFilter(gameId),
    status: { $in: ["scheduled", "active"] },
  })
    .session(session)
    .lean();
}

async function advanceDailyEventLifecycle(gameState, { session = null } = {}) {
  const gameId = gameState.gameId || DEFAULT_GAME_ID;
  const candidates = await getLifecycleCandidates(gameId, session);
  const activated = [];
  const expired = [];
  const activeEventIds = [];

  for (const event of candidates) {
    const nextStatus = getEventStatusAt(event, gameState.currentDay, gameState.time);

    if (nextStatus === "active") {
      activeEventIds.push(event.eventId);

      if (event.status !== "active") {
        const updated = await WorldEvent.findOneAndUpdate(
          { eventId: event.eventId },
          {
            $set: { status: "active" },
            $addToSet: { tags: "event_started" },
          },
          { returnDocument: "after", runValidators: true, session }
        ).lean();
        activated.push(updated);
      }
    }

    if (nextStatus === "expired") {
      const consequenceTag = event.severity === "major" ? "major_consequence_pending" : "minor_consequence_pending";
      const updated = await WorldEvent.findOneAndUpdate(
        { eventId: event.eventId },
        {
          $set: { status: "expired" },
          $addToSet: {
            tags: {
              $each: ["expired_unresolved", DAILY_EVENT_PENDING_CONSEQUENCE_TAG, consequenceTag],
            },
          },
        },
        { returnDocument: "after", runValidators: true, session }
      ).lean();
      expired.push(updated);
    }
  }

  gameState.activeEventIds = unique(activeEventIds);

  return {
    activated,
    expired,
    activeEventIds: gameState.activeEventIds,
  };
}

async function reconcileDailyEventsForGameState(gameState, options = {}) {
  const before = await advanceDailyEventLifecycle(gameState, options);
  const ensured = await ensureDailyEventForGameState(gameState, options);
  const after = await advanceDailyEventLifecycle(gameState, options);

  const changed =
    before.activated.length > 0 ||
    before.expired.length > 0 ||
    Boolean(ensured.generated) ||
    after.activated.length > 0 ||
    after.expired.length > 0;

  return {
    changed,
    generated: ensured.generated ? ensured : null,
    skippedReason: ensured.generated ? "" : ensured.reason,
    activated: [...before.activated, ...after.activated],
    expired: [...before.expired, ...after.expired],
    activeEventIds: gameState.activeEventIds || [],
  };
}

module.exports = {
  DAILY_EVENT_TAG,
  IMPORTANT_TEMPLATES,
  MINOR_TEMPLATES,
  BLOCK_ROLLS,
  advanceDailyEventLifecycle,
  buildDailyEventPayload,
  ensureDailyEventForGameState,
  eventGameFilter,
  getEventStatusAt,
  reconcileDailyEventsForGameState,
  rollDailyEventDice,
  shouldEnsureDailyEvent,
  timeToMinutes,
  toAbsoluteMinutes,
};
