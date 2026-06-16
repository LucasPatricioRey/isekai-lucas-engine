const GameState = require("../models/GameState");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const EventLog = require("../models/EventLog");
const WorldEvent = require("../models/WorldEvent");
const { formatCopper } = require("../utils/mechanicalChangeDisplay");

const DEFAULT_GAME_ID = "isekai_lucas_main";
const SCHEMA_VERSION = "turn_intake_v1";

function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function textMatchesAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function inferDomains(text) {
  const domains = [];
  const checks = [
    ["magic", /\b(magia|mana|hechizo|conjur|electric|rayo|chispa|medita|aqua)\b/],
    ["social", /\b(habla|dile|dice|pregunta|saluda|agradece|disculpa|yara|fern|roberto|nia|eddan|garrick|mara|sael|doran)\b/],
    ["travel", /\b(viaja|camina|corre|vuelve|va al|ir al|ruta|camino|sendero|bosque|gremio|posada)\b/],
    ["work", /\b(trabaja|turno|tardanza|contrato|servir|mesa|platos|roberto)\b/],
    ["rest_biology", /\b(descansa|duerme|come|bebe|hambre|cansancio|energia|saciedad|cama)\b/],
    ["economy", /\b(compra|vende|paga|precio|stock|monedas|cobre|plata|oro)\b/],
    ["mission_event", /\b(mision|cartelera|evento|recompensa|reporte|gremio)\b/],
    ["inventory_evidence", /\b(inventario|mochila|muestra|evidencia|pelo gris|nota|daga|objeto)\b/],
    ["combat_injury", /\b(ataca|combate|golpea|herida|dano|sangre|enemigo|huye)\b/],
  ];

  for (const [domain, pattern] of checks) {
    if (pattern.test(text)) domains.push(domain);
  }

  return unique(domains);
}

function classifyTurn({ text = "", aiClassification = null } = {}) {
  const normalized = normalizeText(text);
  const aiDomains = asArray(aiClassification?.domains).map((domain) => String(domain || "").trim()).filter(Boolean);
  const domains = unique([...inferDomains(normalized), ...aiDomains]);

  const continueScene = textMatchesAny(normalized, [
    /^continuar( historia)?$/,
    /^continua(r)?( la)? historia$/,
    /^seguir( escena| historia)?$/,
    /^continua$/,
    /^que pasa ahora\??$/,
    /^sigue$/,
  ]);

  const observeOnly = textMatchesAny(normalized, [
    /^lucas mira( alrededor)?$/,
    /^lucas observa( alrededor)?$/,
    /^miro( alrededor)?$/,
    /^observo( alrededor)?$/,
    /^pensar$/,
    /^lucas piensa$/,
  ]);

  const likelyMutation = textMatchesAny(normalized, [
    /\b(trabaja|entrena|practica|corre|viaja|camina|vuelve|va al|ir al|descansa|duerme|come|bebe|compra|vende|paga|toma|agarra|usa|ataca|conjura|lanza|acepta|rechaza|reporta|completa|investiga|revisa)\b/,
  ]);
  const likelySocial = domains.includes("social") && /\b(habla|dice|pregunta|saluda|agradece|disculpa|pide)\b/.test(normalized);

  if (continueScene || observeOnly || (!normalized && !likelyMutation)) {
    return {
      intent: continueScene ? "continue_scene" : "observe_scene",
      domains: domains.length ? domains : ["scene"],
      needsMutation: false,
      suggestedOperation: "narrateOnly",
      supported: true,
      confidence: continueScene ? "high" : "medium",
    };
  }

  if (likelySocial) {
    return {
      intent: "social",
      domains: unique(["social", ...domains]),
      needsMutation: false,
      suggestedOperation: "getCompactContext",
      supported: false,
      confidence: "medium",
      fallbackReason: "Fase 1 no trae paquete social profundo; usar flujo social existente.",
    };
  }

  if (likelyMutation || domains.length > 0) {
    return {
      intent: domains.length > 1 ? "compound" : domains[0] || "player_action",
      domains: domains.length ? domains : ["scene"],
      needsMutation: true,
      suggestedOperation: "resolveTurn_or_existing_flow",
      supported: false,
      confidence: "medium",
      fallbackReason: "Fase 1 solo cubre narracion sin mutacion.",
    };
  }

  return {
    intent: "continue_scene",
    domains: ["scene"],
    needsMutation: false,
    suggestedOperation: "narrateOnly",
    supported: true,
    confidence: "low",
  };
}

