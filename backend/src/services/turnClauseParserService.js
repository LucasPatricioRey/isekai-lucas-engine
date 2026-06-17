function normalizeText(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function textMatchesAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function splitTurnClauses(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const separators =
    /\s*(?:[,;]|\.\s+|\by\s+despues\b|\by\s+luego\b|\by\s+finalmente\b|\bdespues\b|\bluego\b|\bfinalmente\b|\btras eso\b|\bentonces\b)\s*/g;
  const clauses = [];
  let lastIndex = 0;
  let match = separators.exec(normalized);

  while (match) {
    const raw = normalized.slice(lastIndex, match.index).trim();
    if (raw) {
      clauses.push({
        order: clauses.length + 1,
        text: raw,
        startIndex: lastIndex,
        endIndex: match.index,
      });
    }
    lastIndex = separators.lastIndex;
    match = separators.exec(normalized);
  }

  const tail = normalized.slice(lastIndex).trim();
  if (tail) {
    clauses.push({
      order: clauses.length + 1,
      text: tail,
      startIndex: lastIndex,
      endIndex: normalized.length,
    });
  }

  return clauses.length
    ? clauses
    : [
        {
          order: 1,
          text: normalized,
          startIndex: 0,
          endIndex: normalized.length,
        },
      ];
}

function targetTimeFromRelativeText(text = "") {
  const normalized = normalizeText(text);
  if (/\bhasta\b.{0,32}\b(el\s+)?(mediodia|medio dia)\b/.test(normalized)) return "12:00";
  if (/\bhasta\b.{0,32}\b(la\s+tarde|turno\s+tarde|turno\s+de\s+la\s+tarde)\b/.test(normalized)) return "14:00";
  if (/\bhasta\b.{0,32}\b(la\s+noche|la\s+cena|cena)\b/.test(normalized)) return "20:00";
  if (/\bhasta\b.{0,32}\b(la\s+manana|turno\s+manana|turno\s+de\s+la\s+manana)\b/.test(normalized)) return "07:00";
  if (/\bhasta\b.{0,32}\b(la\s+madrugada)\b/.test(normalized)) return "05:00";
  return "";
}

function isRiskyMagicClause(text = "") {
  return textMatchesAny(normalizeText(text), [
    /\b(rayo|electric|chispa|descarga|ofensiv|ataque|atacar|conjura|lanza|lanzar|fuego|hielo|cura|curar|herida|enemigo)\b/,
  ]);
}

function isSafeMagicPracticeClause(text = "") {
  const normalized = normalizeText(text);
  if (isRiskyMagicClause(normalized)) return false;
  return textMatchesAny(normalized, [
    /\b(respiracion|respira|medita|meditacion|flujo interno|sentir flujo|percibir flujo)\b.{0,48}\bmana\b/,
    /\bmana\b.{0,48}\b(respiracion|respira|medita|meditacion|flujo interno|sentir flujo|percibir flujo)\b/,
    /\b(practica|practicar|entrena|entrenar|ejercita|ejercitar)\b.{0,48}\bmana\b/,
    /\bmana\b.{0,48}\b(practica|practicar|entrena|entrenar|ejercita|ejercitar)\b/,
  ]);
}

function isWorkCompletionClause(text = "") {
  const normalized = normalizeText(text);
  return textMatchesAny(normalized, [
    /\b(trabaja|trabajar|ayuda|ayudando|ayudar|turno|jornada)\b.*\b(resto del turno|lo que queda del turno|resto de la jornada|lo que queda de la jornada)\b/,
    /\b(trabaja|trabajar|ayuda|ayudando|ayudar|turno|jornada)\b.*\b(hasta|al)\b.*\b(cierre|cerrar|fin del turno|terminar el turno|termina el turno|fin de la jornada)\b/,
    /\b(cierra|cerrar|termina|terminar|completa|completar)\b.*\b(turno|jornada)\b/,
  ]);
}

function isWorkSegmentClause(text = "") {
  const normalized = normalizeText(text);
  return textMatchesAny(normalized, [
    /\b(trabaja|trabajar|sirve mesas|servir mesas|atiende mesas|limpia mesas|ordena mesas|ayuda a cerrar)\b/,
    /\b(ayuda|ayudando|ayudar|se queda)\b.*\b(posada|grulla|mesa|mesas|comedor|barra|cierre|cerrar|turno|jornada|trabajo)\b/,
  ]);
}

function isMealClause(text = "") {
  return textMatchesAny(normalizeText(text), [
    /\b(come|comer|cena|cenar|almuerza|almorzar|desayuna|desayunar)\b/,
    /\b(pide|pedir|compra|comprar)\b.{0,32}\b(comida|plato|sopa|cena|almuerzo|desayuno)\b/,
  ]);
}

function classifyClause(clause = {}) {
  const text = normalizeText(clause.text || "");
  const domains = [];
  const operationClasses = [];
  const targetTime = targetTimeFromRelativeText(text);

  if (isWorkCompletionClause(text)) {
    domains.push("work");
    operationClasses.push("work_completion");
  } else if (isWorkSegmentClause(text)) {
    domains.push("work");
    operationClasses.push("work_segment");
  }

  if (isSafeMagicPracticeClause(text)) {
    domains.push("magic");
    operationClasses.push("safe_magic_practice");
  }

  if (isMealClause(text)) {
    domains.push("economy", "rest_biology");
    operationClasses.push("meal");
  }

  if (targetTime && /\bhasta\b/.test(text)) {
    domains.push("time_activity");
    if (!operationClasses.length) operationClasses.push("wait_until");
  }

  return {
    ...clause,
    domains: unique(domains),
    operationClasses: unique(operationClasses),
    targetTime,
  };
}

function parseTurnClauses(text = "") {
  const clauses = splitTurnClauses(text).map(classifyClause);
  const operationClasses = unique(clauses.flatMap((clause) => clause.operationClasses || []));
  const domains = unique(clauses.flatMap((clause) => clause.domains || []));

  return {
    schemaVersion: "turn_clause_plan_v1",
    clauseCount: clauses.length,
    isCompound: clauses.length > 1 || operationClasses.length > 1,
    domains,
    operationClasses,
    hasWorkCompletion: operationClasses.includes("work_completion"),
    hasWorkSegment: operationClasses.includes("work_segment"),
    hasSafeMagicPractice: operationClasses.includes("safe_magic_practice"),
    hasMeal: operationClasses.includes("meal"),
    clauses,
  };
}

module.exports = {
  classifyClause,
  isSafeMagicPracticeClause,
  isWorkCompletionClause,
  isWorkSegmentClause,
  normalizeText,
  parseTurnClauses,
  splitTurnClauses,
  targetTimeFromRelativeText,
};
