const DEFAULT_DESTINATION_ALIASES = [
  {
    locationId: "loc_hoshimori_grulla_azul",
    name: "La Grulla Azul",
    patterns: [/\b(posada|grulla azul|la grulla)\b/],
  },
  {
    locationId: "loc_hoshimori_guild",
    name: "Gremio local de Hoshimori",
    patterns: [/\b(gremio|guild)\b/],
  },
  {
    locationId: "loc_hoshimori_guild_patio",
    name: "Patio del gremio",
    patterns: [/\b(patio del gremio|patio gremio)\b/],
  },
  {
    locationId: "loc_hoshimori_forest_whispers_edge",
    name: "Bosque de los Susurros - borde",
    patterns: [/\b(borde del bosque|bosque de los susurros|bosque)\b/],
  },
  {
    locationId: "loc_hoshimori_market",
    name: "Mercado de Hoshimori",
    patterns: [/\b(mercado)\b/],
  },
  {
    locationId: "loc_hoshimori_plaza",
    name: "Plaza de Hoshimori",
    patterns: [/\b(plaza)\b/],
  },
  {
    locationId: "loc_hoshimori_temple_serene_flame",
    name: "Templo de la Llama Serena",
    patterns: [/\b(templo|llama serena)\b/],
  },
];

const CAPABILITY_CATALOG = {
  continue_scene: {
    domain: "scene",
    status: "supported_engine",
    risk: "none",
    impactLevel: 0,
    executor: "narrateOnly",
    decision: "narrateOnly",
  },
  observe_location: {
    domain: "observation",
    status: "supported_engine",
    risk: "none",
    impactLevel: 0,
    executor: "narrateOnly",
    decision: "narrateOnly",
  },
  social_microtalk: {
    domain: "social",
    status: "supported_engine",
    risk: "social_low",
    impactLevel: 1,
    executor: "narrateOnly",
    decision: "narrateOnly",
  },
  ask_npc_routine: {
    domain: "social",
    status: "supported_engine",
    risk: "social_low",
    impactLevel: 1,
    executor: "narrateOnly",
    decision: "narrateOnly",
  },
  ask_npc_work_pattern: {
    domain: "social",
    status: "supported_engine",
    risk: "social_low",
    impactLevel: 1,
    executor: "narrateOnly",
    decision: "narrateOnly",
  },
  ask_npc_current_task: {
    domain: "social",
    status: "supported_engine",
    risk: "social_low",
    impactLevel: 1,
    executor: "narrateOnly",
    decision: "narrateOnly",
  },
  social_complex: {
    domain: "social",
    status: "clarify_or_existing_flow",
    risk: "social_medium",
    impactLevel: 2,
    executor: "getCompactContext",
    decision: "fallback",
  },
  common_sequence: {
    domain: "time_activity",
    status: "supported_engine",
    risk: "low",
    impactLevel: 2,
    executor: "resolveTurn",
    decision: "resolver_candidate",
  },
  work_segment: {
    domain: "work",
    status: "supported_engine",
    risk: "medium",
    impactLevel: 2,
    executor: "resolveTurn",
    decision: "resolver_candidate",
  },
  complete_job_shift: {
    domain: "work",
    status: "supported_engine",
    risk: "medium",
    impactLevel: 3,
    executor: "completeJobShift",
    decision: "action_candidate",
  },
  travel_to_location: {
    domain: "travel",
    status: "supported_engine",
    risk: "low",
    impactLevel: 2,
    executor: "resolveTurn",
    decision: "resolver_candidate",
  },
  rest_duration: {
    domain: "rest_biology",
    status: "supported_engine",
    risk: "low",
    impactLevel: 1,
    executor: "resolveTurn",
    decision: "resolver_candidate",
  },
  sleep_until_time: {
    domain: "rest_biology",
    status: "supported_engine",
    risk: "low",
    impactLevel: 2,
    executor: "resolveTurn",
    decision: "resolver_candidate",
  },
  wait_duration: {
    domain: "time_activity",
    status: "supported_engine",
    risk: "low",
    impactLevel: 1,
    executor: "resolveTurn",
    decision: "resolver_candidate",
  },
  wait_until_time: {
    domain: "time_activity",
    status: "supported_engine",
    risk: "low",
    impactLevel: 1,
    executor: "resolveTurn",
    decision: "resolver_candidate",
  },
  internal_positioning: {
    domain: "scene",
    status: "limited_support",
    risk: "low",
    impactLevel: 1,
    executor: "narrateOnly_or_resolveTurn_if_timed",
    decision: "contextual",
  },
  magic_practice: {
    domain: "magic",
    status: "existing_flow",
    risk: "medium",
    impactLevel: 3,
    executor: "applyTurn",
    decision: "existing_flow",
  },
  safe_magic_practice: {
    domain: "magic",
    status: "supported_engine",
    risk: "low",
    impactLevel: 3,
    executor: "applyTurn",
    decision: "action_candidate",
  },
  economy_transaction: {
    domain: "economy",
    status: "existing_flow",
    risk: "medium",
    impactLevel: 3,
    executor: "economy_or_applyTurn",
    decision: "existing_flow",
  },
  simple_meal_purchase: {
    domain: "economy",
    status: "supported_engine",
    risk: "medium",
    impactLevel: 3,
    executor: "applyTurn",
    decision: "action_candidate",
  },
  mission_event_action: {
    domain: "mission_event",
    status: "existing_flow",
    risk: "medium",
    impactLevel: 3,
    executor: "mission_or_applyTurn",
    decision: "existing_flow",
  },
  combat_action: {
    domain: "combat_injury",
    status: "existing_flow",
    risk: "high",
    impactLevel: 4,
    executor: "combatAction",
    decision: "existing_flow",
  },
  inventory_evidence_action: {
    domain: "inventory_evidence",
    status: "existing_flow",
    risk: "medium",
    impactLevel: 3,
    executor: "applyTurn",
    decision: "existing_flow",
  },
  unsupported_player_action: {
    domain: "unknown",
    status: "clarify_or_existing_flow",
    risk: "medium",
    impactLevel: 2,
    executor: "getCompactContext",
    decision: "fallback",
  },
};

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

