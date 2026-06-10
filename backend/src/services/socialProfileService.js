const { SOCIAL_RELATIONSHIP_FIELDS, buildEmptyDeltas } = require("./socialLedgerService");

const SOCIAL_SIGNAL_ALIASES = {
  responsabilidad: ["responsabilidad", "responsable", "cumpli", "puntual", "turno", "contrato", "deber", "avisa"],
  "trabajo bien hecho": ["trabajo bien", "bien hecho", "servicio", "cocina", "comedor", "orden", "limpi", "prepar"],
  "palabra dada": ["palabra", "promesa", "promet", "cumpli"],
  esfuerzo: ["esfuerzo", "intento", "practico", "trabajo duro"],
  discrecion: ["discrecion", "discreto", "privado", "secreto", "reserva", "no conto", "sin contar"],
  control: ["control", "calma", "calmado", "sereno", "medido", "cuidadoso"],
  seguridad: ["seguridad", "seguro", "cautela", "prudente", "sin riesgo", "distancia"],
  respeto: ["respeto", "respetando", "limite", "sin invadir", "sin presion"],
  honestidad: ["honestidad", "honesto", "sincero", "verdad", "claro"],
  "ayuda sin presion": ["ayuda sin presion", "sin presion", "sin invadir", "respeta su espacio"],
  "sentirse util": ["util", "agradece", "agradecio", "valora", "reconoce", "ayuda genuina"],
  "no ser humillada": ["sin humillar", "no humilla", "privado", "sin exponer", "cuida su verguenza"],
  "que respeten su esfuerzo": ["respeta su esfuerzo", "reconoce su esfuerzo", "esfuerzo", "trabajo"],
  "bromas ligeras": ["broma ligera", "broma suave", "humor suave"],
  "ayuda genuina": ["ayuda genuina", "ayuda", "acompan", "colabor"],
  "compania tranquila": ["compania tranquila", "sentado cerca", "tranquilo", "charla tranquila"],
  "reportes honestos": ["reporte honesto", "informe claro", "senales", "prueba", "verdad"],
  preparacion: ["preparacion", "prepara", "plan", "equipo", "prudente"],
  disciplina: ["disciplina", "entrenamiento", "metodo", "orden"],
  claridad: ["claro", "claridad", "explica", "informe"],
  pruebas: ["prueba", "evidencia", "senal", "reporte"],
  calma: ["calma", "tranquilo", "sereno", "paciente"],
  "pago justo": ["pago justo", "paga", "monedas", "precio"],
  "trato justo": ["trato justo", "justo", "respeto por el oficio"],
  procedimiento: ["procedimiento", "protocolo", "registro", "formulario"],
  "ser tomado en serio": ["tomado en serio", "respeto", "sin burla"],
  "rutas seguras": ["ruta segura", "camino seguro", "seguridad de camino"],
  "no crear panico": ["no crear panico", "calma", "sin escalar"],
  clientes: ["cliente", "venta", "negocio"],

  mentiras: ["mentira", "menti", "falso", "oculto", "engano"],
  robo: ["robo", "robar", "hurto", "tomar sin permiso"],
  "faltas graves": ["falta grave", "abandona", "falto", "incumple"],
  "excusas flojas": ["excusa", "justificacion floja"],
  invasion: ["invasion", "invade", "invadir", "sin permiso", "toca sin permiso"],
  insistencia: ["insiste", "insistencia", "perseguir", "forzar"],
  "magia imprudente": ["magia imprudente", "hechizo imprudente", "mana sin control", "experimento peligroso"],
  presion: ["presion", "presiona", "forzar", "obliga"],
  "burla publica": ["burla publica", "se burla", "ridiculiza", "humilla en publico"],
  "coqueteo brusco": ["coqueteo brusco", "coquetea brusco", "avance brusco", "romantico forzado"],
  "comparaciones crueles": ["comparacion cruel", "la compara", "celos", "humilla comparando"],
  exageraciones: ["exagera", "exageracion", "miente en reporte"],
  imprudencia: ["imprudente", "imprudencia", "riesgo inutil", "sin plan"],
  "mentiras en mision": ["mentira en mision", "reporte falso", "oculta datos de mision"],
  amenazas: ["amenaza", "intimida", "violencia"],
  violencia: ["violencia", "golpea", "agrede", "ataque"],
  "regateo agresivo": ["regateo agresivo", "presiona precio"],
  "deuda sin garantia": ["deuda sin garantia", "fiado sin permiso"],
};

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeList(values = []) {
  return unique(values.map((value) => String(value || "").trim()).filter(Boolean));
}

