const GameState = require("../models/GameState");
const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");

const RELATIONSHIP_FIELDS = ["trust", "affection", "suspicion", "respect", "fear", "jealousy"];

const IMPORTANCE_SCORE = {
  none: 0,
  color: 0,
  smalltalk: 0,
  minor: 1,
  normal: 2,
  meaningful: 2,
  important: 3,
  strong: 3,
  major: 4,
  critical: 4,
};

const MEMORY_WEIGHT = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  very_high: 4,
};

const TRUST_BANDS = [
  { key: "stranger_cautious", label: "desconocido/cautela", min: 0, max: 9, nextAt: 10 },
  { key: "basic_familiarity", label: "trato basico", min: 10, max: 24, nextAt: 25 },
  { key: "comfortable_working", label: "confianza laboral/comoda", min: 25, max: 39, nextAt: 40 },
  { key: "reliable", label: "fiable para favores menores", min: 40, max: 59, nextAt: 60 },
  { key: "personal_trust", label: "confianza personal", min: 60, max: 74, nextAt: 75 },
  { key: "deep_trust", label: "vinculo profundo", min: 75, max: 89, nextAt: 90 },
  { key: "exceptional", label: "confianza excepcional", min: 90, max: 100, nextAt: null },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function boolFrom(value, fallback = false) {
  return value === undefined || value === null ? fallback : Boolean(value);
}

function importanceScore(value) {
  return IMPORTANCE_SCORE[normalizeText(value || "")] ?? 1;
}

function getTrustBand(trust = 0) {
  const value = clamp(Number.isFinite(trust) ? trust : 0, 0, 100);
  return TRUST_BANDS.find((band) => value >= band.min && value <= band.max) || TRUST_BANDS[0];
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function inferFactors(body) {
  const factors = body.factors || {};
  const text = normalizeText(`${body.actionSummary || ""} ${(body.tags || []).join(" ")}`);

  const helpedNpc = boolFrom(
    factors.helpedNpc,
    /\b(ayud|apoy|favor|facilit|colabor|cubri|acompan)\w*/.test(text)
  );
  const reliableWork = boolFrom(
    factors.reliableWork,
    /\b(turno|trabaj|jornada|puntual|cumpli|servicio|cocina|comedor)\w*/.test(text)
  );
  const respectsBoundaries = boolFrom(
    factors.respectsBoundaries,
    /\b(respet|limite|espacio|sin invadir|sin presion)\w*/.test(text)
  );
  const promiseFulfilled = boolFrom(
    factors.promiseFulfilled,
    /\b(promesa|promet|cumpli)\w*/.test(text)
  );
  const apology = boolFrom(factors.apology, /\b(disculp|perdon)\w*/.test(text));
  const emotionalConsequence = boolFrom(
    factors.emotionalConsequence,
    /\b(calma|tranquil|emocion|miedo|nervios|apoyo|escuch)\w*/.test(text)
  );
  const practicalConsequence = boolFrom(
    factors.practicalConsequence,
    helpedNpc || reliableWork || /\b(resol|termin|entreg|proteg|salv)\w*/.test(text)
  );
  const withinExpectedDuty = boolFrom(
    factors.withinExpectedDuty,
    /\b(turno|jornada|contrato|trabajo normal|laboral)\w*/.test(text)
  );

  return {
    witnessedByNpc: boolFrom(factors.witnessedByNpc ?? factors.npcSawOrKnows, true),
    mattersToNpc: boolFrom(factors.mattersToNpc, helpedNpc || practicalConsequence || emotionalConsequence),
    fitsPersonality: boolFrom(factors.fitsPersonality, true),
    repetitiveSocialFarming: boolFrom(factors.repetitiveSocialFarming, false),
    helpedNpc,
    reliableWork,
    respectsBoundaries,
    promiseFulfilled,
    apology,
    emotionalConsequence,
    practicalConsequence,
    withinExpectedDuty,
    personalScene: boolFrom(factors.personalScene, emotionalConsequence && !withinExpectedDuty),
    riskOrCostToLucas: boolFrom(factors.riskOrCostToLucas, false),
    liedOrBrokePromise: boolFrom(factors.liedOrBrokePromise, false),
    embarrassedNpc: boolFrom(factors.embarrassedNpc, false),
    pressuredNpc: boolFrom(factors.pressuredNpc ?? factors.romanticPressure ?? factors.publicPressure, false),
    harmedNpc: boolFrom(factors.harmedNpc, false),
    unreliableWork: boolFrom(factors.unreliableWork, false),
    provokedJealousy: boolFrom(factors.provokedJealousy, false),
    personalWarmth: boolFrom(factors.personalWarmth, false),
    importance: factors.importance || body.importance || (helpedNpc || reliableWork ? "meaningful" : "minor"),
  };
}

function normalizeDeltaObject(deltas, sceneCap) {
  const normalized = {};
  for (const field of RELATIONSHIP_FIELDS) {
    const value = deltas[field] || 0;
    normalized[field] = clamp(value, -3, sceneCap);
  }
  return normalized;
}

function buildSuggestedPatch(npcId, deltas, reason, notes) {
  const patch = { npcId, reason };

  for (const field of RELATIONSHIP_FIELDS) {
    const value = deltas[field] || 0;
    if (value !== 0) patch[`${field}Delta`] = value;
  }

  if (notes) patch.notes = notes;

  return patch;
}

function summarizeChanges(npcName, deltas) {
  const labels = {
    trust: "Confianza",
    affection: "Afecto",
    suspicion: "Sospecha",
    respect: "Respeto",
    fear: "Miedo",
    jealousy: "Celos",
  };

  return RELATIONSHIP_FIELDS
    .filter((field) => (deltas[field] || 0) !== 0)
    .map((field) => `${labels[field]} ${npcName}: ${signed(deltas[field])}`);
}

async function getRecentPositiveMemories(npcId, currentDay, recentMemoryDays) {
  if (!Number.isInteger(currentDay)) return [];

  return NpcMemory.find({
    npcId,
    createdDay: { $gte: currentDay - recentMemoryDays },
    tags: {
      $in: [
        "trust_building",
        "respect_building",
        "helpful",
        "reliable_work",
        "respect_space",
        "promise_fulfilled",
      ],
    },
  })
    .sort({ createdDay: -1, createdTime: -1, createdAt: -1 })
    .limit(20)
    .lean();
}

function calculateMemorySignal(memories) {
  let score = 0;
  for (const memory of memories) {
    score += MEMORY_WEIGHT[memory.emotionalWeight] || 0;
    if (memory.importance === "important") score += 1;
    if (memory.importance === "critical") score += 2;
  }

  return {
    count: memories.length,
    score,
    hasConsolidationSignal: memories.length >= 3 && score >= 5,
  };
}

function evaluateSocialImpact({ npc, factors, body, memorySignal }) {
  const current = npc.relationshipWithLucas || {};
  const sceneCap = clamp(Number.isInteger(body.sceneCap) ? body.sceneCap : 2, 0, 3);
  const deltas = {
    trust: 0,
    affection: 0,
    suspicion: 0,
    respect: 0,
    fear: 0,
    jealousy: 0,
  };
  const reasons = [];
  const warnings = [];

  const gateFailures = [];
  if (!factors.witnessedByNpc) gateFailures.push("el NPC no vio ni supo la accion");
  if (!factors.mattersToNpc) gateFailures.push("la accion no le importa al NPC");
  if (!factors.fitsPersonality) gateFailures.push("no encaja con su personalidad/valores");

  const negative =
    factors.liedOrBrokePromise ||
    factors.embarrassedNpc ||
    factors.pressuredNpc ||
    factors.harmedNpc ||
    factors.unreliableWork ||
    body.polarity === "negative";

  if (gateFailures.length > 0) {
    warnings.push(...gateFailures);
    return {
      deltas,
      reasons: ["sin cambio numerico: no cumple condiciones sociales minimas"],
      warnings,
      sceneCap,
    };
  }

  const importance = importanceScore(factors.importance);

  if (negative) {
    const baseLoss = importance >= 3 ? -2 : -1;
    deltas.trust += baseLoss;
    if (factors.liedOrBrokePromise || factors.pressuredNpc) deltas.suspicion += 1;
    if (factors.harmedNpc) deltas.fear += 1;
    if (factors.unreliableWork) deltas.respect -= 1;
    if (factors.provokedJealousy) deltas.jealousy += 1;
    reasons.push("impacto negativo: dano social, presion, mentira, humillacion o incumplimiento");
    return {
      deltas: normalizeDeltaObject(deltas, sceneCap),
      reasons,
      warnings,
      sceneCap,
    };
  }

  if (factors.repetitiveSocialFarming && importance < 4) {
    warnings.push("posible farmeo social repetitivo");
    return {
      deltas,
      reasons: ["sin cambio numerico: repeticion sin nueva consecuencia"],
      warnings,
      sceneCap,
    };
  }

  if (factors.reliableWork || factors.practicalConsequence) {
    deltas.respect += importance >= 3 ? 2 : 1;
    reasons.push("competencia o ayuda practica visible");
  }

  if (factors.helpedNpc || factors.respectsBoundaries || factors.promiseFulfilled || factors.emotionalConsequence) {
    deltas.trust += importance >= 3 || factors.promiseFulfilled || factors.riskOrCostToLucas ? 2 : 1;
    reasons.push("ayuda relevante, respeto de limites o apoyo emocional");
  }

  if (factors.withinExpectedDuty && deltas.trust > 1 && !factors.promiseFulfilled && !factors.riskOrCostToLucas) {
    deltas.trust = 1;
    reasons.push("al ocurrir dentro del deber normal, el impacto principal va a respeto");
  }

  if (
    body.allowAffectionDelta === true &&
    factors.personalWarmth &&
    factors.personalScene &&
    factors.emotionalConsequence &&
    (current.trust || 0) >= 25
  ) {
    deltas.affection += 1;
    reasons.push("calidez personal en escena privada y con confianza suficiente");
  }

  if (
    body.allowMemoryConsolidation !== false &&
    memorySignal.hasConsolidationSignal &&
    (deltas.trust > 0 || factors.helpedNpc || factors.respectsBoundaries) &&
    (current.trust || 0) < 40
  ) {
    deltas.trust += 1;
    reasons.push("consolidacion: varias memorias positivas recientes refuerzan confianza lenta");
  }

  const normalized = normalizeDeltaObject(deltas, sceneCap);

  if (Object.values(normalized).every((value) => value === 0)) {
    reasons.push("sin cambio numerico: gesto menor o insuficiente para mover relacion");
  }

  return {
    deltas: normalized,
    reasons,
    warnings,
    sceneCap,
  };
}

async function previewSocialImpact(body = {}) {
  const gameId = body.gameId || "isekai_lucas_main";
  const npcId = body.npcId;

  if (!npcId) {
    const error = new Error("npcId es obligatorio.");
    error.statusCode = 400;
    throw error;
  }

  const [npc, gameState] = await Promise.all([
    Npc.findOne({ npcId }).lean(),
    GameState.findOne({ gameId }).lean(),
  ]);

  if (!npc) {
    const error = new Error(`No existe NPC persistente con id: ${npcId}`);
    error.statusCode = 404;
    throw error;
  }

  const recentMemoryDays = clamp(Number.isInteger(body.recentMemoryDays) ? body.recentMemoryDays : 3, 1, 30);
  const recentPositiveMemories = await getRecentPositiveMemories(
    npcId,
    gameState?.currentDay,
    recentMemoryDays
  );
  const memorySignal = calculateMemorySignal(recentPositiveMemories);
  const factors = inferFactors(body);
  const evaluation = evaluateSocialImpact({ npc, factors, body, memorySignal });
  const currentRelationship = npc.relationshipWithLucas || {};
  const reason = evaluation.reasons.join("; ");
  const suggestedPatch = buildSuggestedPatch(
    npc.npcId,
    evaluation.deltas,
    body.reason || reason,
    body.notes || ""
  );

  return {
    npc: {
      npcId: npc.npcId,
      name: npc.name,
      role: npc.role || "",
      relationshipWithLucas: currentRelationship,
      trustBand: getTrustBand(currentRelationship.trust || 0),
    },
    gameState: gameState
      ? {
          gameId: gameState.gameId,
          currentDay: gameState.currentDay,
          time: gameState.time,
          locationId: gameState.locationId,
        }
      : null,
    factors,
    evaluation: {
      deltas: evaluation.deltas,
      reasons: evaluation.reasons,
      warnings: evaluation.warnings,
      caps: {
        sceneCap: evaluation.sceneCap,
        normalDailyCap: 3,
        majorEventException: true,
      },
      memorySignal,
      relationshipThresholds: TRUST_BANDS,
    },
    suggestedPatch,
    displayChanges: summarizeChanges(npc.name, evaluation.deltas),
    mutation: {
      willMutateGameState: false,
      applyWith: "applyTurn.npcRelationshipPatches",
    },
  };
}

module.exports = {
  TRUST_BANDS,
  previewSocialImpact,
};
