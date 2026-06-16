const GameState = require("../models/GameState");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const KnowledgeRecord = require("../models/KnowledgeRecord");
const EventLog = require("../models/EventLog");
const WorldEvent = require("../models/WorldEvent");
const { relationshipBand } = require("./socialLedgerService");
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

function truncateText(value = "", maxLength = 180) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

function textMatchesAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function inferDomains(text) {
  const domains = [];
  const checks = [
    ["magic", /\b(magia|mana|hechizo|conjur|electric|rayo|chispa|medita|aqua)\b/],
    ["social", /\b(habla|charla|conversa|bromea|comenta|comentario|responde|dile|dice|pregunta|pide|saluda|agradece|disculpa|yara|fern|roberto|nia|eddan|garrick|mara|sael|doran)\b/],
    [
      "travel",
      /\b(viaja|camina|corre|vuelve|regresa|sale|entra|sube|baja|va\s+(al|a la|hacia)|ir\s+(al|a la|hacia)|ruta|camino|sendero)\b/,
    ],
    ["work", /\b(trabaja|turno|tardanza|contrato|servir|mesa|platos|jornada|asistencia|llegada tarde)\b/],
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

function isSimpleSocialText(text) {
  if (
    !textMatchesAny(text, [
      /\b(habla|charla|conversa|bromea|saluda|agradece|disculpa|dice|pregunta|comenta|comentario|responde)\b/,
      /\ble hace un comentario\b/,
    ])
  ) {
    return false;
  }

  return !textMatchesAny(text, [
    /\b(permiso|autoriza|autorizar|negocia|convenc|promete|promesa|cita|secreto|confiesa|romance|besar|beso|amor)\b/,
    /\b(amenaza|intimida|presiona|chantaje|acusa|denuncia|miente|roba)\b/,
    /\b(mision|recompensa|reporte|prueba|evidencia|muestra|pista|cartelera|gremio)\b/,
    /\b(compra|vende|paga|precio|stock|dinero|moneda|cobre|plata|oro|presta)\b/,
    /\b(magia|mana|hechizo|conjura|rayo|electric|entrena|practica|combate|herida|cura)\b/,
    /\b(turno|tardanza|contrato|trabajo|trabaja|jornada)\b/,
    /\bpide\b(?!\s+disculpas?\b)/,
  ]);
}

function classifyTurn({ text = "", aiClassification = null } = {}) {
  const normalized = normalizeText(text);
  const aiDomains = asArray(aiClassification?.domains).map((domain) => String(domain || "").trim()).filter(Boolean);
  const domains = unique([...inferDomains(normalized), ...aiDomains]);
  const mechanicalDomains = domains.filter((domain) => domain !== "scene");

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
    /\b(lucas )?(se queda )?(mirando|observando|escuchando|mira|observa|escucha)\b.*\b(alrededor|entorno|cuarto|habitacion|sala|lugar|puerta|ventana)\b/,
    /\b(echa|hecha) un vistazo\b/,
    /^pensar$/,
    /^lucas piensa$/,
  ]);

  const likelyMutation = textMatchesAny(normalized, [
    /\b(trabaja|entrena|practica|corre|viaja|camina|vuelve|regresa|sale|entra|sube|baja|va\s+(al|a la|hacia)|ir\s+(al|a la|hacia)|descansa|duerme|come|bebe|compra|vende|paga|toma|agarra|usa|ataca|conjura|lanza|acepta|rechaza|reporta|completa|investiga|revisa)\b/,
  ]);
  const likelySocial =
    domains.includes("social") &&
    /\b(habla|charla|conversa|bromea|dice|pregunta|saluda|agradece|disculpa|pide|comenta|comentario|responde)\b/.test(
      normalized
    );

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
    if (isSimpleSocialText(normalized)) {
      return {
        intent: "social_scene",
        domains: unique(["social", ...domains]),
        needsMutation: false,
        suggestedOperation: "narrateOnly",
        supported: true,
        confidence: "medium",
      };
    }

    return {
      intent: "social",
      domains: unique(["social", ...domains]),
      needsMutation: false,
      suggestedOperation: "getCompactContext",
      supported: false,
      confidence: "medium",
      fallbackReason: "Social complejo o con posible consecuencia; usar flujo social existente.",
    };
  }

  if (!likelyMutation && mechanicalDomains.length === 0) {
    return {
      intent: observeOnly ? "observe_scene" : "continue_scene",
      domains: domains.length ? domains : ["scene"],
      needsMutation: false,
      suggestedOperation: "narrateOnly",
      supported: true,
      confidence: aiClassification?.needsMutation === false ? "high" : "medium",
    };
  }

  if (likelyMutation || mechanicalDomains.length > 0) {
    return {
      intent: mechanicalDomains.length > 1 ? "compound" : mechanicalDomains[0] || "player_action",
      domains: domains.length ? domains : ["scene"],
      needsMutation: true,
      suggestedOperation: "resolveTurn_or_existing_flow",
      supported: false,
      confidence: "medium",
      fallbackReason: "La ruta rapida read-only no cubre esta accion; usar resolver o flujo existente.",
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

function actorHintsFromClassification(aiClassification = null) {
  return unique([
    ...asArray(aiClassification?.targetNpcIds),
    aiClassification?.targetNpcId,
    ...asArray(aiClassification?.actors),
    ...asArray(aiClassification?.actorNames),
  ].map((value) => String(value || "").trim()));
}

function npcNameMatchesText(npc = {}, text = "", hints = []) {
  const normalizedText = normalizeText(text);
  const normalizedHints = hints.map(normalizeText);
  const id = String(npc.npcId || "");
  const name = String(npc.name || "");
  const normalizedName = normalizeText(name);
  const firstName = normalizeText(name.split(/\s+/)[0] || "");

  if (normalizedHints.includes(normalizeText(id))) return true;
  if (normalizedHints.includes(normalizedName)) return true;
  if (firstName && normalizedHints.includes(firstName)) return true;
  if (normalizedName && normalizedText.includes(normalizedName)) return true;
  return Boolean(firstName && firstName.length >= 3 && normalizedText.includes(firstName));
}

function selectTargetNpc({ npcs = [], text = "", aiClassification = null } = {}) {
  const hints = actorHintsFromClassification(aiClassification);
  return [...npcs]
    .sort((left, right) => String(right.name || "").length - String(left.name || "").length)
    .find((npc) => npcNameMatchesText(npc, text, hints)) || null;
}

function relationshipSummary(relationship = {}) {
  const fields = ["trust", "familiarity", "affection", "suspicion", "respect", "fear", "jealousy", "socialDebt"];
  return Object.fromEntries(
    fields.map((field) => {
      const value = Number(relationship[field]) || 0;
      return [
        field,
        {
          value,
          band: field === "socialDebt" ? null : relationshipBand(value),
        },
      ];
    })
  );
}

function compactNpcSocialProfile(npc = {}) {
  const socialProfile = npc.socialProfile || {};
  const emotionalProfile = npc.emotionalProfile || {};
  const director = npc.flags?.dialogueDirector || null;

  return {
    npcId: npc.npcId,
    name: npc.name,
    role: npc.role || "",
    currentTask: truncateText(npc.currentTask || "", 120),
    availability: npc.availability || {},
    relationship: relationshipSummary(npc.relationshipWithLucas || {}),
    voice: {
      speechStyle: truncateText(npc.speechStyle || "", 140),
      personality: (npc.personality || []).slice(0, 5),
      values: (npc.values || []).slice(0, 4),
      tolerates: (npc.tolerates || []).slice(0, 3),
      rejects: (npc.rejects || []).slice(0, 3),
      boundaries: (socialProfile.boundaries || []).slice(0, 4),
    },
    emotional: {
      defaultMood: truncateText(emotionalProfile.defaultMood || "", 100),
      coreDrives: (emotionalProfile.coreDrives || []).slice(0, 2),
      coreFears: (emotionalProfile.coreFears || []).slice(0, 2),
      visibleTells: (emotionalProfile.visibleTells || []).slice(0, 3),
      contradiction: truncateText(emotionalProfile.contradiction || "", 140),
      sceneHooks: (emotionalProfile.sceneHooks || []).slice(0, 2),
      rule: "No narrar mente privada; usar gesto, pausa, objeto, tarea o tono.",
    },
    dialogueDirector: director
      ? {
          cadence: truncateText(director.cadence || "", 90),
          emotionalRule: truncateText(director.emotionalRule || "", 110),
          reactFirst: truncateText(director.reactFirst || "", 100),
          sampleBeats: (director.sampleBeats || []).slice(0, 2).map((line) => truncateText(line, 100)),
          avoid: (director.avoid || []).slice(0, 2).map((line) => truncateText(line, 90)),
        }
      : null,
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

function latestLogTouchesCurrentMoment(latestLog = null, gameState = null) {
  if (!latestLog || !gameState) return false;
  if (Number(latestLog.day) !== Number(gameState.currentDay)) return false;
  const currentTime = String(gameState.time || "");
  return Boolean(currentTime && (latestLog.timeEnd === currentTime || latestLog.timeStart === currentTime));
}

function inferNarrativeLocation({ location = null, parentLocation = null, latestLog = null, gameState = null } = {}) {
  const locationName = location?.name || location?.locationId || "?";
  const summary = normalizeText(latestLog?.summary || "");
  const locationText = normalizeText(
    `${location?.name || ""} ${location?.type || ""} ${(location?.tags || []).join(" ")} ${location?.locationId || ""}`
  );
  const isInn = /grulla|posada|inn|tavern/.test(locationText);
  const roomMention = /\b(cuarto|habitacion|cama|sube a su cuarto|en su cuarto)\b/.test(summary);
  const movedOutOfRoom = /\b(baja desde su cuarto|bajo desde su cuarto|baja de su cuarto|bajo de su cuarto|sale de su cuarto|salio de su cuarto|sale del cuarto|salio del cuarto|baja a la sala|bajo a la sala|baja al comedor|bajo al comedor|baja a la cocina|bajo a la cocina|vuelve a la sala|volvio a la sala|vuelve al comedor|volvio al comedor)\b/.test(summary);
  const logIsCurrent = latestLogTouchesCurrentMoment(latestLog, gameState);

  if (isInn && roomMention && logIsCurrent && !movedOutOfRoom) {
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

function composePresenceLine(visible = [], nearby = []) {
  const visibleNames = visible.map((npc) => npc.name || npc.npcId);
  const nearbyNames = nearby.map((npc) => npc.name || npc.npcId);
  return visibleNames.length && nearbyNames.length
    ? `${visibleNames.join(", ")}; cerca/probables: ${nearbyNames.join(", ")}`
    : visibleNames.length
      ? visibleNames.join(", ")
      : nearbyNames.length
        ? `cerca/probables: ${nearbyNames.join(", ")}`
        : "ninguno visible";
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

  return {
    visible,
    nearby,
    line: composePresenceLine(visible, nearby),
    offscreenHint: "",
  };
}

function includeSocialTargetInPresence(npcPresence = {}, socialPacket = null) {
  const target = socialPacket?.targetNpc;
  if (!target?.npcId) return npcPresence;
  const visible = [...(npcPresence.visible || [])];
  const nearby = [...(npcPresence.nearby || [])];
  const alreadyListed = [...visible, ...nearby].some((npc) => npc.npcId === target.npcId);
  if (!alreadyListed) {
    visible.push({
      npcId: target.npcId,
      name: target.name,
      role: target.role || "",
      currentTask: target.currentTask || "",
      availability: target.availability || {},
    });
  }
  return {
    ...npcPresence,
    visible,
    nearby,
    line: composePresenceLine(visible, nearby),
  };
}

function socialPresenceForTarget(targetNpc = null, npcPresence = {}, location = null, narrativeLocation = null) {
  if (!targetNpc) return { scope: "none", canNarrateDirectly: false, reason: "No se detecto NPC objetivo." };
  if (narrativeLocation?.privacy === "private_room_inferred") {
    return {
      scope: "not_visible_private_room",
      canNarrateDirectly: false,
      reason: "Lucas esta en un cuarto privado inferido; hablar con este NPC requiere nueva accion/traslado.",
    };
  }

  if ((npcPresence.visible || []).some((npc) => npc.npcId === targetNpc.npcId)) {
    return { scope: "visible", canNarrateDirectly: true, reason: "NPC visible en la escena." };
  }
  if (targetNpc.currentLocationId && targetNpc.currentLocationId === location?.locationId) {
    return { scope: "same_location", canNarrateDirectly: true, reason: "NPC ubicado en la misma localizacion." };
  }
  if ((npcPresence.nearby || []).some((npc) => npc.npcId === targetNpc.npcId)) {
    return {
      scope: "nearby_probable",
      canNarrateDirectly: false,
      reason: "NPC cercano/probable, pero no confirmado como interlocutor directo.",
    };
  }

  return {
    scope: "not_present",
    canNarrateDirectly: false,
    reason: "NPC no confirmado como presente en la escena.",
  };
}

function memoryImportanceRank(memory = {}) {
  const ranks = {
    critical: 4,
    important: 3,
    normal: 2,
    minor: 1,
  };
  return ranks[memory.importance] || 0;
}

function sortMemories(left = {}, right = {}) {
  const importanceDiff = memoryImportanceRank(right) - memoryImportanceRank(left);
  if (importanceDiff !== 0) return importanceDiff;
  const dayDiff = (Number(right.createdDay) || 0) - (Number(left.createdDay) || 0);
  if (dayDiff !== 0) return dayDiff;
  return String(right.createdTime || "").localeCompare(String(left.createdTime || ""));
}

async function buildSocialPacket({ gameId, text, targetNpc, targetPresence }) {
  if (!targetNpc || !targetPresence.canNarrateDirectly) return null;

  const [memories, knowledgeRecords] = await Promise.all([
    NpcMemory.find({ npcId: targetNpc.npcId })
      .select("memoryId npcId fact summary sourceType certainty emotionalWeight privacyLevel canShare createdDay createdTime importance tags")
      .sort({ createdDay: -1, createdTime: -1 })
      .limit(8)
      .lean(),
    KnowledgeRecord.find({
      gameId,
      holderNpcIds: targetNpc.npcId,
      status: "active",
      visibility: { $ne: "mechanical_only" },
    })
      .select("knowledgeId subjectType subjectId factKey fact summary sourceType certainty visibility canShare createdDay createdTime tags")
      .sort({ createdDay: -1, createdTime: -1 })
      .limit(6)
      .lean(),
  ]);

  return {
    schemaVersion: "social_packet_v1",
    mode: "read_only_simple_social",
    playerText: text,
    targetNpc: compactNpcSocialProfile(targetNpc),
    targetPresence,
    relevantMemories: memories.sort(sortMemories).slice(0, 3).map((memory) => ({
      memoryId: memory.memoryId,
      summary: truncateText(memory.summary || memory.fact || "", 180),
      sourceType: memory.sourceType,
      certainty: memory.certainty,
      emotionalWeight: memory.emotionalWeight,
      privacyLevel: memory.privacyLevel,
      canShare: Boolean(memory.canShare),
      importance: memory.importance,
    })),
    knowledgeContext: {
      shareable: knowledgeRecords
        .filter((record) => record.canShare)
        .slice(0, 3)
        .map((record) => ({
          knowledgeId: record.knowledgeId,
          factKey: record.factKey,
          summary: truncateText(record.summary || record.fact || "", 160),
          certainty: record.certainty,
          visibility: record.visibility,
        })),
      nonShareableCount: knowledgeRecords.filter((record) => !record.canShare).length,
      rule: "No revelar knowledge/memories con canShare=false; usarlas solo como limite de tono si corresponde.",
    },
    sceneGuidance: [
      "Resolver como charla breve sin deltas numericos ni memoria nueva.",
      "NPC responde primero al tono visible de Lucas y despues al contenido.",
      "Usar tarea actual, objeto, pausa, gesto o cansancio; no respuesta generica.",
      "Si la charla busca permiso, promesa, secreto, informacion sensible o cambio social, este packet no alcanza.",
    ],
    mutationBoundary:
      "No modificar confianza, memoria, compromisos, trabajo, dinero, inventario ni tiempo desde social_packet.",
  };
}

function buildNarrationBoundaries({ route, narrativeLocation, visibleEvents = [], latestLog = null, socialPacket = null } = {}) {
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
  if (socialPacket) {
    boundaries.push("Charla social simple: no aplicar deltas, promesas, permisos ni memoria persistente.");
    boundaries.push("Usar socialPacket.targetNpc voz/relacion/conocimiento; no inventar secretos ni informacion no compartible.");
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

  let route = classifyTurn({ text, aiClassification });
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
  const narrativeLocation = inferNarrativeLocation({ location, parentLocation, latestLog, gameState });
  const npcIds = unique([
    ...(location?.visibleNpcIds || []),
    ...(location?.probableNpcIds || []),
  ]);
  const npcQuery = location
    ? {
        $or: [
          { npcId: { $in: npcIds } },
          { currentLocationId: { $in: locationIds } },
        ],
      }
    : { npcId: { $in: npcIds } };
  const npcs = npcIds.length || location
    ? await Npc.find(npcQuery)
        .select(
          "npcId name role currentLocationId currentTask availability personality speechStyle values tolerates rejects relationshipWithLucas socialProfile emotionalProfile flags.dialogueDirector"
        )
        .limit(16)
        .lean()
    : [];
  let npcPresence = summarizeNpcPresence(npcs, location, narrativeLocation);
  const visibleEvents = activeEvents.filter((event) => eventVisibleToLucas(event, { locationIds }));
  let socialPacket = null;
  if (route.intent === "social_scene") {
    const targetNpc = selectTargetNpc({ npcs, text, aiClassification });
    const targetPresence = socialPresenceForTarget(targetNpc, npcPresence, location, narrativeLocation);
    socialPacket = await buildSocialPacket({ gameId, text, targetNpc, targetPresence });
    if (!socialPacket) {
      route = {
        ...route,
        supported: false,
        suggestedOperation: "getCompactContext",
        fallbackReason: targetPresence.reason || "No se pudo construir socialPacket seguro.",
      };
    }
  }
  npcPresence = includeSocialTargetInPresence(npcPresence, socialPacket);
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
      packetProfile: socialPacket ? "social_scene" : "minimal_scene",
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
        socialPacket,
      }),
      ...(socialPacket ? { socialPacket } : {}),
      displayBundle,
    },
  };
}

module.exports = {
  SCHEMA_VERSION,
  buildNarratorPacket,
  classifyTurn,
};
