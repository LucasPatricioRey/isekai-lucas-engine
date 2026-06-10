const {
  SOCIAL_RELATIONSHIP_FIELDS,
  normalizeRelationship,
  relationshipBand,
} = require("./socialLedgerService");

const SOCIAL_STATE_VERSION = "social_state_v1";

const RISK_BANDS = [
  { key: "none", label: "nulo/casi inexistente", min: 0, max: 9, nextAt: 10 },
  { key: "mild", label: "leve", min: 10, max: 24, nextAt: 25 },
  { key: "active", label: "activo", min: 25, max: 49, nextAt: 50 },
  { key: "high", label: "alto", min: 50, max: 69, nextAt: 70 },
  { key: "severe", label: "severo", min: 70, max: 89, nextAt: 90 },
  { key: "critical", label: "critico", min: 90, max: 100, nextAt: null },
];

const SOCIAL_DEBT_BANDS = [
  { key: "lucas_owes_major", label: "Lucas debe mucho", min: -100, max: -50, nextAt: -49 },
  { key: "lucas_owes", label: "Lucas debe", min: -49, max: -10, nextAt: -9 },
  { key: "balanced", label: "sin deuda clara", min: -9, max: 9, nextAt: 10 },
  { key: "npc_owes", label: "NPC siente deuda", min: 10, max: 49, nextAt: 50 },
  { key: "npc_owes_major", label: "NPC siente deuda fuerte", min: 50, max: 100, nextAt: null },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function riskBand(value = 0) {
  const normalized = clamp(Number(value) || 0, 0, 100);
  return RISK_BANDS.find((band) => normalized >= band.min && normalized <= band.max) || RISK_BANDS[0];
}

function socialDebtBand(value = 0) {
  const normalized = clamp(Number(value) || 0, -100, 100);
  return SOCIAL_DEBT_BANDS.find((band) => normalized >= band.min && normalized <= band.max) || SOCIAL_DEBT_BANDS[2];
}

function bandSummary(value, band, polarity = "positive") {
  return {
    value,
    key: band.key,
    label: band.label,
    min: band.min,
    max: band.max,
    nextAt: band.nextAt,
    polarity,
  };
}

function buildAxisBands(relationship) {
  return {
    trust: bandSummary(relationship.trust, relationshipBand(relationship.trust), "positive"),
    familiarity: bandSummary(relationship.familiarity, relationshipBand(relationship.familiarity), "positive"),
    affection: bandSummary(relationship.affection, relationshipBand(relationship.affection), "positive"),
    respect: bandSummary(relationship.respect, relationshipBand(relationship.respect), "positive"),
    suspicion: bandSummary(relationship.suspicion, riskBand(relationship.suspicion), "risk"),
    fear: bandSummary(relationship.fear, riskBand(relationship.fear), "risk"),
    jealousy: bandSummary(relationship.jealousy, riskBand(relationship.jealousy), "risk"),
    socialDebt: bandSummary(relationship.socialDebt, socialDebtBand(relationship.socialDebt), "debt"),
  };
}

function socialAccessScore(relationshipInput) {
  const relationship = normalizeRelationship(relationshipInput || {});
  let positive =
    relationship.trust * 0.46 +
    relationship.respect * 0.3 +
    relationship.familiarity * 0.18 +
    relationship.affection * 0.1 +
    Math.max(0, relationship.socialDebt) * 0.06;
  const risk =
    relationship.suspicion * 0.55 +
    relationship.fear * 0.38 +
    relationship.jealousy * 0.22 +
    Math.max(0, -relationship.socialDebt) * 0.1;

  if (relationship.trust >= 70 && relationship.respect >= 50 && relationship.suspicion < 25 && relationship.fear < 25) {
    positive += 10;
  } else if (relationship.trust >= 50 && relationship.respect >= 25 && relationship.suspicion < 25 && relationship.fear < 25) {
    positive += 5;
  }

  return Math.round(clamp(positive - risk, 0, 100));
}

function buildStance(relationship, score) {
  if (relationship.fear >= 70) {
    return {
      key: "avoidant_fearful",
      label: "evitativo por miedo",
      summary: "El NPC tendera a evitar a Lucas o responder defensivamente.",
    };
  }

  if (relationship.suspicion >= 70) {
    return {
      key: "closed_suspicious",
      label: "cerrado por sospecha",
      summary: "El NPC limita informacion, favores y cercania hasta que Lucas repare la confianza.",
    };
  }

  if (relationship.trust <= 9 && relationship.familiarity <= 9) {
    return {
      key: "unknown",
      label: "trato de desconocido",
      summary: "El NPC no tiene base suficiente para asumir confianza especial.",
    };
  }

  if (
    relationship.trust >= 70 &&
    relationship.respect >= 50 &&
    relationship.familiarity >= 25 &&
    relationship.suspicion < 25 &&
    relationship.fear < 25
  ) {
    return {
      key: "trusted",
      label: "trato confiado",
      summary: "El NPC puede abrir informacion sensible, favores importantes o apoyo sostenido si la escena lo justifica.",
    };
  }

  if (score >= 75) {
    return {
      key: "trusted",
      label: "trato confiado",
      summary: "El NPC puede abrir informacion sensible, favores importantes o apoyo sostenido si la escena lo justifica.",
    };
  }

  if (score >= 55) {
    return {
      key: "reliable",
      label: "trato fiable",
      summary: "El NPC ve a Lucas como alguien razonablemente confiable y puede colaborar en asuntos normales.",
    };
  }

  if (score >= 35) {
    return {
      key: "cautious_open",
      label: "apertura cauta",
      summary: "El NPC puede conversar y aceptar ayuda simple, pero evita riesgos o secretos.",
    };
  }

  if (score >= 20) {
    return {
      key: "guarded",
      label: "trato reservado",
      summary: "El NPC responde con cortesia basica, pero no concede confianza real.",
    };
  }

  return {
    key: "closed",
    label: "cerrado",
    summary: "El NPC mantiene distancia social y cualquier avance requiere reparar tension o ganar familiaridad.",
  };
}

function hasWorkAccess(relationship) {
  return relationship.respect >= 10 || relationship.trust >= 10 || relationship.familiarity >= 10;
}

function buildAccess(relationship, score) {
  const highSuspicion = relationship.suspicion >= 50;
  const highFear = relationship.fear >= 50;
  const highJealousy = relationship.jealousy >= 50;
  const stable = !highSuspicion && !highFear;

  return {
    smallTalk: relationship.familiarity >= 10 || relationship.trust >= 10 || score >= 20,
    practicalHelp: stable && (hasWorkAccess(relationship) || score >= 25),
    minorFavor: stable && relationship.trust >= 25 && relationship.respect >= 10,
    sensitiveQuestion: stable && relationship.trust >= 50 && relationship.suspicion < 25,
    privateInfo: stable && relationship.trust >= 70 && relationship.familiarity >= 25 && relationship.suspicion < 25,
    riskyHelp: stable && relationship.trust >= 70 && relationship.respect >= 50,
    apologyCanRepair: relationship.suspicion >= 10 || relationship.trust < 25 || relationship.socialDebt < 0,
    affectionGrowth: stable && relationship.trust >= 25 && relationship.familiarity >= 10 && relationship.suspicion < 25,
    romanceLocked: true,
    debtFavorAvailable: relationship.socialDebt >= 10 && stable,
    needsRepairBeforeCloseness: highSuspicion || highFear || highJealousy || relationship.socialDebt <= -10,
  };
}

function buildRisks(relationship) {
  const risks = [];

  if (relationship.suspicion >= 50) {
    risks.push({
      type: "high_suspicion",
      severity: relationship.suspicion >= 70 ? "high" : "medium",
      message: "El NPC puede ocultar informacion, dudar de motivos o interpretar gestos ambiguos en contra de Lucas.",
    });
  } else if (relationship.suspicion >= 25) {
    risks.push({
      type: "active_suspicion",
      severity: "low",
      message: "Conviene actuar claro y consistente; presionar o mentir puede empeorar rapido.",
    });
  }

  if (relationship.fear >= 50) {
    risks.push({
      type: "high_fear",
      severity: relationship.fear >= 70 ? "high" : "medium",
      message: "El NPC puede evitar a Lucas o ceder por miedo; no debe narrarse como confianza real.",
    });
  }

  if (relationship.jealousy >= 50) {
    risks.push({
      type: "high_jealousy",
      severity: relationship.jealousy >= 70 ? "high" : "medium",
      message: "La tension por celos puede distorsionar escenas sociales, pero no crea romance por si sola.",
    });
  }

  if (relationship.socialDebt <= -10) {
    risks.push({
      type: "lucas_owes_debt",
      severity: relationship.socialDebt <= -50 ? "high" : "medium",
      message: "Lucas carga deuda social o dano pendiente; pedir favores sin reparar puede bajar respeto o confianza.",
    });
  }

  return risks;
}

function buildBlockers(relationship, access) {
  const blockers = [];

  if (!access.privateInfo) {
    blockers.push("No usar informacion privada del NPC como si Lucas ya tuviera permiso para conocerla.");
  }
  if (!access.riskyHelp) {
    blockers.push("No conceder ayuda peligrosa, favores grandes o recursos importantes sin una escena que lo justifique.");
  }
  if (relationship.suspicion >= 25) {
    blockers.push("Evitar avances sociales bruscos; primero hacen falta coherencia, explicacion o reparacion.");
  }
  if (relationship.fear >= 25) {
    blockers.push("No confundir obediencia por miedo con afecto o confianza.");
  }

  return blockers.slice(0, 4);
}

function buildOpportunities(relationship, access) {
  const opportunities = [];

  if (relationship.trust < 25) {
    opportunities.push("Acciones utiles, consistentes y visibles pueden construir confianza inicial.");
  } else if (relationship.trust < 50) {
    opportunities.push("Cumplir promesas y respetar limites puede pasar de confianza basica a trato fiable.");
  } else if (relationship.trust < 70) {
    opportunities.push("Favores con coste real o proteger intereses del NPC pueden abrir informacion sensible.");
  }

  if (relationship.respect < 25) {
    opportunities.push("Competencia, puntualidad y resolver problemas practicos suben respeto.");
  }
  if (relationship.familiarity < 25) {
    opportunities.push("Interacciones repetidas con contenido nuevo pueden subir familiaridad sin forzar intimidad.");
  }
  if (relationship.suspicion >= 10) {
    opportunities.push("Explicaciones honestas y actos verificables reducen riesgo de sospecha futura.");
  }
  if (access.debtFavorAvailable) {
    opportunities.push("Existe deuda social positiva: puede justificar una ayuda menor si la escena encaja.");
  }

  return opportunities.slice(0, 5);
}

function buildNarrativeGuidance(relationship, access, stance) {
  const guidance = [stance.summary];

  if (access.privateInfo) {
    guidance.push("Puede revelar detalles mas personales o contexto sensible si el tema surge naturalmente.");
  } else if (access.sensitiveQuestion) {
    guidance.push("Puede responder preguntas delicadas simples, pero todavia reserva secretos o heridas profundas.");
  } else if (access.smallTalk) {
    guidance.push("Mantener trato cotidiano, observaciones publicas y colaboracion simple.");
  } else {
    guidance.push("Mantener distancia: datos publicos, respuestas breves y sin intimidad.");
  }

  if (relationship.affection >= 25 && access.affectionGrowth) {
    guidance.push("Puede haber calidez personal, pero no equivale a romance ni compromiso.");
  }
  if (relationship.suspicion >= 25) {
    guidance.push("El NPC debe notar contradicciones y pedir claridad antes de confiar.");
  }
  if (relationship.fear >= 25) {
    guidance.push("La escena debe cuidar limites; el miedo bloquea cercania autentica.");
  }

  return guidance.slice(0, 5);
}

function buildNextThresholds(relationship) {
  const candidates = [
    { field: "trust", current: relationship.trust, nextAt: relationshipBand(relationship.trust).nextAt },
    { field: "familiarity", current: relationship.familiarity, nextAt: relationshipBand(relationship.familiarity).nextAt },
    { field: "respect", current: relationship.respect, nextAt: relationshipBand(relationship.respect).nextAt },
    { field: "affection", current: relationship.affection, nextAt: relationshipBand(relationship.affection).nextAt },
  ];

  return candidates
    .filter((item) => item.nextAt !== null && item.nextAt !== undefined)
    .map((item) => ({
      ...item,
      needed: Math.max(0, item.nextAt - item.current),
    }))
    .filter((item) => item.needed > 0)
    .sort((a, b) => a.needed - b.needed)
    .slice(0, 4);
}

function evaluateSocialRelationshipState(relationshipInput = {}) {
  const relationship = normalizeRelationship(relationshipInput);
  const accessScore = socialAccessScore(relationship);
  const stance = buildStance(relationship, accessScore);
  const access = buildAccess(relationship, accessScore);

  return {
    schemaVersion: SOCIAL_STATE_VERSION,
    accessScore,
    stance,
    axisBands: buildAxisBands(relationship),
    access,
    risks: buildRisks(relationship),
    blockers: buildBlockers(relationship, access),
    opportunities: buildOpportunities(relationship, access),
    narrativeGuidance: buildNarrativeGuidance(relationship, access, stance),
    nextThresholds: buildNextThresholds(relationship),
    romance: {
      locked: true,
      reason: "El sistema no desbloquea romance automaticamente; requiere escena explicita, edad/contexto valido y progreso lento.",
    },
  };
}

function applyRelationshipDeltas(relationshipInput = {}, deltasInput = {}) {
  const relationship = normalizeRelationship(relationshipInput);
  const projected = { ...relationship };

  for (const field of SOCIAL_RELATIONSHIP_FIELDS) {
    const value = Number(deltasInput[field] ?? deltasInput[`${field}Delta`] ?? 0);
    if (!Number.isFinite(value)) continue;
    const min = field === "socialDebt" ? -100 : 0;
    projected[field] = clamp((projected[field] || 0) + value, min, 100);
  }

  return projected;
}

function evaluateProjectedSocialRelationshipState(relationshipInput = {}, deltasInput = {}) {
  return evaluateSocialRelationshipState(applyRelationshipDeltas(relationshipInput, deltasInput));
}

module.exports = {
  SOCIAL_STATE_VERSION,
  RISK_BANDS,
  SOCIAL_DEBT_BANDS,
  applyRelationshipDeltas,
  evaluateProjectedSocialRelationshipState,
  evaluateSocialRelationshipState,
  riskBand,
  socialAccessScore,
  socialDebtBand,
};