function mergeProfileList(...lists) {
  return unique(lists.flatMap((list) => normalizeList(list)));
}

function buildNpcSocialProfile(npc = {}) {
  const explicit = npc.socialProfile || {};

  return {
    archetype: explicit.archetype || "",
    personality: normalizeList(npc.personality || []),
    speechStyle: npc.speechStyle || "",
    values: mergeProfileList(npc.values || [], explicit.affinityTags || [], explicit.respectSignals || []),
    tolerates: mergeProfileList(npc.tolerates || [], explicit.trustSignals || [], explicit.affectionSignals || []),
    rejects: mergeProfileList(
      npc.rejects || [],
      explicit.frictionTags || [],
      explicit.suspicionSignals || [],
      explicit.fearSignals || [],
      explicit.jealousySignals || []
    ),
    boundaries: mergeProfileList(explicit.boundaries || [], npc.rejects || []),
    notes: explicit.notes || "",
  };
}

function buildActionText(body = {}, factors = {}) {
  return normalizeText(
    [
      body.actionSummary,
      body.reason,
      body.socialTone,
      body.dialogue,
      body.locationContext,
      ...(body.tags || []),
      ...(body.intentTags || []),
      ...(body.contextTags || []),
      factors.actionType,
      factors.importance,
    ].join(" ")
  );
}

function aliasesForTrait(trait) {
  const normalizedTrait = normalizeText(trait);
  return unique([
    normalizedTrait,
    ...(SOCIAL_SIGNAL_ALIASES[normalizedTrait] || []),
  ]).map(normalizeText);
}

function isNegatedSignal(text, signal) {
  const index = text.indexOf(signal);
  if (index < 0) return false;
  const before = text.slice(Math.max(0, index - 24), index);
  const phrase = text.slice(Math.max(0, index - 8), index + signal.length + 8);
  return (
    /\b(sin|no|evita|evitar|evitando|respeta|respetando)\s+$/.test(before) ||
    /\b(sin|no)\s+\w*\s*/.test(phrase.slice(0, Math.min(phrase.length, 20)))
  );
}

function isFalsePositiveSignal(text, signal, index) {
  const before = text.slice(Math.max(0, index - 4), index);
  if (signal === "prudente" && before.endsWith("im")) return true;
  if (signal === "seguro" && before.endsWith("in")) return true;
  return false;
}

function traitMatchesText(trait, text, options = {}) {
  const aliases = aliasesForTrait(trait);
  const matches = [];

  for (const alias of aliases) {
    if (!alias || alias.length < 3) continue;
    const index = text.indexOf(alias);
    if (index < 0) continue;
    if (isFalsePositiveSignal(text, alias, index)) continue;
    if (options.ignoreNegated && isNegatedSignal(text, alias)) continue;
    matches.push(alias);
  }

  return unique(matches);
}

function matchTraits(traits, text, options = {}) {
  return normalizeList(traits)
    .map((trait) => ({ trait, signals: traitMatchesText(trait, text, options) }))
    .filter((match) => match.signals.length > 0);
}

function addDelta(deltas, field, value) {
  if (!SOCIAL_RELATIONSHIP_FIELDS.includes(field)) return;
  deltas[field] += value;
}

function hasRejectTrait(matches, pattern) {
  const normalizedPattern = normalizeText(pattern);
  return matches.some((match) => normalizeText(match.trait).includes(normalizedPattern));
}

