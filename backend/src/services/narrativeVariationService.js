const EventLog = require("../models/EventLog");

const SCHEMA_VERSION = "narrative_hints_v2";
const RECENT_WINDOW_DAYS = 5;

const ACTION_FAMILIES = {
  COMBAT: "combat",
  INVESTIGATION: "investigation",
  JOB_SHIFT: "job_shift",
  MAGIC_PRACTICE: "magic_practice",
  MEAL: "meal",
  MISSION: "mission",
  PHYSICAL_TRAINING: "physical_training",
  REST: "rest",
  REPORT: "report",
  SHOPPING: "shopping",
  SOCIAL: "social",
  TRAVEL: "travel",
  GENERAL: "general_action",
};

const FAMILY_LABELS = {
  combat: "combate",
  investigation: "investigacion",
  job_shift: "trabajo",
  magic_practice: "practica magica",
  meal: "comida",
  mission: "mision",
  physical_training: "entrenamiento",
  rest: "descanso",
  report: "reporte",
  shopping: "compra/mercado",
  social: "escena social",
  travel: "viaje",
  general_action: "accion general",
};

const FAMILY_KEYWORDS = [
  {
    family: ACTION_FAMILIES.JOB_SHIFT,
    tags: ["job_shift", "complete_shift", "work_shift"],
    words: ["trabajo", "trabaja", "turno", "jornada", "servicio", "posada", "mesas", "vajilla"],
  },
  {
    family: ACTION_FAMILIES.PHYSICAL_TRAINING,
    tags: ["training", "physical_training", "calisthenics"],
    words: ["entreno", "entrena", "entrenamiento", "calistenia", "flexiones", "sentadillas", "rutina", "agilidad", "resistencia", "fuerza"],
  },
  {
    family: ACTION_FAMILIES.MAGIC_PRACTICE,
    tags: ["magic", "mana", "magic_practice"],
    words: ["magia", "mana", "hechizo", "aqua", "meditacion", "respiracion", "flujo"],
  },
  {
    family: ACTION_FAMILIES.SHOPPING,
    tags: ["shop", "shopping", "market", "economy"],
    words: ["compra", "comprar", "vende", "vender", "tienda", "mercado", "precio", "stock"],
  },
  {
    family: ACTION_FAMILIES.TRAVEL,
    tags: ["travel", "route", "walk"],
    words: ["viaje", "viaja", "camina", "caminar", "ruta", "camino", "vuelve", "regresa", "sale hacia"],
  },
  {
    family: ACTION_FAMILIES.REPORT,
    tags: ["report", "guild_report", "evidence_reported", "testimony"],
    words: ["reporta", "reporte", "informe", "informar", "entrega evidencia", "muestra evidencia", "declara", "testimonio"],
  },
  {
    family: ACTION_FAMILIES.INVESTIGATION,
    tags: ["investigation", "clue", "evidence", "tracks", "search"],
    words: ["investiga", "investigar", "rastros", "huellas", "pista", "evidencia", "muestra", "revisa", "inspecciona", "observa"],
  },
  {
    family: ACTION_FAMILIES.MISSION,
    tags: ["mission", "guild", "quest"],
    words: ["mision", "encargo", "gremio", "cartelera", "reporte", "prueba", "objetivo"],
  },
  {
    family: ACTION_FAMILIES.REST,
    tags: ["rest", "sleep", "nap"],
    words: ["duerme", "dormir", "siesta", "descansa", "descanso", "cama", "sueño"],
  },
  {
    family: ACTION_FAMILIES.MEAL,
    tags: ["meal", "food", "breakfast", "lunch", "dinner"],
    words: ["come", "comer", "cena", "desayuno", "almuerzo", "comida", "plato"],
  },
  {
    family: ACTION_FAMILIES.COMBAT,
    tags: ["combat", "attack", "encounter"],
    words: ["combate", "ataca", "ataque", "enemigo", "herida", "daño", "arma"],
  },
  {
    family: ACTION_FAMILIES.SOCIAL,
    tags: ["social", "conversation", "chat"],
    words: ["habla", "charla", "conversa", "pregunta", "responde", "acompaña", "escucha"],
  },
];