function capabilityById(capabilityId) {
  return CAPABILITY_CATALOG[capabilityId] || CAPABILITY_CATALOG.unsupported_player_action;
}

function isQuestionLike(text) {
  return textMatchesAny(text, [
    /\?/,
    /\b(pregunta|decime|decirme|dime|cuentame|contame|a que hora|cuando|que esta|que hace|que cuenta|que estas)\b/,
  ]);
}

function detectSocialQuestionType(text) {
  if (
    textMatchesAny(text, [
      /\b(a que hora|horario|cuando)\b.*\b(empieza|empiezas|arranca|arrancas|trabaja|trabajas|abre|llega)\b/,
      /\b(si tuvieras que decirme un horario|si tienes que decirme un horario|si tenes que decirme un horario)\b/,
    ])
  ) {
    return "routine_schedule";
  }
  if (textMatchesAny(text, [/\b(si siempre trabaja|trabaja hasta tan tarde|hasta tan tarde)\b/])) {
    return "work_pattern";
  }
  if (
    textMatchesAny(text, [
      /\b(que esta haciendo|que estas haciendo|que hace|que cuenta|que esta contando|que estas contando|que contando)\b/,
      /\b(queda mucho por cerrar|queda mucho|cuanto falta por cerrar)\b/,
    ])
  ) {
    return "current_task";
  }
  return isQuestionLike(text) ? "social_question" : "";
}

function isReadOnlyNpcTaskQuestion(text) {
  return ["routine_schedule", "work_pattern", "current_task"].includes(detectSocialQuestionType(text));
}