function formatDiegeticDate(date = {}) {
  const day = date.day ?? "?";
  const month = date.month || "?";
  const year = date.year ?? "?";
  return `${day} de ${month}, A\u00f1o ${year}`;
}

function statLine(label, stat = {}) {
  const current = Number.isFinite(Number(stat.current)) ? Math.round(Number(stat.current)) : "?";
  const max = Number.isFinite(Number(stat.max)) ? Math.round(Number(stat.max)) : "?";
  const suffix = stat.label ? `\u2014${stat.label}` : "";
  return `${label}: ${current}/${max}${suffix}`;
}

function isTechnicalLog(log = {}) {
  const source = String(log.source || "").toLowerCase();
  const tags = (log.tags || []).map((tag) => String(tag || "").toLowerCase());
  if (["admin", "admin_fix", "backend_validation", "mechanical_audit", "system_correction"].includes(source)) {
    return true;
  }
  return tags.some(
    (tag) =>
      tag.includes("test") ||
      tag.includes("debug") ||
      tag.includes("repair") ||
      tag.includes("audit")
  );
}

function eventVisibleToLucas(event = {}, { locationIds = [] } = {}) {
  if (!event || !["active", "scheduled"].includes(event.status)) return false;
  if (event.visibility === "public") return true;
  if (event.visibility !== "local") return false;
  const affected = event.affectedLocationIds || [];
  return affected.some((locationId) => locationIds.includes(locationId));
}

function inferNarrativeLocation({ location = null, parentLocation = null, latestLog = null } = {}) {
  const locationName = location?.name || location?.locationId || "?";
  const summary = normalizeText(latestLog?.summary || "");
  const locationText = normalizeText(
    `${location?.name || ""} ${location?.type || ""} ${(location?.tags || []).join(" ")} ${location?.locationId || ""}`
  );
  const isInn = /grulla|posada|inn|tavern/.test(locationText);
  const roomMention = /\b(cuarto|habitacion|cama|sube a su cuarto|en su cuarto)\b/.test(summary);

  if (isInn && roomMention) {
    return {
      locationId: location?.locationId || "",
      canonicalName: locationName,
      displayName: `${locationName} - cuarto de Lucas`,
      subLocationName: "cuarto de Lucas",
      inferredFromLatestLog: true,
      parentLocationName: parentLocation?.name || "",
      privacy: "private_room_inferred",
    };
  }

  return {
    locationId: location?.locationId || "",
    canonicalName: locationName,
    displayName: locationName,
    subLocationName: "",
    inferredFromLatestLog: false,
    parentLocationName: parentLocation?.name || "",
    privacy: "location_scope",
  };
}

function summarizeNpcPresence(npcs = [], location = null, narrativeLocation = null) {
  if (narrativeLocation?.privacy === "private_room_inferred") {
    return {
      visible: [],
      nearby: [],
      line: "ninguno visible en el cuarto",
      offscreenHint: "puede haber sonidos apagados de la posada abajo, pero no NPCs visibles sin nueva accion.",
    };
  }

  const directVisible = new Set(location?.visibleNpcIds || []);
  const probable = new Set(location?.probableNpcIds || []);
  const visible = [];
  const nearby = [];

  for (const npc of npcs) {
    const summary = {
      npcId: npc.npcId,
      name: npc.name,
      role: npc.role || "",
      currentTask: npc.currentTask || "",
      availability: npc.availability || {},
    };
    if (directVisible.has(npc.npcId) && (!npc.currentLocationId || npc.currentLocationId === location?.locationId)) {
      visible.push(summary);
    } else if (probable.has(npc.npcId) || npc.currentLocationId === location?.parentLocationId) {
      nearby.push(summary);
    }
  }

  const visibleNames = visible.map((npc) => npc.name || npc.npcId);
  const nearbyNames = nearby.map((npc) => npc.name || npc.npcId);
  const line = visibleNames.length && nearbyNames.length
    ? `${visibleNames.join(", ")}; cerca/probables: ${nearbyNames.join(", ")}`
    : visibleNames.length
      ? visibleNames.join(", ")
      : nearbyNames.length
        ? `cerca/probables: ${nearbyNames.join(", ")}`
        : "ninguno visible";

  return {
    visible,
    nearby,
    line,
    offscreenHint: "",
  };
}