const MICRO_BEATS = {
  job_shift: [
    "centrar la escena en una tarea distinta del turno, no en repetir toda la lista de mesas y vajilla",
    "mostrar el ritmo de la sala por un detalle concreto: una orden breve, un cliente, una correccion o un hueco cubierto",
    "usar un gesto de Roberto, Yara o Fern en vez de otro agradecimiento directo si la ayuda ya se repitio",
    "resumir el turno y elegir solo un momento representativo del servicio",
  ],
  physical_training: [
    "marcar una sensacion corporal nueva: respiracion, estabilidad, coordinacion o fatiga acumulada",
    "no repetir la lista completa de ejercicios si ya se narro una rutina parecida",
    "enfocar el progreso en tecnica, control o limite fisico, no en espectacularidad",
    "usar el clima, la hora o el terreno como variacion concreta del entrenamiento",
  ],
  magic_practice: [
    "mantener la magia como percepcion y control si no hay tecnica validada para efectos visibles",
    "variar la escena por sensaciones internas: pulso de mana, distraccion, respiracion o foco",
    "evitar narrar desbloqueos, daño o hechizos nuevos si el backend no los valido",
    "si se repite practica basica, resumir y mostrar una micro diferencia de control",
  ],
  shopping: [
    "usar el mercado como entorno vivo: disponibilidad, vendedor, precio o detalle de stock",
    "no convertir cada compra en escena larga si es rutina; validar dinero/stock y narrar breve",
    "si se repite la visita, destacar una diferencia menor del puesto o del trato",
    "separar regateo, compra y charla social para no inventar descuentos",
  ],
  travel: [
    "resumir rutas conocidas y enfocar solo clima, camino, demora o encuentro menor validado",
    "evitar describir el mismo trayecto completo cuando Lucas ya lo hizo varias veces",
    "si no hay evento, mantener el viaje funcional y sin drama gratuito",
    "usar cambio de luz, barro, ruido o cansancio como variacion de ruta",
  ],
  investigation: [
    "centrar la escena en metodo, pista concreta y limite de riesgo, no en recompensa",
    "si la busqueda se repite, resumir lo rutinario y mostrar solo hallazgo o descarte nuevo",
    "distinguir indicio, evidencia y conclusion confirmada",
    "usar terreno, luz, barro, olor o testigos como variacion de investigacion",
  ],
  report: [
    "separar evidencia observada, evidencia entregada y conclusion institucional",
    "no convertir un reporte en recompensa automatica ni deuda personal sin motivo",
    "mostrar si el receptor registra, duda, escala o pide verificacion",
    "si el reporte es parcial, dejar claro que no resuelve por si solo el evento",
  ],
  mission: [
    "centrar la escena en evidencia, riesgo y objetivo de mision, no en recompensa inventada",
    "si la tarea es repetida, resumir preparativos y narrar la pista o decision nueva",
    "mantener prueba, reporte y pago separados hasta que el backend los valide",
    "usar consecuencias del entorno solo si ya existen en mision, evento, clima o combate",
  ],
  social: [
    "no repetir el mismo agradecimiento; usar silencio, gesto, incomodidad o continuidad natural",
    "si hubo mejora social reciente, preferir memoria o matiz antes que otro cambio numerico",
    "dar a los NPCs permiso de estar ocupados, cansados o poco expresivos",
    "evitar romance automatico; confianza y cercania se muestran despacio",
  ],
  rest: [
    "resumir el descanso si no hay sueño, herida, alarma o evento nuevo",
    "variar por hora de despertar, ruido de la posada, hambre o cansancio restante",
    "no forzar escenas oniricas si no hay evento o memoria relevante",
    "mantener el descanso mecanico claro y breve",
  ],
  meal: [
    "si la comida es rutinaria, narrar el efecto y un detalle sensorial corto",
    "no convertir cada comida con el mismo NPC en una charla igual",
    "separar beneficio directo de comida y acumuladores por actividad",
    "usar la comida como pausa o contraste, no como recompensa social automatica",
  ],
  combat: [
    "mantener numeros visibles y acciones concretas; no agregar loot automatico",
    "variar por posicion, cansancio, terreno o lectura del enemigo",
    "si se repite una accion, mostrar ajuste tactico en vez de repetir descripcion",
    "no cerrar consecuencias irreversibles sin validacion",
  ],
  general_action: [
    "elegir un detalle nuevo y mantener la escena compacta si la accion es rutinaria",
    "no repetir frases de NPCs si no aportan nueva informacion",
    "usar estado vivo, hora y lugar para modular tono",
    "si no hay cambio mecanico, narrar como observacion o transicion breve",
  ],
};