function inferDomains(text) {
  const domains = [];
  const checks = [
    ["magic", /\b(magia|mana|hechizo|conjur|electric|electrica|electrico|descarga|rayo|chispa|medita|aqua)\b/],
    [
      "social",
      /\b(habla|charla|conversa|bromea|comenta|comentario|responde|dile|dice|decime|decirme|dime|cuentame|contame|pregunta|pide|saluda|agradece|disculpa|a que hora|horario|yara|fern|roberto|nia|eddan|garrick|mara|sael|doran|joren)\b/,
    ],
    [
      "travel",
      /\b(viaja|camina|corre|vuelve|regresa|sale|entra|sube|baja|va\s+(al|a la|hacia)|ir\s+(al|a la|hacia)|ruta|camino|sendero)\b/,
    ],
    ["work", /\b(trabaja|turno|tardanza|contrato|servir|mesa|platos|jornada|asistencia|llegada tarde)\b/],
    ["time_activity", /\b(espera|esperar|aguarda|aguardar)\b/],
    ["rest_biology", /\b(descansa|duerme|dormir|come|comer|bebe|beber|hambre|cansancio|energia|saciedad|cama|se acuesta)\b/],
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
      /\b(decime|decirme|dime|cuentame|contame)\b/,
      /\ble hace un comentario\b/,
      /\b(a que hora|horario)\b/,
    ])
  ) {
    return false;
  }

  const asksAboutNpcTask = isReadOnlyNpcTaskQuestion(text);

  const complexPatterns = [
    /\b(permiso|autoriza|autorizar|negocia|convenc|promete|promesa|cita|secreto|confiesa|romance|besar|beso|amor)\b/,
    /\b(amenaza|intimida|presiona|chantaje|acusa|denuncia|miente|roba)\b/,
    /\b(mision|recompensa|reporte|prueba|evidencia|muestra|pista|cartelera|gremio)\b/,
    /\b(compra|vende|paga|precio|stock|dinero|moneda|cobre|plata|oro|presta)\b/,
    /\b(magia|mana|hechizo|conjura|rayo|electric|entrena|practica|combate|herida|cura)\b/,
    /\bpide\b(?!\s+disculpas?\b)/,
  ];
  if (!asksAboutNpcTask) {
    complexPatterns.push(/\b(turno|tardanza|contrato|trabajo|trabaja|jornada)\b/);
  }

  return !textMatchesAny(text, complexPatterns);
}

function extractDurations(text = "") {
  const durations = [];
  const pushMatches = (pattern, toMinutes) => {
    for (const match of text.matchAll(pattern)) {
      const minutes = toMinutes(match);
      if (Number.isInteger(minutes) && minutes > 0) {
        durations.push({
          index: match.index,
          text: match[0],
          minutes,
        });
      }
    }
  };

  pushMatches(/\b(\d{1,3})\s*(minutos?|mins?|m)\b/g, (match) => Number(match[1]));
  pushMatches(/\b(\d{1,2})\s*(horas?|hs?|h)\b/g, (match) => Number(match[1]) * 60);

  const wordDurations = [
    ["cinco minutos", 5],
    ["diez minutos", 10],
    ["quince minutos", 15],
    ["veinte minutos", 20],
    ["treinta minutos", 30],
    ["cuarenta minutos", 40],
    ["cuarenta y cinco minutos", 45],
    ["media hora", 30],
    ["un cuarto de hora", 15],
    ["una hora", 60],
    ["un hora", 60],
    ["dos horas", 120],
    ["tres horas", 180],
  ];

  for (const [phrase, minutes] of wordDurations) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pushMatches(new RegExp(`\\b${escaped}\\b`, "g"), () => minutes);
  }

  return durations.sort((left, right) => left.index - right.index);
}

function durationNear(text = "", cueIndex = -1, { maxDistance = 96 } = {}) {
  const durations = extractDurations(text);
  if (durations.length === 0) return null;
  if (cueIndex < 0) return durations[0];
  return (
    durations.find(
      (duration) =>
        duration.index >= cueIndex - 64 &&
        duration.index <= cueIndex + maxDistance
    ) || null
  );
}

