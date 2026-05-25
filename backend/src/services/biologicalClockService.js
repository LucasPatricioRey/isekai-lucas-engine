const CATEGORY_COSTS = {
  sueno_profundo: {
    label: "sueno profundo",
    satietyPerHour: -1,
    energyPerHour: 12,
    physical: false,
  },
  dormir_incomodo: {
    label: "dormir incomodo/interrumpido",
    satietyPerHour: -1,
    energyPerHour: 8,
    physical: false,
  },
  descanso_acostado: {
    label: "descanso acostado",
    satietyPerHour: -2,
    energyPerHour: 6,
    physical: false,
  },
  descanso_sentado: {
    label: "descanso sentado",
    satietyPerHour: -2,
    energyPerHour: 4,
    physical: false,
  },
  charla_tranquila: {
    label: "charla tranquila",
    satietyPerHour: -2,
    energyPerHour: 1,
    physical: false,
  },
  comer_tranquilo: {
    label: "comer tranquilo",
    satietyPerHour: -2,
    energyPerHour: 2,
    physical: false,
  },
  descanso_general: {
    label: "descanso general",
    satietyPerHour: -2,
    energyPerHour: 4,
    physical: false,
  },
  actividad_normal: {
    label: "actividad normal",
    satietyPerHour: -3,
    energyPerHour: -4,
    physical: true,
  },
  trabajo_normal: {
    label: "trabajo normal",
    satietyPerHour: -3,
    energyPerHour: -6,
    physical: true,
  },
  viaje_caminata_suave: {
    label: "viaje/caminata suave",
    satietyPerHour: -3,
    energyPerHour: -5,
    physical: true,
  },
  esfuerzo_fuerte: {
    label: "esfuerzo fuerte",
    satietyPerHour: -7,
    energyPerHour: -11,
    physical: true,
  },
  trabajo_fuerte: {
    label: "trabajo fuerte",
    satietyPerHour: -7,
    energyPerHour: -11,
    physical: true,
  },
  entreno_moderado: {
    label: "entreno moderado",
    satietyPerHour: -5,
    energyPerHour: -8,
    physical: true,
  },
  entreno_intenso: {
    label: "entreno intenso",
    satietyPerHour: -8,
    energyPerHour: -14,
    physical: true,
  },
};