const TONE_BY_FAMILY = {
  combat: "tenso y concreto",
  investigation: "observador y metodico",
  job_shift: "cotidiano y funcional",
  magic_practice: "interno y contenido",
  meal: "pausado y sensorial",
  mission: "practico y atento al riesgo",
  physical_training: "fisico y disciplinado",
  rest: "breve y corporal",
  report: "formal y prudente",
  shopping: "local y practico",
  social: "humano y contenido",
  travel: "transicional y situado",
  general_action: "natural y directo",
};

const VARIATION_LEVERS = {
  combat: ["posicion", "lectura del enemigo", "terreno", "fatiga", "riesgo inmediato"],
  investigation: ["pista", "metodo", "terreno", "certeza", "limite de riesgo"],
  job_shift: ["cliente concreto", "tarea distinta", "correccion breve", "ritmo de sala", "cierre del turno"],
  magic_practice: ["sensacion interna", "control de respiracion", "interferencia emocional", "limite de seguridad", "microprogreso"],
  meal: ["sabor", "pausa corporal", "compania", "ruido del lugar", "efecto directo de comida"],
  mission: ["evidencia", "riesgo", "ruta", "testigo", "prueba para reportar"],
  physical_training: ["tecnica", "respiracion", "terreno", "clima", "limite fisico"],
  rest: ["hora de despertar", "hambre", "ruido ambiente", "cansancio residual", "quietud"],
  report: ["registro", "receptor", "calidad de prueba", "duda", "proximo paso"],
  shopping: ["stock", "precio", "trato del vendedor", "calidad visible", "rumor de mercado"],
  social: ["silencio", "gesto", "limite", "cansancio", "continuidad de confianza"],
  travel: ["clima", "barro", "luz", "sonidos", "demora"],
  general_action: ["estado corporal", "lugar", "hora", "detalle nuevo", "consecuencia inmediata"],
};

const REACTION_PALETTES = {
  combat: ["ajuste tactico", "riesgo inmediato", "lectura del enemigo", "impacto fisico"],
  investigation: ["hallazgo", "descarte", "metodo", "limite de riesgo", "certeza parcial"],
  job_shift: ["indicacion breve", "coordinacion sin palabras", "correccion concreta", "reconocimiento seco"],
  magic_practice: ["sensacion interna", "limite de control", "duda prudente", "microprogreso silencioso"],
  meal: ["pausa compartida", "gesto cotidiano", "comentario minimo", "silencio comodo o cansado"],
  mission: ["dato util", "advertencia practica", "testigo", "prueba concreta"],
  physical_training: ["fatiga localizada", "ajuste de tecnica", "terreno", "respiracion"],
  rest: ["despertar", "cuerpo recuperado", "hambre", "ruido ambiente"],
  report: ["registro formal", "duda", "verificacion pendiente", "escalado institucional"],
  shopping: ["trato del vendedor", "calidad visible", "precio", "stock"],
  social: ["gesto", "pausa", "respuesta breve", "limite personal", "cambio sutil de trato"],
  travel: ["clima", "barro", "luz", "demora", "ruido del camino"],
  general_action: ["detalle nuevo", "estado corporal", "reaccion breve", "consecuencia inmediata"],
};

