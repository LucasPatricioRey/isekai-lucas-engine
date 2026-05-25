const PHASE_ORDER = [
  "Principiante",
  "Novato",
  "Competente",
  "Experto",
  "Maestro",
  "Legendario",
];

const EXP_TO_NEXT_BY_PHASE = {
  Principiante: 100,
  Novato: 250,
  Competente: 600,
  Experto: 1500,
  Maestro: 4000,
  Legendario: 10000,
};

const MAGICAL_SKILL_IDS = new Set([
  "skill_mana",
  "skill_magia",
  "skill_percepcion_magica",
  "skill_magia_ofensiva",
  "skill_fuego",
  "skill_rayo",
  "skill_hielo",
  "skill_tierra_viento",
  "skill_magia_defensiva",
  "skill_magia_curativa",
  "skill_magia_mental",
  "skill_magia_invocacion",
  "skill_resistencia_magica",
]);

const SKILL_ACTIVITY_RANGES = {
  skill_fuerza: {
    trabajo_normal: { min: 0, max: 0, unit: "hour" },
    carga_menor: { min: 0, max: 1, unit: "hour" },
    trabajo_fuerte: { min: 3, max: 6, unit: "hour" },
    cortar_lena: { min: 5, max: 10, unit: "hour" },
    entreno_moderado: { min: 6, max: 10, unit: "hour" },
    entreno_intenso: { min: 10, max: 18, unit: "hour" },
    combate: { min: 3, max: 12, unit: "scene" },
  },
  skill_resistencia: {
    trabajo_normal: { min: 1, max: 2, unit: "hour" },
    trabajo_fuerte: { min: 3, max: 5, unit: "hour" },
    viaje: { min: 1, max: 2, unit: "hour" },
    entreno_moderado: { min: 6, max: 10, unit: "hour" },
    entreno_intenso: { min: 10, max: 16, unit: "hour" },
    combate_largo: { min: 4, max: 12, unit: "scene" },
    jornada_laboral: { min: 8, max: 12, unit: "shift" },
  },
  skill_vitalidad: {
    trabajo_normal: { min: 0, max: 1, unit: "hour" },
    trabajo_largo: { min: 4, max: 8, unit: "shift" },
    soportar_hambre_cansancio_herida: { min: 2, max: 6, unit: "scene" },
    soportar_lesion: { min: 2, max: 8, unit: "scene" },
  },
  skill_agilidad: {
    ayuda_breve: { min: 0, max: 0, unit: "scene" },
    servicio_comedor: { min: 0, max: 1, unit: "hour" },
    turno_tarde: { min: 2, max: 6, unit: "shift" },
    entreno_moderado: { min: 6, max: 10, unit: "hour" },
    entreno_intenso: { min: 10, max: 16, unit: "hour" },
    combate_esquivas: { min: 4, max: 12, unit: "scene" },
    terreno_dificil: { min: 3, max: 8, unit: "hour" },
  },
  skill_percepcion: {
    trabajo_comun: { min: 0, max: 0, unit: "hour" },
    vigilar_30min: { min: 1, max: 3, unit: "block" },
    buscar_detalles_30min: { min: 1, max: 4, unit: "block" },
    leer_gestos_charla: { min: 1, max: 3, unit: "scene" },
    exploracion_peligrosa: { min: 3, max: 8, unit: "scene" },
    guardia_nocturna: { min: 4, max: 10, unit: "shift" },
  },
  skill_mana: {
    intento_impulsivo_menor_10min: { min: 0, max: 0, unit: "scene" },
    practica_basica_10_30min: { min: 1, max: 5, unit: "block" },
    practica_basica_1h_solo: { min: 4, max: 8, unit: "hour" },
    practica_guiada_1h: { min: 8, max: 15, unit: "hour" },
    meditacion_profunda_1h: { min: 6, max: 12, unit: "hour" },
  },
  skill_magia: {
    leer_teoria_30min: { min: 1, max: 3, unit: "block" },
    estudiar_teoria_1h: { min: 4, max: 8, unit: "hour" },
    practica_guiada_hechizo_1h: { min: 8, max: 15, unit: "hour" },
    practica_sin_maestro: { min: 2, max: 6, unit: "hour" },
    uso_exitoso_hechizo_conocido: { min: 2, max: 8, unit: "scene" },
    hechizo_imposible: { min: 0, max: 0, unit: "scene" },
  },
};