function buildNarrationBoundaries({ route, narrativeLocation, visibleEvents = [], latestLog = null } = {}) {
  const boundaries = [
    "No mutar estado, no avanzar tiempo y no aplicar costes/EXP/dinero.",
    "No llamar searchDocs para narrateOnly si este paquete trae displayBundle.",
    "Usar escena primero y HUD final; copiar displayBundle.renderLines si el GPT necesita formato exacto.",
    "No revelar eventos no visibles para Lucas aunque existan en Mongo.",
  ];

  if (narrativeLocation?.inferredFromLatestLog) {
    boundaries.push("La sububicacion es inferida por el ultimo log; narrar como cuarto privado sin mover locationId.");
  }
  if (visibleEvents.length === 0) {
    boundaries.push("Evento activo para HUD: ninguno visible para Lucas ahora.");
  }
  if (latestLog?.summary) {
    boundaries.push("Continuar desde latestVisibleLog.summary; no repetirlo como resumen plano.");
  }
  if (!route.supported) {
    boundaries.push("Este paquete no cubre la accion; usar fallback recomendado.");
  }

  return boundaries;
}

function buildNoMutationDisplayBundle({ gameState, narrativeLocation, npcPresence, visibleEvents, latestLog }) {
  const headerLines = [
    `## D\u00eda ${gameState.currentDay ?? "?"}\u2014${gameState.time || "?"}`,
    `**Ubicaci\u00f3n:** ${narrativeLocation.displayName}`,
  ];
  const status = gameState.lucasStatus || {};
  const eventNames = visibleEvents.map((event) => event.title || event.eventId).filter(Boolean);
  const situation = latestLog?.summary
    ? latestLog.summary.replace(/\s+/g, " ").trim().replace(/\.+$/g, ".")
    : "sin cambios mecanicos nuevos; describir la situacion visible sin inventar cambios.";
  const stateLines = [
    `D\u00eda: ${gameState.currentDay ?? "?"}\u2014${formatDiegeticDate(gameState.diegeticDate || {})}`,
    `Bloque: ${gameState.block || "?"}`,
    `Hora: ${gameState.time || "?"}`,
    `Ubicaci\u00f3n: ${narrativeLocation.displayName}`,
    statLine("Vida", status.life),
    statLine("Saciedad", status.satiety),
    statLine("Energ\u00eda", status.energy),
    statLine("MP", status.mp),
    `Dinero: ${formatCopper(gameState.moneyCopper || 0)}`,
    `Evento activo: ${eventNames.length ? eventNames.join(", ") : "ninguno visible para Lucas ahora"}`,
    `Situaci\u00f3n: ${situation}`,
    `NPCs visibles/cerca: ${npcPresence.line}.`,
  ];
  const changeLines = ["Sin cambios mecanicos nuevos. No avanzo el tiempo."];
  const renderLines = [
    ...headerLines,
    "",
    "### Cambios relevantes",
    ...changeLines,
    "",
    "## Estado actual",
    ...stateLines,
  ];

  return {
    schemaVersion: "narrator_display_bundle_v1",
    source: "turn/intake",
    noMutation: true,
    copyInstruction:
      "Para narrateOnly, escribir escena breve primero y copiar estas lineas de HUD final; no reconstruir numeros ni evento/NPCs.",
    headerLines,
    changeGroups: [
      {
        id: "no_changes",
        title: "Cambios relevantes",
        lines: changeLines,
      },
    ],
    changeLines,
    stateLines,
    alertLines: [],
    renderLines,
  };
}