function evaluateNpcSocialProfile({ npc, body = {}, factors = {} }) {
  const profile = buildNpcSocialProfile(npc);
  const text = buildActionText(body, factors);
  const matchedValues = matchTraits(profile.values, text, { ignoreNegated: true });
  const matchedTolerates = matchTraits(profile.tolerates, text, { ignoreNegated: true });
  const matchedRejects = matchTraits(profile.rejects, text, { ignoreNegated: true });
  const matchedPersonality = matchTraits(profile.personality, text, { ignoreNegated: true });
  const deltaModifiers = buildEmptyDeltas();
  const reasons = [];
  const warnings = [];

  const positiveSignals = matchedValues.length + matchedTolerates.length + matchedPersonality.length;
  const negativeSignals = matchedRejects.length;
  const meaningfulAction =
    factors.helpedNpc ||
    factors.reliableWork ||
    factors.respectsBoundaries ||
    factors.promiseFulfilled ||
    factors.emotionalConsequence ||
    factors.practicalConsequence;

  if (matchedValues.length > 0 && meaningfulAction) {
    addDelta(deltaModifiers, "respect", 1);
    reasons.push("la accion toca valores del NPC");
  }

  if (matchedTolerates.length > 0 && meaningfulAction) {
    addDelta(deltaModifiers, "trust", 1);
    reasons.push("la accion encaja con formas de trato que el NPC tolera o aprecia");
  }

  if (matchedPersonality.length > 0 && meaningfulAction && !factors.withinExpectedDuty) {
    addDelta(deltaModifiers, "familiarity", 1);
    reasons.push("la escena encaja con rasgos visibles de personalidad del NPC");
  }

  if (matchedRejects.length > 0) {
    addDelta(deltaModifiers, "trust", -1);
    addDelta(deltaModifiers, "suspicion", 1);
    warnings.push("la accion toca rechazos o limites del NPC");

    if (
      hasRejectTrait(matchedRejects, "magia imprudente") ||
      hasRejectTrait(matchedRejects, "violencia") ||
      hasRejectTrait(matchedRejects, "amenaza")
    ) {
      addDelta(deltaModifiers, "fear", 1);
    }

    if (
      hasRejectTrait(matchedRejects, "coqueteo brusco") ||
      hasRejectTrait(matchedRejects, "comparaciones crueles")
    ) {
      addDelta(deltaModifiers, "jealousy", 1);
      addDelta(deltaModifiers, "affection", -1);
    }

    if (
      hasRejectTrait(matchedRejects, "mentira") ||
      hasRejectTrait(matchedRejects, "robo") ||
      hasRejectTrait(matchedRejects, "faltas graves")
    ) {
      addDelta(deltaModifiers, "respect", -1);
    }

    reasons.push("la accion entra en friccion con rechazos declarados del NPC");
  }

  const profileFit = negativeSignals > 0 && positiveSignals === 0
    ? "conflict"
    : positiveSignals > 0 && negativeSignals === 0
      ? "aligned"
      : positiveSignals > 0 && negativeSignals > 0
        ? "mixed"
        : "neutral";

  return {
    profile,
    profileFit,
    positiveSignals,
    negativeSignals,
    matchedValues,
    matchedTolerates,
    matchedRejects,
    matchedPersonality,
    deltaModifiers,
    reasons,
    warnings,
  };
}

function summarizeNpcSocialProfile(npc = {}) {
  const profile = buildNpcSocialProfile(npc);

  return {
    archetype: profile.archetype,
    personality: profile.personality.slice(0, 8),
    speechStyle: profile.speechStyle,
    values: profile.values.slice(0, 8),
    tolerates: profile.tolerates.slice(0, 8),
    rejects: profile.rejects.slice(0, 8),
    boundaries: profile.boundaries.slice(0, 8),
    notes: profile.notes,
  };
}

module.exports = {
  buildNpcSocialProfile,
  evaluateNpcSocialProfile,
  normalizeText,
  summarizeNpcSocialProfile,
};