const CATEGORY_ALIASES = {
  trabajo_normal_sin_carga: "trabajo_normal",
  "trabajo normal sin carga": "trabajo_normal",
  trabajo_normal: "trabajo_normal",
  "trabajo normal": "trabajo_normal",
  carga_menor: "carga_menor",
  "carga menor": "carga_menor",
  trabajo_fuerte: "trabajo_fuerte",
  "trabajo fuerte": "trabajo_fuerte",
  cortar_lena: "cortar_lena",
  "cortar lena": "cortar_lena",
  entreno_moderado: "entreno_moderado",
  "entreno moderado": "entreno_moderado",
  entrenamiento_moderado: "entreno_moderado",
  entreno_intenso: "entreno_intenso",
  "entreno intenso": "entreno_intenso",
  entrenamiento_intenso: "entreno_intenso",
  combate: "combate",
  combate_largo: "combate_largo",
  "combate largo": "combate_largo",
  jornada_laboral: "jornada_laboral",
  "jornada laboral": "jornada_laboral",
  viaje: "viaje",
  trabajo_largo: "trabajo_largo",
  "trabajo largo": "trabajo_largo",
  soportar_hambre_cansancio_herida: "soportar_hambre_cansancio_herida",
  soportar_lesion: "soportar_lesion",
  ayuda_breve: "ayuda_breve",
  servicio_comedor: "servicio_comedor",
  "servicio comedor": "servicio_comedor",
  turno_tarde: "turno_tarde",
  "turno tarde": "turno_tarde",
  combate_esquivas: "combate_esquivas",
  terreno_dificil: "terreno_dificil",
  trabajo_comun: "trabajo_comun",
  vigilar_30min: "vigilar_30min",
  buscar_detalles_30min: "buscar_detalles_30min",
  leer_gestos_charla: "leer_gestos_charla",
  exploracion_peligrosa: "exploracion_peligrosa",
  guardia_nocturna: "guardia_nocturna",
  intento_impulsivo_menor_10min: "intento_impulsivo_menor_10min",
  practica_basica_10_30min: "practica_basica_10_30min",
  practica_basica_1h_solo: "practica_basica_1h_solo",
  practica_guiada_1h: "practica_guiada_1h",
  meditacion_profunda_1h: "meditacion_profunda_1h",
  leer_teoria_30min: "leer_teoria_30min",
  estudiar_teoria_1h: "estudiar_teoria_1h",
  practica_guiada_hechizo_1h: "practica_guiada_hechizo_1h",
  practica_sin_maestro: "practica_sin_maestro",
  uso_exitoso_hechizo_conocido: "uso_exitoso_hechizo_conocido",
  hechizo_imposible: "hechizo_imposible",
};

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCategory(category) {
  const normalized = normalizeText(category).replace(/-/g, "_");
  return CATEGORY_ALIASES[normalized] || CATEGORY_ALIASES[normalized.replace(/_/g, " ")] || normalized;
}