async function buildNarratorPacket({ text = "", aiClassification = null, gameId = DEFAULT_GAME_ID } = {}) {
  const gameState = await GameState.findOne({ gameId })
    .select("gameId currentDay diegeticDate block time locationId characterId lucasStatus moneyCopper activeEventIds")
    .lean();
  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const route = classifyTurn({ text, aiClassification });
  const locationIds = unique([gameState.locationId]);
  const [location, latestLogs, activeEvents] = await Promise.all([
    Location.findOne({ locationId: gameState.locationId })
      .select("locationId name type regionId parentLocationId dangerLevel visibleNpcIds probableNpcIds tags")
      .lean(),
    EventLog.find({ gameId })
      .select("logId gameId day timeStart timeEnd locationId type summary visibility source tags")
      .sort({ day: -1, timeStart: -1, createdAt: -1 })
      .limit(8)
      .lean(),
    WorldEvent.find({
      gameId,
      eventId: { $in: gameState.activeEventIds || [] },
      status: { $in: ["active", "scheduled"] },
    })
      .select("eventId title status visibility affectedLocationIds")
      .limit(5)
      .lean(),
  ]);
  const parentLocation = location?.parentLocationId
    ? await Location.findOne({ locationId: location.parentLocationId }).select("locationId name").lean()
    : null;
  if (location?.parentLocationId) locationIds.push(location.parentLocationId);

  const latestLog = latestLogs.find((log) => !isTechnicalLog(log)) || null;
  const narrativeLocation = inferNarrativeLocation({ location, parentLocation, latestLog });
  const npcIds = unique([
    ...(location?.visibleNpcIds || []),
    ...(location?.probableNpcIds || []),
  ]);
  const npcs = npcIds.length
    ? await Npc.find({ npcId: { $in: npcIds } })
        .select("npcId name role currentLocationId currentTask availability")
        .lean()
    : [];
  const npcPresence = summarizeNpcPresence(npcs, location, narrativeLocation);
  const visibleEvents = activeEvents.filter((event) => eventVisibleToLucas(event, { locationIds }));
  const displayBundle = buildNoMutationDisplayBundle({
    gameState,
    narrativeLocation,
    npcPresence,
    visibleEvents,
    latestLog,
  });

  return {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    readOnly: true,
    route,
    narratorPacket: {
      schemaVersion: "narrator_packet_minimal_v1",
      packetProfile: "minimal_scene",
      gameId,
      playerText: text,
      state: {
        currentDay: gameState.currentDay,
        diegeticDate: gameState.diegeticDate || {},
        block: gameState.block,
        time: gameState.time,
        locationId: gameState.locationId,
        locationName: location?.name || gameState.locationId,
        narrativeLocation,
        lucasStatus: gameState.lucasStatus || {},
        moneyCopper: gameState.moneyCopper || 0,
      },
      latestVisibleLog: latestLog
        ? {
            logId: latestLog.logId,
            day: latestLog.day,
            timeStart: latestLog.timeStart,
            timeEnd: latestLog.timeEnd || "",
            locationId: latestLog.locationId || "",
            type: latestLog.type,
            summary: latestLog.summary,
          }
        : null,
      npcPresence,
      visibleEvents: visibleEvents.map((event) => ({
        eventId: event.eventId,
        title: event.title,
        status: event.status,
        visibility: event.visibility,
      })),
      hiddenEventCount: Math.max(0, activeEvents.length - visibleEvents.length),
      immediateTensions: [
        Number(gameState.lucasStatus?.energy?.current) <= 25 ? "cansancio serio: debe sentirse en ritmo, postura y decision" : "",
        Number(gameState.lucasStatus?.satiety?.current) <= 45 ? "hambre relevante: no ignorar si la escena se alarga" : "",
        npcPresence.offscreenHint,
      ].filter(Boolean),
      narrationBoundaries: buildNarrationBoundaries({
        route,
        narrativeLocation,
        visibleEvents,
        latestLog,
      }),
      displayBundle,
    },
  };
}

module.exports = {
  SCHEMA_VERSION,
  buildNarratorPacket,
  classifyTurn,
};