const SCENE_PLAN_BY_MODE = {
  compressed_with_new_detail: {
    paragraphTarget: "1-2 parrafos antes de Cambios relevantes",
    pacing: "resumen con un unico momento nuevo",
    dialoguePolicy: "usar dialogo directo solo si aporta informacion nueva o revela cambio de trato",
  },
  micro_scene: {
    paragraphTarget: "2-3 parrafos antes de Cambios relevantes",
    pacing: "microescena con foco concreto",
    dialoguePolicy: "permitir una frase breve de NPC o un gesto claro, no ambos si no hace falta",
  },
  brief_scene: {
    paragraphTarget: "1-2 parrafos",
    pacing: "transicion breve y situada",
    dialoguePolicy: "evitar dialogo si la accion es puramente funcional",
  },
  full_scene_allowed: {
    paragraphTarget: "3-5 parrafos si la accion tiene peso real",
    pacing: "escena completa permitida si hay novedad, riesgo o decision",
    dialoguePolicy: "dialogo natural segun NPCs presentes, sin convertir rutina en discurso",
  },
};

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stableHash(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pickStable(values, seed, fallback = "") {
  const list = (values || []).filter(Boolean);
  if (list.length === 0) return fallback;
  return list[stableHash(seed) % list.length];
}

function readNested(value, path) {
  return path.reduce((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    return current[key];
  }, value);
}

function collectTextParts({ actionSummary = "", log = null, changes = null, extraText = "" } = {}) {
  return [
    actionSummary,
    extraText,
    log?.type,
    log?.summary,
    (log?.tags || []).join(" "),
    JSON.stringify(changes || log?.mechanicalChanges || {}),
  ]
    .filter(Boolean)
    .join(" ");
}

function inferActionFamily(input = {}) {
  const tags = new Set(toArray(input.tags || input.log?.tags).map(normalizeText));
  const type = normalizeText(input.type || input.log?.type || "");
  const text = normalizeText(collectTextParts(input));
  const changes = input.changes || input.log?.mechanicalChanges || {};

  if (type === "job_shift_completed" || tags.has("job_shift") || readNested(changes, ["ledger", "shiftId"])) {
    return ACTION_FAMILIES.JOB_SHIFT;
  }

  if (Array.isArray(changes.missions) && changes.missions.length > 0) return ACTION_FAMILIES.MISSION;
  if (changes.shopStocks || changes.inventory || changes.money?.reason?.includes?.("compra")) {
    return ACTION_FAMILIES.SHOPPING;
  }
  if (changes.location && changes.time) return ACTION_FAMILIES.TRAVEL;
  if (Array.isArray(changes.npcRelationships) && changes.npcRelationships.length > 0) return ACTION_FAMILIES.SOCIAL;
  if (Array.isArray(changes.skills) && changes.skills.some((skill) => normalizeText(skill.skillId).includes("mana"))) {
    return ACTION_FAMILIES.MAGIC_PRACTICE;
  }

  for (const entry of FAMILY_KEYWORDS) {
    if ((entry.tags || []).some((tag) => tags.has(normalizeText(tag)))) return entry.family;
    if ((entry.words || []).some((word) => text.includes(normalizeText(word)))) return entry.family;
  }

  return ACTION_FAMILIES.GENERAL;
}

function extractInvolvedNpcIds({ log = null, changes = null, explicitNpcIds = [] } = {}) {
  const fromChanges = [
    ...(changes?.npcRelationships || []).map((entry) => entry.npcId),
    ...(changes?.npcMemories || []).map((entry) => entry.npcId),
    ...(changes?.worldEvents || []).flatMap((entry) => entry.affectedNpcIds || []),
  ];

  return unique([
    ...toArray(explicitNpcIds),
    ...toArray(log?.involvedNpcIds),
    ...fromChanges,
  ]).sort();
}

function normalizeLocationScope(locationId = "") {
  const normalized = normalizeText(locationId);
  if (!normalized) return "unknown_location";
  if (normalized.includes("grulla_azul")) return "loc_grulla_azul";
  if (normalized.includes("guild")) return "loc_guild";
  if (normalized.includes("market")) return "loc_market";
  if (normalized.includes("forest")) return "loc_forest";
  if (normalized.includes("mill") || normalized.includes("molino")) return "loc_mill";
  return normalized;
}

function buildActionFingerprint({
  actionFamily,
  actionSummary = "",
  changes = null,
  locationId = "",
  involvedNpcIds = [],
  log = null,
  seed = "",
} = {}) {
  const family = actionFamily || inferActionFamily({ actionSummary, changes, log });
  const locationScope = normalizeLocationScope(locationId || log?.locationId || "");
  const npcScope = unique(involvedNpcIds.length ? involvedNpcIds : extractInvolvedNpcIds({ log, changes })).join("+") || "no_npc";
  const shiftId =
    readNested(changes, ["ledger", "shiftId"]) ||
    readNested(changes, ["shiftId"]) ||
    readNested(log?.mechanicalChanges, ["shiftId"]) ||
    readNested(log?.mechanicalChanges, ["ledger", "shiftId"]) ||
    "";
  const summary = normalizeText(actionSummary || log?.summary || seed).split(" ").slice(0, 8).join("_");
  const detailScope = shiftId || npcScope || summary || "general";

  return `${family}:${locationScope}:${detailScope}`;
}

function analyzeRecentLogs({
  actionFamily,
  actionFingerprint,
  currentDay,
  recentLogs = [],
} = {}) {
  const sameFamilyLogs = [];
  const exactLogs = [];

  for (const log of recentLogs || []) {
    if (!log) continue;
    const logFamily = inferActionFamily({ log });
    const logFingerprint =
      log.mechanicalChanges?.narrativeTracking?.actionFingerprint ||
      buildActionFingerprint({
        actionFamily: logFamily,
        log,
        locationId: log.locationId,
      });

    if (logFamily === actionFamily) sameFamilyLogs.push(log);
    if (logFingerprint === actionFingerprint) exactLogs.push(log);
  }

  const sameFamilyRecentCount = sameFamilyLogs.length;
  const similarRecentCount = exactLogs.length;
  let level = "none";
  if (similarRecentCount >= 3 || sameFamilyRecentCount >= 6) level = "high";
  else if (similarRecentCount >= 1 || sameFamilyRecentCount >= 3) level = "medium";
  else if (sameFamilyRecentCount >= 1) level = "low";

  return {
    level,
    similarRecentCount,
    sameFamilyRecentCount,
    windowDays: RECENT_WINDOW_DAYS,
    lastSimilar: exactLogs[0]
      ? {
          logId: exactLogs[0].logId,
          day: exactLogs[0].day,
          timeStart: exactLogs[0].timeStart,
          type: exactLogs[0].type,
          summary: exactLogs[0].summary,
        }
      : null,
    currentDay,
  };
}

function sceneModeForRepetition(level, actionFamily) {
  if (level === "high") return "compressed_with_new_detail";
  if (level === "medium") return "micro_scene";
  if (actionFamily === ACTION_FAMILIES.TRAVEL || actionFamily === ACTION_FAMILIES.MEAL) return "brief_scene";
  return "full_scene_allowed";
}

function socialGuidanceFor({ actionFamily, repetition, changes = {} } = {}) {
  const hasNumericSocialChange = Array.isArray(changes.npcRelationships) && changes.npcRelationships.length > 0;
  if (hasNumericSocialChange) {
    return {
      outcome: "numeric_change_already_applied",
      guidance: "Mostrar solo los cambios sociales que devolvio el backend; no agregar puntos extra por narracion.",
    };
  }

  if ([ACTION_FAMILIES.JOB_SHIFT, ACTION_FAMILIES.SOCIAL, ACTION_FAMILIES.MEAL].includes(actionFamily)) {
    if (["medium", "high"].includes(repetition.level)) {
      return {
        outcome: "memory_or_texture_only",
        guidance: "Si la accion social se repite, preferir gesto, memoria o matiz sin subir relacion numerica.",
      };
    }

    return {
      outcome: "numeric_possible_if_validated",
      guidance: "Puede haber cambio social solo si previewSocialImpact/applyTurn lo valida con motivo concreto.",
    };
  }

  return {
    outcome: "none_expected",
    guidance: "No convertir esta accion en avance social salvo que el jugador lo busque y el backend lo valide.",
  };
}

function npcDialogueMode({ actionFamily, repetitionLevel, npcId = "" } = {}) {
  if (![ACTION_FAMILIES.JOB_SHIFT, ACTION_FAMILIES.SOCIAL, ACTION_FAMILIES.MEAL].includes(actionFamily)) {
    return "none";
  }
  if (repetitionLevel === "high") return "gesture_or_silence";
  if (repetitionLevel === "medium") return stableHash(npcId) % 2 === 0 ? "brief_line" : "gesture";
  return "brief_line_allowed";
}

function buildNpcBeats({ actionFamily, repetition, involvedNpcIds = [] } = {}) {
  return unique(involvedNpcIds).slice(0, 5).map((npcId) => ({
    npcId,
    dialogueMode: npcDialogueMode({ actionFamily, repetitionLevel: repetition.level, npcId }),
    guidance:
      repetition.level === "high"
        ? "Evitar repetir la misma frase del NPC; usar gesto, ocupacion, cansancio o una respuesta minima."
        : "Si habla, mantener voz propia y una frase breve vinculada a la escena actual.",
  }));
}

function buildAvoidRepeating({ actionFamily, repetition } = {}) {
  const avoid = [];
  if (repetition.level === "medium" || repetition.level === "high") {
    avoid.push("no repetir la estructura exacta de la ultima escena parecida");
    avoid.push("no repetir los mismos agradecimientos, correcciones o descripciones mecanicas");
  }

  if (actionFamily === ACTION_FAMILIES.JOB_SHIFT) {
    avoid.push("no listar siempre mesas, vajilla, agua y ayuda a Yara/Fern en el mismo orden");
  }
  if (actionFamily === ACTION_FAMILIES.PHYSICAL_TRAINING) {
    avoid.push("no volver a enumerar toda la rutina si ya se narro una rutina similar");
  }
  if (actionFamily === ACTION_FAMILIES.MAGIC_PRACTICE) {
    avoid.push("no narrar hechizos nuevos o efectos visibles sin tecnica validada");
  }

  return unique(avoid);
}

function buildVariationGuidance({ actionFamily, repetition, seedText }) {
  const levers = VARIATION_LEVERS[actionFamily] || VARIATION_LEVERS.general_action;
  const primaryLever = pickStable(levers, `${seedText}:primary`);
  const secondaryLever = pickStable(
    levers.filter((lever) => lever !== primaryLever),
    `${seedText}:secondary`,
    ""
  );

  return {
    primaryLever,
    secondaryLever,
    compression:
      repetition.level === "high"
        ? "Comprimir la accion y narrar solo una diferencia concreta."
        : repetition.level === "medium"
          ? "Usar una microescena con un foco nuevo."
          : "Puede narrarse completa si la accion lo merece.",
    consequenceFocus:
      repetition.level === "high"
        ? "No repetir recompensa social o mecanica; mostrar continuidad, cansancio o textura."
        : "Conectar el resultado a estado vivo, NPCs presentes y evento/mision si corresponde.",
  };
}

function buildScenePlan({ actionFamily, repetition, sceneMode, socialGuidance, seedText }) {
  const familyPalette = REACTION_PALETTES[actionFamily] || REACTION_PALETTES.general_action;
  const reactionFocus = pickStable(familyPalette, `${seedText}:reaction`);
  const fallbackFocus = pickStable(
    familyPalette.filter((entry) => entry !== reactionFocus),
    `${seedText}:fallback`,
    ""
  );
  const modePlan = SCENE_PLAN_BY_MODE[sceneMode] || SCENE_PLAN_BY_MODE.full_scene_allowed;
  const repeated = ["medium", "high"].includes(repetition.level);

  return {
    schemaVersion: "scene_plan_v1",
    paragraphTarget: modePlan.paragraphTarget,
    pacing: modePlan.pacing,
    dialoguePolicy: modePlan.dialoguePolicy,
    reactionFocus,
    fallbackFocus,
    noveltyRule: repeated
      ? "Debe haber una diferencia observable respecto de escenas parecidas recientes; si no la hay, resumir."
      : "Puede presentar la accion con mas aire si hay decision, riesgo o informacion nueva.",
    npcReactionRule:
      socialGuidance?.outcome === "memory_or_texture_only"
        ? "Mostrar continuidad del vinculo con gesto, coordinacion o comodidad; no sumar otra recompensa social por rutina."
        : "Reaccion NPC segun personalidad, tarea actual y conocimiento; no forzar agradecimiento ni exposicion emocional.",
    npcAgencyRule:
      "No hacer que todo gire alrededor de Lucas. Un NPC solo muestra preocupacion, proteccion o interes fuerte si tiene vinculo, rol de cuidado/seguridad, obligacion laboral, interes propio, impacto directo o conocimiento suficiente.",
    consequenceRule:
      "Si no hubo cambio mecanico guardado, narrar solo textura, intencion o preparacion; no inventar beneficio persistente.",
    stateCalloutRule:
      "En Cambios relevantes mostrar solo datos guardados, displayLines del backend, compromisos cerrados o motivo claro de +0.",
  };
}

function buildNarrativeHintsFromRecentLogs({
  gameState = {},
  actionSummary = "",
  changes = {},
  logDrafts = [],
  recentLogs = [],
  actionFamily = "",
  involvedNpcIds = [],
  seed = "",
} = {}) {
  const firstDraft = logDrafts[0] || null;
  const resolvedFamily = actionFamily || inferActionFamily({
    actionSummary: actionSummary || firstDraft?.summary,
    changes,
    log: firstDraft,
  });
  const npcIds = unique([
    ...toArray(involvedNpcIds),
    ...extractInvolvedNpcIds({ log: firstDraft, changes }),
    ...toArray(logDrafts).flatMap((log) => toArray(log.involvedNpcIds)),
  ]).sort();
  const locationId = firstDraft?.locationId || gameState.locationId || "";
  const actionFingerprint = buildActionFingerprint({
    actionFamily: resolvedFamily,
    actionSummary: actionSummary || firstDraft?.summary || "",
    changes,
    locationId,
    involvedNpcIds: npcIds,
    log: firstDraft,
    seed,
  });
  const repetition = analyzeRecentLogs({
    actionFamily: resolvedFamily,
    actionFingerprint,
    currentDay: gameState.currentDay,
    recentLogs,
  });
  const seedText = `${gameState.gameId || ""}|${gameState.currentDay || ""}|${gameState.time || ""}|${actionFingerprint}|${repetition.level}|${seed}`;
  const microBeat = pickStable(MICRO_BEATS[resolvedFamily] || MICRO_BEATS.general_action, seedText);
  const sceneMode = sceneModeForRepetition(repetition.level, resolvedFamily);
  const socialGuidance = socialGuidanceFor({ actionFamily: resolvedFamily, repetition, changes });

  return {
    schemaVersion: SCHEMA_VERSION,
    actionFamily: resolvedFamily,
    actionFamilyLabel: FAMILY_LABELS[resolvedFamily] || FAMILY_LABELS.general_action,
    actionFingerprint,
    sceneMode,
    tone: TONE_BY_FAMILY[resolvedFamily] || TONE_BY_FAMILY.general_action,
    repetition,
    microBeat,
    npcBeats: buildNpcBeats({ actionFamily: resolvedFamily, repetition, involvedNpcIds: npcIds }),
    socialGuidance,
    scenePlan: buildScenePlan({
      actionFamily: resolvedFamily,
      repetition,
      sceneMode,
      socialGuidance,
      seedText,
    }),
    avoidRepeating: buildAvoidRepeating({ actionFamily: resolvedFamily, repetition }),
    variationGuidance: buildVariationGuidance({ actionFamily: resolvedFamily, repetition, seedText }),
    npcAgencyRule:
      "El mundo no debe orbitar a Lucas: NPCs desconocidos o poco vinculados reaccionan segun su trabajo, intereses y limites; preocupacion fuerte solo con motivo diegetico.",
    mechanicsBoundary:
      "Estas pistas solo guian narracion. No agregan dinero, EXP, loot, relacion, daño, curacion ni consecuencias.",
    tracking: {
      actionFamily: resolvedFamily,
      actionFingerprint,
      repetitionLevel: repetition.level,
      similarRecentCount: repetition.similarRecentCount,
      sameFamilyRecentCount: repetition.sameFamilyRecentCount,
    },
  };
}

async function loadRecentNarrativeLogs({
  gameId = "isekai_lucas_main",
  currentDay = 1,
  session = null,
  excludeLogIds = [],
  limit = 40,
} = {}) {
  const query = {
    gameId,
    day: { $gte: Math.max(1, Number(currentDay || 1) - RECENT_WINDOW_DAYS) },
    type: { $not: /^test_/i },
    summary: { $not: /prueba|rollback|test biologico/i },
  };
  const excluded = unique(excludeLogIds);
  if (excluded.length > 0) query.logId = { $nin: excluded };

  return EventLog.find(query)
    .sort({ day: -1, timeStart: -1, createdAt: -1 })
    .limit(limit)
    .session(session)
    .lean();
}

async function buildNarrativeHints({
  gameId = "isekai_lucas_main",
  gameState = {},
  actionSummary = "",
  changes = {},
  logDrafts = [],
  actionFamily = "",
  involvedNpcIds = [],
  session = null,
  seed = "",
} = {}) {
  const currentDay = gameState.currentDay || changes.time?.dayAfter || 1;
  const recentLogs = await loadRecentNarrativeLogs({
    gameId,
    currentDay,
    session,
    excludeLogIds: (logDrafts || []).map((log) => log.logId),
  });

  return buildNarrativeHintsFromRecentLogs({
    gameState,
    actionSummary,
    changes,
    logDrafts,
    recentLogs,
    actionFamily,
    involvedNpcIds,
    seed,
  });
}

function attachNarrativeTrackingToLogDrafts(logDrafts = [], hints = null) {
  if (!hints?.tracking) return logDrafts;
  const tagsToAdd = unique([
    "narrative_tracked",
    `action_family_${hints.tracking.actionFamily}`,
    `repetition_${hints.tracking.repetitionLevel}`,
  ]);

  for (const log of logDrafts) {
    const mechanicalChanges =
      log.mechanicalChanges && typeof log.mechanicalChanges === "object" && !Array.isArray(log.mechanicalChanges)
        ? log.mechanicalChanges
        : {};

    log.tags = unique([...toArray(log.tags), ...tagsToAdd]);
    log.mechanicalChanges = {
      ...mechanicalChanges,
      narrativeTracking: hints.tracking,
    };
  }

  return logDrafts;
}

async function buildNarrativeContextSummary({
  gameState = {},
  gameId = "isekai_lucas_main",
  session = null,
  limit = 30,
} = {}) {
  const recentLogs = await loadRecentNarrativeLogs({
    gameId,
    currentDay: gameState.currentDay || 1,
    session,
    limit,
  });
  const counts = new Map();
  const lastByFamily = new Map();

  for (const log of recentLogs) {
    const family = inferActionFamily({ log });
    counts.set(family, (counts.get(family) || 0) + 1);
    if (!lastByFamily.has(family)) {
      lastByFamily.set(family, {
        logId: log.logId,
        day: log.day,
        timeStart: log.timeStart,
        summary: log.summary,
      });
    }
  }

  const repeatedFamilies = Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([family, count]) => ({
      actionFamily: family,
      actionFamilyLabel: FAMILY_LABELS[family] || FAMILY_LABELS.general_action,
      count,
      last: lastByFamily.get(family) || null,
      guidance:
        count >= 4
          ? "Accion repetida varias veces: preferir resumen, microdetalle nuevo y menos dialogo repetido."
          : "Hay repeticion reciente: variar foco narrativo si vuelve a ocurrir.",
    }));

  return {
    schemaVersion: "narrative_context_v1",
    windowDays: RECENT_WINDOW_DAYS,
    recentLogCount: recentLogs.length,
    repeatedFamilies,
    lastActionFamily: recentLogs[0] ? inferActionFamily({ log: recentLogs[0] }) : "",
  };
}

module.exports = {
  ACTION_FAMILIES,
  SCHEMA_VERSION,
  attachNarrativeTrackingToLogDrafts,
  buildActionFingerprint,
  buildNarrativeContextSummary,
  buildNarrativeHints,
  buildNarrativeHintsFromRecentLogs,
  inferActionFamily,
};