function getNextPhase(currentPhase) {
  const index = PHASE_ORDER.indexOf(currentPhase);
  if (index === -1 || index >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[index + 1];
}

function cloneSkill(skill) {
  return {
    skillId: skill.skillId,
    name: skill.name,
    phase: skill.phase,
    level: skill.level,
    exp: skill.exp,
    expToNext: skill.expToNext || EXP_TO_NEXT_BY_PHASE[skill.phase],
  };
}

function applySkillExpPreview(skill, expDelta) {
  if (!Number.isInteger(expDelta) || expDelta < 0) {
    const error = new Error("expDelta debe ser un entero mayor o igual a 0.");
    error.statusCode = 400;
    throw error;
  }

  const working = cloneSkill(skill);
  const before = cloneSkill(working);
  const levelUps = [];

  working.exp += expDelta;

  while (working.exp >= working.expToNext) {
    working.exp -= working.expToNext;

    if (working.level < 10) {
      working.level += 1;
    } else {
      const nextPhase = getNextPhase(working.phase);

      if (!nextPhase) {
        working.level = 10;
        working.exp = 0;
        break;
      }

      working.phase = nextPhase;
      working.level = 1;
      working.expToNext = EXP_TO_NEXT_BY_PHASE[nextPhase];
    }

    levelUps.push({
      phase: working.phase,
      level: working.level,
      expToNext: working.expToNext,
    });
  }

  return {
    before,
    expDelta,
    after: cloneSkill(working),
    levelUps,
  };
}

function getEnergyExpMultiplier(currentEnergy) {
  if (!Number.isFinite(Number(currentEnergy))) return 1;
  const energy = Number(currentEnergy);
  if (energy >= 70) return 1;
  if (energy >= 40) return 0.9;
  if (energy >= 20) return 0.6;
  if (energy >= 1) return 0.25;
  return 0;
}

function calculateExpMultiplier({ skillId, modifiers = {}, currentEnergy = null }) {
  const isMagical = MAGICAL_SKILL_IDS.has(skillId);
  const multiplierParts = [];
  let multiplier = 1;

  if (modifiers.hasMaster === true) {
    multiplier *= 2;
    multiplierParts.push({ id: "master", multiplier: 2, applied: true });
  }

  if (modifiers.aquaBlessing === true) {
    if (isMagical) {
      multiplier *= 5;
      multiplierParts.push({ id: "aqua", multiplier: 5, applied: true });
    } else {
      multiplierParts.push({ id: "aqua", multiplier: 1, applied: false, reason: "Aqua solo aplica a habilidades magicas." });
    }
  }

  const energyMultiplier = getEnergyExpMultiplier(currentEnergy);
  if (energyMultiplier !== 1) {
    multiplier *= energyMultiplier;
    multiplierParts.push({ id: "energy", multiplier: energyMultiplier, applied: true });
  }

  multiplier = Math.min(multiplier, 10);

  return {
    isMagical,
    multiplier,
    multiplierParts,
    antiFarming: {
      multiplier: 1,
      applied: false,
      todo: "Implementar reduccion por repeticion cuando exista historial diario de entrenamientos.",
    },
  };
}

function getRecommendedRange({ skillId, category }) {
  const categoryId = normalizeCategory(category || "");
  return {
    categoryId,
    range: SKILL_ACTIVITY_RANGES[skillId]?.[categoryId] || null,
  };
}

function validateSkillPatch({ skillId, expDelta, reason = "", category = "", modifiers = {}, currentEnergy = null }) {
  const issues = [];

  if (!skillId) {
    issues.push("skillId es obligatorio.");
  }

  if (!Number.isInteger(expDelta) || expDelta < 0) {
    issues.push("expDelta debe ser un entero mayor o igual a 0.");
  }

  const { categoryId, range } = getRecommendedRange({ skillId, category });
  const multiplierInfo = calculateExpMultiplier({ skillId, modifiers, currentEnergy });
  const effectiveExpDelta = Number.isInteger(expDelta)
    ? Math.max(0, Math.round(expDelta * multiplierInfo.multiplier * multiplierInfo.antiFarming.multiplier))
    : 0;

  if (range && Number.isInteger(expDelta) && expDelta > range.max) {
    issues.push(`expDelta ${expDelta} supera el rango base recomendado ${range.min}-${range.max} para ${skillId}/${categoryId}.`);
  }

  if (range && Number.isInteger(expDelta) && expDelta < range.min) {
    issues.push(`expDelta ${expDelta} queda por debajo del rango base recomendado ${range.min}-${range.max} para ${skillId}/${categoryId}.`);
  }

  return {
    ok: issues.length === 0,
    issues,
    skillId,
    reason,
    categoryId,
    recommendedRange: range,
    baseExpDelta: Number.isInteger(expDelta) ? expDelta : null,
    effectiveExpDelta,
    ...multiplierInfo,
  };
}

function previewSkillProgression({ skill, expDelta, reason = "", category = "", modifiers = {}, currentEnergy = null }) {
  const validation = validateSkillPatch({
    skillId: skill?.skillId,
    expDelta,
    reason,
    category,
    modifiers,
    currentEnergy,
  });

  if (!validation.ok) {
    const error = new Error("Skill patch invalido.");
    error.statusCode = 400;
    error.details = validation;
    throw error;
  }

  return {
    validation,
    progression: applySkillExpPreview(skill, validation.effectiveExpDelta),
  };
}

module.exports = {
  EXP_TO_NEXT_BY_PHASE,
  MAGICAL_SKILL_IDS,
  PHASE_ORDER,
  SKILL_ACTIVITY_RANGES,
  applySkillExpPreview,
  calculateExpMultiplier,
  getEnergyExpMultiplier,
  getNextPhase,
  getRecommendedRange,
  previewSkillProgression,
  validateSkillPatch,
};