const CATEGORY_ALIASES = {
  sueno_profundo: "sueno_profundo",
  "sueno profundo": "sueno_profundo",
  dormir_incomodo: "dormir_incomodo",
  "dormir incomodo": "dormir_incomodo",
  "dormir incomodo/interrumpido": "dormir_incomodo",
  "dormir interrumpido": "dormir_incomodo",
  descanso_acostado: "descanso_acostado",
  "descanso acostado": "descanso_acostado",
  descanso_sentado: "descanso_sentado",
  "descanso sentado": "descanso_sentado",
  charla_tranquila: "charla_tranquila",
  "charla tranquila": "charla_tranquila",
  comer_tranquilo: "comer_tranquilo",
  "comer tranquilo": "comer_tranquilo",
  descanso_general: "descanso_general",
  "descanso general": "descanso_general",
  actividad_normal: "actividad_normal",
  "actividad normal": "actividad_normal",
  trabajo_normal: "trabajo_normal",
  "trabajo normal": "trabajo_normal",
  viaje_caminata_suave: "viaje_caminata_suave",
  "viaje caminata suave": "viaje_caminata_suave",
  "viaje/caminata suave": "viaje_caminata_suave",
  viaje: "viaje_caminata_suave",
  caminata_suave: "viaje_caminata_suave",
  "caminata suave": "viaje_caminata_suave",
  esfuerzo_fuerte: "esfuerzo_fuerte",
  "esfuerzo fuerte": "esfuerzo_fuerte",
  trabajo_fuerte: "trabajo_fuerte",
  "trabajo fuerte": "trabajo_fuerte",
  entreno_moderado: "entreno_moderado",
  "entreno moderado": "entreno_moderado",
  entrenamiento_moderado: "entreno_moderado",
  "entrenamiento moderado": "entreno_moderado",
  entreno_intenso: "entreno_intenso",
  "entreno intenso": "entreno_intenso",
  entrenamiento_intenso: "entreno_intenso",
  "entrenamiento intenso": "entreno_intenso",
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

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

function getCategoryCost(category) {
  const categoryId = normalizeCategory(category);
  const definition = CATEGORY_COSTS[categoryId];

  if (!definition) {
    const error = new Error(`Categoria biologica invalida: ${category}`);
    error.statusCode = 400;
    throw error;
  }

  return {
    categoryId,
    ...definition,
  };
}

function roundDelta(value) {
  if (value >= 0) return Math.round(value);
  return -Math.round(Math.abs(value));
}

function getFatigueMultiplier({ categoryDefinition, currentEnergy }) {
  if (!categoryDefinition.physical) return 1;
  if (!Number.isFinite(currentEnergy)) return 1;
  if (currentEnergy < 15) return 1.5;
  if (currentEnergy < 30) return 1.25;
  return 1;
}

function applyPhysicalMultiplier(value, multiplier) {
  if (value >= 0) return value;
  return value * multiplier;
}

function calculateActivityCost({ category, minutes, currentEnergy = null, currentSatiety = null }) {
  if (!Number.isFinite(Number(minutes)) || Number(minutes) < 0) {
    const error = new Error("minutes debe ser un numero mayor o igual a 0.");
    error.statusCode = 400;
    throw error;
  }

  const definition = getCategoryCost(category);
  const hours = Number(minutes) / 60;
  const fatigueMultiplier = getFatigueMultiplier({
    categoryDefinition: definition,
    currentEnergy: currentEnergy === null ? null : Number(currentEnergy),
  });

  const rawSatietyDelta = applyPhysicalMultiplier(definition.satietyPerHour * hours, fatigueMultiplier);
  const rawEnergyDelta = applyPhysicalMultiplier(definition.energyPerHour * hours, fatigueMultiplier);
  const satietyDelta = roundDelta(rawSatietyDelta);
  const energyDelta = roundDelta(rawEnergyDelta);

  const result = {
    categoryId: definition.categoryId,
    label: definition.label,
    minutes: Number(minutes),
    hours,
    perHour: {
      satiety: definition.satietyPerHour,
      energy: definition.energyPerHour,
    },
    fatigueMultiplier,
    rawDelta: {
      satiety: rawSatietyDelta,
      energy: rawEnergyDelta,
    },
    delta: {
      satiety: satietyDelta,
      energy: energyDelta,
    },
  };

  if (Number.isFinite(Number(currentSatiety)) && Number.isFinite(Number(currentEnergy))) {
    const projectedSatiety = clamp(Number(currentSatiety) + satietyDelta, 0, 100);
    const projectedEnergy = clamp(Number(currentEnergy) + energyDelta, 0, 100);

    result.projected = {
      satiety: {
        current: projectedSatiety,
        label: getSatietyLabel(projectedSatiety),
      },
      energy: {
        current: projectedEnergy,
        label: getEnergyLabel(projectedEnergy),
      },
    };
  }

  return result;
}

function getSatietyLabel(value) {
  const current = Number(value);
  if (current >= 71) return "satisfecho";
  if (current >= 51) return "hambre leve";
  if (current >= 21) return "hambre fuerte";
  if (current >= 1) return "debilidad/mareos";
  return "inanicion/riesgo de vida";
}

function getEnergyLabel(value) {
  const current = Number(value);
  if (current >= 70) return "rendimiento normal";
  if (current >= 40) return "cansancio leve/energia media";
  if (current >= 20) return "cansancio serio";
  if (current >= 1) return "agotamiento peligroso";
  return "colapso";
}

function previewBiologicalClockBlock({ activities, currentStatus }) {
  if (!Array.isArray(activities) || activities.length === 0) {
    const error = new Error("activities debe incluir al menos una actividad.");
    error.statusCode = 400;
    throw error;
  }

  const currentSatiety = Number(
    currentStatus?.satiety?.current ?? currentStatus?.satiety ?? currentStatus?.satietyCurrent
  );
  const currentEnergy = Number(
    currentStatus?.energy?.current ?? currentStatus?.energy ?? currentStatus?.energyCurrent
  );
  const hasCurrentStatus = Number.isFinite(currentSatiety) && Number.isFinite(currentEnergy);

  const details = [];
  let satietyDelta = 0;
  let energyDelta = 0;

  for (const activity of activities) {
    const cost = calculateActivityCost({
      category: activity.category,
      minutes: activity.minutes,
      currentEnergy: hasCurrentStatus ? currentEnergy + energyDelta : null,
      currentSatiety: hasCurrentStatus ? currentSatiety + satietyDelta : null,
    });

    details.push(cost);
    satietyDelta += cost.delta.satiety;
    energyDelta += cost.delta.energy;
  }

  const result = {
    activities: details,
    totalDelta: {
      satiety: satietyDelta,
      energy: energyDelta,
    },
  };

  if (hasCurrentStatus) {
    const projectedSatiety = clamp(currentSatiety + satietyDelta, 0, 100);
    const projectedEnergy = clamp(currentEnergy + energyDelta, 0, 100);

    result.before = {
      satiety: {
        current: currentSatiety,
        label: getSatietyLabel(currentSatiety),
      },
      energy: {
        current: currentEnergy,
        label: getEnergyLabel(currentEnergy),
      },
    };
    result.after = {
      satiety: {
        current: projectedSatiety,
        label: getSatietyLabel(projectedSatiety),
      },
      energy: {
        current: projectedEnergy,
        label: getEnergyLabel(projectedEnergy),
      },
    };
  }

  return result;
}

module.exports = {
  CATEGORY_COSTS,
  calculateActivityCost,
  getCategoryCost,
  getEnergyLabel,
  getSatietyLabel,
  normalizeCategory,
  previewBiologicalClockBlock,
};