function durationAfter(text = "", cueIndex = -1, { maxDistance = 140 } = {}) {
  const durations = extractDurations(text);
  if (durations.length === 0) return null;
  if (cueIndex < 0) return durations[0];
  return (
    durations.find(
      (duration) =>
        duration.index >= cueIndex &&
        duration.index <= cueIndex + maxDistance
    ) || null
  );
}

function clockFromText(text = "") {
  const match = String(text || "").match(/\b(?:hasta\s+)?(?:las\s+)?(\d{1,2})(?::(\d{2}))?\b/);
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = match[2] == null ? 0 : Number(match[2]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return "";
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return "";
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function clockNear(text = "", cueIndex = -1) {
  const slice = cueIndex >= 0 ? text.slice(cueIndex, cueIndex + 120) : text;
  return clockFromText(slice);
}

function regexIndex(text = "", pattern) {
  const match = pattern.exec(text);
  if (!match) return -1;
  return match.index;
}

function detectRestCategory(text = "", cueIndex = -1) {
  const slice = cueIndex >= 0 ? text.slice(Math.max(0, cueIndex - 30), cueIndex + 120) : text;
  if (/\b(acostad|cama|duerme|dormir|dormia|siesta)\b/.test(slice)) return "descanso_acostado";
  return "descanso_sentado";
}

function detectDestination(text = "", aliases = DEFAULT_DESTINATION_ALIASES) {
  for (const destination of aliases) {
    if (destination.patterns.some((pattern) => pattern.test(text))) {
      return destination;
    }
  }
  return null;
}

function detectTravelPace(text = "", cueIndex = -1) {
  const slice = cueIndex >= 0 ? text.slice(Math.max(0, cueIndex - 40), cueIndex + 120) : text;
  if (/\b(a toda velocidad|sprint|maxima velocidad|lo mas rapido)\b/.test(slice)) return "full_speed";
  if (/\b(corre|corriendo|correr)\b/.test(slice)) return "run";
  if (/\b(rapido|rapidamente|apuro|prisa)\b/.test(slice)) return "hurry";
  if (/\b(cuidado|cautela|despacio)\b/.test(slice)) return "careful";
  return "walk";
}

function isInternalMovement(text = "", cueIndex = -1) {
  const slice = cueIndex >= 0 ? text.slice(Math.max(0, cueIndex - 30), cueIndex + 140) : text;
  return /\b(cuarto|habitacion|cama|escalera|sala|comedor|cocina|barra|mesa)\b/.test(slice);
}

function detectCompleteJobShiftPlan(text = "") {
  if (
    !textMatchesAny(text, [
      /\b(trabaja|trabajar|turno|jornada)\b.*\b(hasta|al)\b.*\b(cierre|cerrar|fin del turno|terminar el turno|termina el turno)\b/,
      /\b(cierra|cerrar|termina|terminar|completa|completar)\b.*\b(turno|jornada)\b/,
      /\b(hasta la hora de cierre|hasta cerrar|hasta que cierre)\b/,
    ])
  ) {
    return null;
  }

  return {
    consumeContractMeal: /\b(comida|plato|cena)\b.*\b(contrato|incluida|incluido)\b/.test(text),
    allowLateCompletion: /\b(tarde|tardanza|llego tarde|llega tarde)\b/.test(text),
  };
}

function detectSimpleMealPurchasePlan(text = "") {
  if (/\b(contrato|incluida|incluido|racion|mochila|inventario)\b/.test(text)) return null;
  if (!/\b(compra|comprar|pide|pedir|come|comer|plato|comida|sopa)\b/.test(text)) return null;

  if (/\b(sopa)\b/.test(text)) {
    return {
      shopId: "shop_grulla_azul_inn",
      itemId: "item_sopa_simple",
      minutes: durationAfter(text, regexIndex(text, /\b(sopa|come|comer|pide|pedir)\b/))?.minutes || 20,
    };
  }

  if (/\b(comida normal|plato normal|plato|comida)\b/.test(text)) {
    return {
      shopId: "shop_grulla_azul_inn",
      itemId: "item_comida_normal",
      minutes: durationAfter(text, regexIndex(text, /\b(comida|plato|come|comer|pide|pedir)\b/))?.minutes || 20,
    };
  }

  return null;
}

function detectSafeMagicPracticePlan(text = "") {
  if (!/\b(magia|mana|medita|meditacion|respiracion|flujo interno|sentir flujo|percibir flujo|practica)\b/.test(text)) {
    return null;
  }
  if (/\b(rayo|electric|chispa|descarga|ofensiv|ataque|conjura|lanza|fuego|hielo|cura|curar|herida)\b/.test(text)) {
    return null;
  }

  const magicCue = regexIndex(text, /\b(medita|meditacion|respiracion|flujo interno|sentir flujo|percibir flujo|practica)\b/);
  let techniqueId = "";
  if (/\b(meditacion|medita)\b.*\b(mana)\b|\b(mana)\b.*\b(meditacion|medita)\b/.test(text)) {
    techniqueId = "technique_mana_meditation_basic";
  } else if (/\b(respiracion|respira)\b.*\b(mana)\b|\b(mana)\b.*\b(respiracion|respira)\b/.test(text)) {
    techniqueId = "technique_mana_breathing_basic";
  } else if (/\b(flujo interno|sentir flujo|percibir flujo)\b/.test(text)) {
    techniqueId = "technique_internal_flow_sense";
  }
  if (!techniqueId) return null;

  const magicDuration = durationAfter(text, magicCue);
  const restCue = regexIndex(text, /\b(descansa|descansar|se sienta|sentado|se acuesta|acostado)\b/);
  const restDuration = restCue >= 0 && restCue < magicCue ? durationNear(text, restCue, { maxDistance: 60 }) : null;

  return {
    techniqueId,
    minutes: magicDuration?.minutes || null,
    precedingRestMinutes:
      restDuration && (!magicDuration || restDuration.index !== magicDuration.index)
        ? restDuration.minutes
        : null,
  };
}

function commonResolverPlan({ text = "", destinationAliases = DEFAULT_DESTINATION_ALIASES } = {}) {
  const normalized = normalizeText(text);
  const cues = [];
  const addCue = (kind, pattern) => {
    const index = regexIndex(normalized, pattern);
    if (index >= 0) cues.push({ kind, index });
  };

  addCue("sleep_until", /\b(duerme|dormir|se acuesta|acostarse)\b.*\bhasta\b/);
  addCue("wait_until", /\b(espera|esperar|aguarda)\b.*\bhasta\b/);
  addCue("rest", /\b(descansa|descansar|se sienta|sentado|se acuesta|acostado|duerme|dormir)\b/);
  addCue("wait", /\b(espera|esperar|aguarda)\b/);
  addCue("work_segment", /\b(trabaja|trabajar|sirve mesas|servir mesas|atiende mesas|limpia mesas|ayuda a cerrar|ordena mesas)\b/);
  addCue("travel", /\b(vuelve|regresa|va\s+(al|a la|hacia)|ir\s+(al|a la|hacia)|camina|corre|sale hacia|entra en)\b/);

  const steps = [];
  const unsupportedReasons = [];

  for (const cue of cues.sort((left, right) => left.index - right.index)) {
    if (cue.kind === "sleep_until") {
      const targetTime = clockNear(normalized, cue.index);
      if (!targetTime) {
        unsupportedReasons.push("sleep_until sin hora objetivo clara");
        continue;
      }
      steps.push({
        type: "rest",
        category: "descanso_acostado",
        targetTime,
        reason: "Dormir hasta una hora concreta indicada por el jugador.",
        capabilityId: "sleep_until_time",
      });
      continue;
    }

    if (cue.kind === "wait_until") {
      const targetTime = clockNear(normalized, cue.index);
      if (!targetTime) {
        unsupportedReasons.push("wait_until sin hora objetivo clara");
        continue;
      }
      steps.push({
        type: "wait",
        category: "actividad_normal",
        targetTime,
        reason: "Esperar hasta una hora concreta indicada por el jugador.",
        capabilityId: "wait_until_time",
      });
      continue;
    }

    if (cue.kind === "rest") {
      const duration = durationNear(normalized, cue.index);
      if (!duration) {
        if (steps.some((step) => step.type === "rest" && step.targetTime)) continue;
        unsupportedReasons.push("rest sin duracion explicita");
        continue;
      }
      steps.push({
        type: "rest",
        minutes: duration.minutes,
        category: detectRestCategory(normalized, cue.index),
        reason: "Descanso indicado por el jugador.",
        capabilityId: "rest_duration",
      });
      continue;
    }

    if (cue.kind === "wait") {
      const duration = durationNear(normalized, cue.index);
      if (!duration) {
        if (steps.some((step) => step.type === "wait" && step.targetTime)) continue;
        unsupportedReasons.push("wait sin duracion explicita");
        continue;
      }
      steps.push({
        type: "wait",
        minutes: duration.minutes,
        category: "actividad_normal",
        reason: "Espera indicada por el jugador.",
        capabilityId: "wait_duration",
      });
      continue;
    }

    if (cue.kind === "work_segment") {
      const duration = durationNear(normalized, cue.index);
      if (!duration) {
        unsupportedReasons.push("work_segment sin duracion explicita");
        continue;
      }
      steps.push({
        type: "work_segment",
        minutes: duration.minutes,
        intensity: /\b(fuerte|intenso|intensidad alta)\b/.test(normalized)
          ? "strong"
          : /\b(suave|ligero|tranquilo|intensidad baja)\b/.test(normalized)
            ? "light"
            : "normal",
        reason: "Trabajo parcial indicado por el jugador.",
        capabilityId: "work_segment",
      });
      continue;
    }

    if (cue.kind === "travel") {
      const destination = detectDestination(normalized, destinationAliases);
      if (!destination) {
        if (isInternalMovement(normalized, cue.index)) continue;
        unsupportedReasons.push("travel sin destino claro");
        continue;
      }
      steps.push({
        type: "travel",
        toLocationId: destination.locationId,
        destinationName: destination.name,
        pace: detectTravelPace(normalized, cue.index),
        allowMultiSegment: true,
        reason: `Traslado indicado por el jugador hacia ${destination.name}.`,
        capabilityId: "travel_to_location",
      });
    }
  }

  const dedupedSteps = [];
  for (const step of steps) {
    const previous = dedupedSteps[dedupedSteps.length - 1];
    if (
      previous &&
      previous.type === step.type &&
      previous.type === "travel" &&
      previous.toLocationId === step.toLocationId
    ) {
      continue;
    }
    if (
      previous &&
      previous.type === step.type &&
      previous.targetTime &&
      previous.targetTime === step.targetTime
    ) {
      continue;
    }
    dedupedSteps.push(step);
  }

  if (!dedupedSteps.length) {
    return {
      supported: false,
      capabilityId: "",
      steps: [],
      unsupportedReasons,
    };
  }

  const capabilityIds = unique(dedupedSteps.map((step) => step.capabilityId));
  const capabilityId = capabilityIds.length === 1 ? capabilityIds[0] : "common_sequence";
  return {
    supported: unsupportedReasons.length === 0,
    capabilityId,
    steps: dedupedSteps,
    unsupportedReasons,
  };
}

function routeFromCapability({
  capabilityId,
  domains = [],
  intent = "",
  needsMutation = false,
  suggestedOperation = "getCompactContext",
  supported = false,
  confidence = "medium",
  fallbackReason = "",
  slots = {},
  resolverPlan = null,
} = {}) {
  const capability = capabilityById(capabilityId);
  return {
    route: {
      intent,
      domains: unique(domains),
      needsMutation,
      suggestedOperation,
      supported,
      confidence,
      ...(fallbackReason ? { fallbackReason } : {}),
      capabilityId,
      capabilityDomain: capability.domain,
      capabilityStatus: capability.status,
      capabilityRisk: capability.risk,
      capabilityImpactLevel: capability.impactLevel,
      capabilityExecutor: capability.executor,
      capabilityDecision: capability.decision,
      slots,
      ...(resolverPlan ? { resolverPlan } : {}),
    },
    capabilityPacket: {
      schemaVersion: "turn_capability_packet_v1",
      capabilityId,
      domain: capability.domain,
      status: capability.status,
      risk: capability.risk,
      impactLevel: capability.impactLevel,
      executor: capability.executor,
      decision: capability.decision,
      slots,
      ...(resolverPlan ? { resolverPlan } : {}),
    },
  };
}

function routeTurnIntent({ text = "", aiClassification = null } = {}) {
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
    /\b(trabaja|entrena|practica|corre|viaja|camina|vuelve|regresa|sale|entra|sube|baja|va\s+(al|a la|hacia)|ir\s+(al|a la|hacia)|descansa|duerme|dormir|espera|esperar|aguarda|aguardar|come|comer|bebe|beber|compra|vende|paga|pide|pedir|toma|agarra|usa|ataca|intenta|conjura|lanza|lanzar|descarga|acepta|rechaza|reporta|completa|investiga|revisa)\b/,
  ]);
  const likelySocial =
    domains.includes("social") &&
    /\b(habla|charla|conversa|bromea|dice|decime|decirme|dime|cuentame|contame|pregunta|saluda|agradece|disculpa|pide|comenta|comentario|responde|a que hora|horario)\b/.test(
      normalized
    );

  if (continueScene || observeOnly || (!normalized && !likelyMutation)) {
    return routeFromCapability({
      capabilityId: continueScene ? "continue_scene" : "observe_location",
      intent: continueScene ? "continue_scene" : "observe_scene",
      domains: domains.length ? domains : ["scene"],
      needsMutation: false,
      suggestedOperation: "narrateOnly",
      supported: true,
      confidence: continueScene ? "high" : "medium",
    });
  }

  if (
    likelySocial &&
    textMatchesAny(normalized, [
      /\b(permiso|autoriza|autorizar|autorizacion|negocia|convenc|promete|promesa|secreto|confiesa)\b/,
    ])
  ) {
    return routeFromCapability({
      capabilityId: "social_complex",
      intent: "social",
      domains: unique(["social", ...domains]),
      needsMutation: false,
      suggestedOperation: "getCompactContext",
      supported: false,
      confidence: "medium",
      fallbackReason: "Social complejo o con posible consecuencia; usar flujo social existente.",
    });
  }

  const earlySimpleMealPurchasePlan = detectSimpleMealPurchasePlan(normalized);
  if (earlySimpleMealPurchasePlan) {
    return routeFromCapability({
      capabilityId: "simple_meal_purchase",
      intent: "simple_meal_purchase",
      domains: unique(["economy", "rest_biology", ...domains.filter((domain) => !["economy", "rest_biology"].includes(domain))]),
      needsMutation: true,
      suggestedOperation: "applyTurn",
      supported: false,
      confidence: "medium",
      fallbackReason: "Requiere materializar stock, precio e item desde Mongo antes de llamar applyTurn.",
      slots: { simpleMealPurchasePlan: earlySimpleMealPurchasePlan },
    });
  }

  if (likelySocial && (!likelyMutation || isReadOnlyNpcTaskQuestion(normalized))) {
    if (isSimpleSocialText(normalized)) {
      const questionType = detectSocialQuestionType(normalized);
      const capabilityId =
        questionType === "routine_schedule"
          ? "ask_npc_routine"
          : questionType === "work_pattern"
            ? "ask_npc_work_pattern"
            : questionType === "current_task"
              ? "ask_npc_current_task"
              : "social_microtalk";
      const routeDomains = isReadOnlyNpcTaskQuestion(normalized)
        ? domains.filter((domain) => domain !== "work")
        : domains;
      return routeFromCapability({
        capabilityId,
        intent: "social_scene",
        domains: unique(["social", ...routeDomains]),
        needsMutation: false,
        suggestedOperation: "narrateOnly",
        supported: true,
        confidence: "medium",
        slots: questionType ? { questionType } : {},
      });
    }

    return routeFromCapability({
      capabilityId: "social_complex",
      intent: "social",
      domains: unique(["social", ...domains]),
      needsMutation: false,
      suggestedOperation: "getCompactContext",
      supported: false,
      confidence: "medium",
      fallbackReason: "Social complejo o con posible consecuencia; usar flujo social existente.",
    });
  }

  if (!likelyMutation && mechanicalDomains.length === 0) {
    return routeFromCapability({
      capabilityId: observeOnly ? "observe_location" : "continue_scene",
      intent: observeOnly ? "observe_scene" : "continue_scene",
      domains: domains.length ? domains : ["scene"],
      needsMutation: false,
      suggestedOperation: "narrateOnly",
      supported: true,
      confidence: aiClassification?.needsMutation === false ? "high" : "medium",
    });
  }

  if (likelyMutation || mechanicalDomains.length > 0) {
    const completeJobShiftPlan = detectCompleteJobShiftPlan(normalized);
    if (completeJobShiftPlan) {
      return routeFromCapability({
        capabilityId: "complete_job_shift",
        intent: "work_complete_shift",
        domains: unique(["work", ...domains.filter((domain) => domain !== "economy")]),
        needsMutation: true,
        suggestedOperation: "completeJobShift",
        supported: false,
        confidence: "medium",
        fallbackReason: "Requiere materializar contrato/turno activo desde Mongo antes de llamar completeJobShift.",
        slots: { completeJobShiftPlan },
      });
    }

    const safeMagicPracticePlan = detectSafeMagicPracticePlan(normalized);
    if (safeMagicPracticePlan) {
      return routeFromCapability({
        capabilityId: "safe_magic_practice",
        intent: "safe_magic_practice",
        domains: unique(["magic", ...domains.filter((domain) => domain !== "magic")]),
        needsMutation: true,
        suggestedOperation: "applyTurn",
        supported: false,
        confidence: "medium",
        fallbackReason: "Requiere materializar tecnica magica segura y tiempo desde Mongo antes de llamar applyTurn.",
        slots: { safeMagicPracticePlan },
      });
    }

    const resolverPlan = commonResolverPlan({ text: normalized });
    const unsupportedDomain = domains.find((domain) =>
      ["magic", "economy", "inventory_evidence", "combat_injury"].includes(domain)
    );
    const capabilityId = unsupportedDomain
      ? {
          magic: "magic_practice",
          economy: "economy_transaction",
          inventory_evidence: "inventory_evidence_action",
          combat_injury: "combat_action",
        }[unsupportedDomain]
      : resolverPlan.capabilityId || "unsupported_player_action";

    return routeFromCapability({
      capabilityId,
      intent: mechanicalDomains.length > 1 ? "compound" : mechanicalDomains[0] || "player_action",
      domains: domains.length ? domains : ["scene"],
      needsMutation: true,
      suggestedOperation: "resolveTurn_or_existing_flow",
      supported: false,
      confidence: "medium",
      fallbackReason: "La ruta rapida read-only no cubre esta accion; usar resolver o flujo existente.",
      slots: {
        commonResolverCandidate: Boolean(resolverPlan.steps.length),
        unsupportedResolverReasons: resolverPlan.unsupportedReasons,
      },
      resolverPlan: resolverPlan.steps.length ? resolverPlan : null,
    });
  }

  return routeFromCapability({
    capabilityId: "continue_scene",
    intent: "continue_scene",
    domains: ["scene"],
    needsMutation: false,
    suggestedOperation: "narrateOnly",
    supported: true,
    confidence: "low",
  });
}

module.exports = {
  CAPABILITY_CATALOG,
  DEFAULT_DESTINATION_ALIASES,
  clockFromText,
  commonResolverPlan,
  detectDestination,
  detectCompleteJobShiftPlan,
  detectSafeMagicPracticePlan,
  detectSimpleMealPurchasePlan,
  detectSocialQuestionType,
  inferDomains,
  isReadOnlyNpcTaskQuestion,
  normalizeText,
  routeTurnIntent,
};
