const crypto = require("node:crypto");

const CombatActionPreview = require("../models/CombatActionPreview");
const CombatEncounter = require("../models/CombatEncounter");
const CombatantState = require("../models/CombatantState");
const CombatLogEntry = require("../models/CombatLogEntry");
const CharacterMagicKnowledge = require("../models/CharacterMagicKnowledge");
const EnemyTemplate = require("../models/EnemyTemplate");
const Evidence = require("../models/Evidence");
const EventLog = require("../models/EventLog");
const Faction = require("../models/Faction");
const GameState = require("../models/GameState");
const InjuryRecord = require("../models/InjuryRecord");
const Item = require("../models/Item");
const MagicTechnique = require("../models/MagicTechnique");
const Mission = require("../models/Mission");
const WeaponProfile = require("../models/WeaponProfile");
const WorldEvent = require("../models/WorldEvent");
const { createAutomaticCheckpoint } = require("./checkpointService");
const { previewSkillProgression } = require("./skillProgressionService");
const { withSkillProgressDisplay } = require("../utils/skillProgressDisplay");

const ADVANCED_ACTIONS = [
  {
    actionType: "attack",
    label: "Atacar",
    economySlot: "mainAction",
    targetRequired: true,
    c4ApplySupported: true,
    notes: "Resuelve ataque fisico con backend rolls, dano, fatiga, moral y posible herida.",
  },
  {
    actionType: "defend",
    label: "Defender",
    economySlot: "mainAction",
    targetRequired: false,
    c4ApplySupported: true,
    notes: "Aplica postura defensiva y reduce riesgo del siguiente intercambio.",
  },
  {
    actionType: "block",
    label: "Bloquear",
    economySlot: "mainAction",
    targetRequired: false,
    c4ApplySupported: true,
    notes: "Aplica guardia de bloqueo; escala con skill_bloqueo y equipo defensivo disponible.",
  },
  {
    actionType: "dodge",
    label: "Esquivar",
    economySlot: "reaction",
    targetRequired: false,
    c4ApplySupported: true,
    notes: "Aplica postura evasiva; cuesta mas fatiga y escala con skill_esquiva, espacio y terreno.",
  },
  {
    actionType: "observe",
    label: "Observar",
    economySlot: "mainAction",
    targetRequired: false,
    c4ApplySupported: true,
    notes: "Consume accion para mejorar lectura visible sin infligir dano.",
  },
  {
    actionType: "move",
    label: "Moverse",
    economySlot: "moveAction",
    targetRequired: false,
    c4ApplySupported: true,
    notes: "Cambia distancia/posicion de forma simple.",
  },
  {
    actionType: "flee",
    label: "Retirarse",
    economySlot: "mainAction",
    targetRequired: false,
    c4ApplySupported: true,
    notes: "Resuelve intento de retirada con riesgo segun velocidad, fatiga y terreno.",
  },
  {
    actionType: "surrender",
    label: "Rendirse",
    economySlot: "mainAction",
    targetRequired: false,
    c4ApplySupported: true,
    notes: "Cierra el combate como rendicion; consecuencias narrativas/institucionales quedan fuera de C4.",
  },
  {
    actionType: "use_item",
    label: "Usar objeto",
    economySlot: "mainAction",
    targetRequired: false,
    c4ApplySupported: true,
    notes: "Consume objeto real de inventario para usos inmediatos soportados; en C8 solo tratamiento de campo sin restaurar vida.",
  },
  {
    actionType: "use_magic",
    label: "Usar magia",
    economySlot: "mainAction",
    targetRequired: true,
    c4ApplySupported: true,
    notes: "Resuelve un hechizo real solo si existe en knownSpells/conocimiento formal; consume MP y backend calcula dano/fallo.",
  },
  {
    actionType: "protect",
    label: "Proteger",
    economySlot: "mainAction",
    targetRequired: true,
    c4ApplySupported: false,
    notes: "Interposicion y aliados quedan para fase posterior.",
  },
  {
    actionType: "intimidate",
    label: "Intimidar",
    economySlot: "mainAction",
    targetRequired: true,
    c4ApplySupported: true,
    notes: "Resuelve presion de moral sin dano fisico.",
  },
  {
    actionType: "prepare",
    label: "Prepararse",
    economySlot: "mainAction",
    targetRequired: false,
    c4ApplySupported: true,
    notes: "Aplica preparacion simple para la siguiente accion.",
  },
];

const ACTIONS_BY_TYPE = new Map(ADVANCED_ACTIONS.map((action) => [action.actionType, action]));
const MANUAL_END_STATUSES = ["escaped", "deescalated", "interrupted", "cancelled"];
const COMBAT_MODES = new Set(["real", "sparring", "training"]);
const ENCOUNTER_TYPES = new Set([
  "sparring",
  "training",
  "minor_threat",
  "ambush",
  "pursuit",
  "defense",
  "territorial_creature",
  "predatory_hunt",
  "bandit_robbery",
  "mission_combat",
  "hazard_interruption",
  "unknown",
]);
const DEFENSIVE_CONDITIONS = ["defending", "blocking", "dodging"];
const ACTIONS_WITH_RESOLVED_TARGET = new Set(["attack", "observe", "move", "flee", "intimidate", "use_magic", "protect"]);

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeError(message, statusCode = 400, details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function hashObject(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value || {})).digest("hex");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function unique(values = []) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function normalizeCombatMode(value = "real") {
  return COMBAT_MODES.has(value) ? value : "real";
}

function normalizeEncounterType(value = "", { combatMode = "real", enemy = null, sourceMissionId = "", sourceEventId = "" } = {}) {
  const normalizedMode = normalizeCombatMode(combatMode);
  if (normalizedMode === "sparring") return "sparring";
  if (normalizedMode === "training") return "training";
  if (ENCOUNTER_TYPES.has(value)) return value;
  if (sourceMissionId) return "mission_combat";
  if (sourceEventId && enemy?.type === "human_hostile") return "ambush";

  const archetype = enemy?.behaviorProfile?.archetype || "";
  if (["territorial", "protective"].includes(archetype)) return "territorial_creature";
  if (["predatory", "hungry"].includes(archetype)) return "predatory_hunt";
  if (enemy?.type === "human_hostile" || ["opportunist", "ambusher"].includes(archetype)) return "bandit_robbery";
  if (enemy?.dangerLevel === "low" || enemy?.dangerRank === "low") return "minor_threat";
  return "unknown";
}

function isControlledCombat(encounter) {
  return ["sparring", "training"].includes(normalizeCombatMode(encounter?.flags?.combatMode || "real"));
}

function buildEncounterStartLegitimacy({ sourceEventId = "", sourceMissionId = "", sourceCommitmentId = "", reason = "" } = {}) {
  const linkedSources = [
    sourceEventId ? "world_event" : "",
    sourceMissionId ? "mission" : "",
    sourceCommitmentId ? "commitment" : "",
  ].filter(Boolean);
  const hasNarrativeReason = String(reason || "").trim().length >= 8;
  const warnings = [];

  if (linkedSources.length === 0 && !hasNarrativeReason) {
    warnings.push("El combate no tiene fuente formal ni motivo narrativo suficiente.");
  } else if (linkedSources.length === 0) {
    warnings.push("El combate depende solo de reason; no esta enlazado a evento, mision o compromiso.");
  }

  return {
    hasFormalSource: linkedSources.length > 0,
    linkedSources,
    hasNarrativeReason,
    warnings,
  };
}

function buildEncounterPolicy({
  enemy,
  encounterType = "",
  combatMode = "real",
  sourceEventId = "",
  sourceMissionId = "",
  sourceCommitmentId = "",
  reason = "",
} = {}) {
  const normalizedMode = normalizeCombatMode(combatMode);
  const normalizedType = normalizeEncounterType(encounterType, {
    combatMode: normalizedMode,
    enemy,
    sourceEventId,
    sourceMissionId,
  });
  const behavior = enemy?.behaviorProfile || {};
  const morale = enemy?.moraleProfile || {};
  const preferredActions = unique(behavior.preferredActions || []);
  const avoidsActions = unique(behavior.avoidsActions || []);
  const startLegitimacy = buildEncounterStartLegitimacy({
    sourceEventId,
    sourceMissionId,
    sourceCommitmentId,
    reason,
  });

  const profiles = {
    sparring: {
      enemyGoal: "test_skill_without_serious_harm",
      stakes: "controlled",
      preferredEndStates: ["deescalated", "interrupted"],
      escalation: "controlled",
      narrativeGuidance: "Narrar como practica controlada; no convertir golpes en dano letal.",
    },
    training: {
      enemyGoal: "teach_or_pressure_without_lethal_intent",
      stakes: "controlled",
      preferredEndStates: ["deescalated", "interrupted"],
      escalation: "controlled",
      narrativeGuidance: "Narrar como entrenamiento; consecuencias serias solo si el backend las crea.",
    },
    minor_threat: {
      enemyGoal: "survive_and_harass",
      stakes: "low",
      preferredEndStates: ["enemy_fled", "escaped", "won"],
      escalation: "low",
      narrativeGuidance: "Amenaza concreta pero menor; no inflar la escena a duelo epico.",
    },
    ambush: {
      enemyGoal: "gain_quick_advantage",
      stakes: "serious",
      preferredEndStates: ["won", "enemy_fled", "escaped"],
      escalation: "fast",
      narrativeGuidance: "La emboscada busca ventaja inicial; el backend decide si esa ventaja se sostiene.",
    },
    pursuit: {
      enemyGoal: "catch_or_drive_away",
      stakes: "moderate",
      preferredEndStates: ["escaped", "enemy_fled", "interrupted"],
      escalation: "mobile",
      narrativeGuidance: "La distancia y la retirada importan; no declarar escape sin resolucion backend.",
    },
    defense: {
      enemyGoal: "hold_ground_or_protect_area",
      stakes: "moderate",
      preferredEndStates: ["deescalated", "enemy_fled", "won"],
      escalation: "reactive",
      narrativeGuidance: "El enemigo reacciona a intrusion o amenaza; no asume maldad absoluta.",
    },
    territorial_creature: {
      enemyGoal: "drive_intruder_away",
      stakes: "moderate",
      preferredEndStates: ["enemy_fled", "escaped", "deescalated", "won"],
      escalation: "territorial",
      narrativeGuidance: "La criatura quiere espacio; si pierde ventaja puede abrir distancia o huir.",
    },
    predatory_hunt: {
      enemyGoal: "test_prey_and_retreat_if_costly",
      stakes: "serious",
      preferredEndStates: ["won", "enemy_fled", "escaped"],
      escalation: "predatory",
      narrativeGuidance: "El depredador prueba debilidad; no pelea hasta morir si la presa es demasiado costosa.",
    },
    bandit_robbery: {
      enemyGoal: "intimidate_take_value_and_escape",
      stakes: "serious_social",
      preferredEndStates: ["enemy_fled", "surrendered", "escaped", "won"],
      escalation: "coercive",
      narrativeGuidance: "El humano hostil prefiere ventaja, intimidacion o retirada antes que morir por botin.",
    },
    mission_combat: {
      enemyGoal: "resolve_mission_threat",
      stakes: "mission",
      preferredEndStates: ["won", "enemy_fled", "escaped"],
      escalation: "mission_bound",
      narrativeGuidance: "Conectar consecuencias solo con mision/evento formal; no inventar recompensas.",
    },
    hazard_interruption: {
      enemyGoal: "interrupt_and_create_risk",
      stakes: "situational",
      preferredEndStates: ["interrupted", "escaped", "enemy_fled"],
      escalation: "situational",
      narrativeGuidance: "La escena existe por peligro ambiental o interrupcion; no prolongarla sin causa.",
    },
    unknown: {
      enemyGoal: "survive_and_act_by_profile",
      stakes: "unknown",
      preferredEndStates: ["won", "enemy_fled", "escaped", "interrupted"],
      escalation: "profile_driven",
      narrativeGuidance: "Usar solo senales del backend y perfil enemigo.",
    },
  };

  return {
    version: "C12",
    encounterType: normalizedType,
    combatMode: normalizedMode,
    enemyArchetype: behavior.archetype || "unknown",
    enemyGoal: profiles[normalizedType]?.enemyGoal || profiles.unknown.enemyGoal,
    stakes: profiles[normalizedType]?.stakes || profiles.unknown.stakes,
    escalation: profiles[normalizedType]?.escalation || profiles.unknown.escalation,
    preferredEndStates: profiles[normalizedType]?.preferredEndStates || profiles.unknown.preferredEndStates,
    preferredNpcActions: preferredActions,
    avoidsNpcActions: avoidsActions,
    surrenderPossible: Boolean(morale.surrenderPossible),
    moraleBreaksAt: numberOr(morale.breaksAt, 0),
    moraleFleesAt: numberOr(morale.fleesAt, 0),
    startLegitimacy,
    narrativeGuidance: profiles[normalizedType]?.narrativeGuidance || profiles.unknown.narrativeGuidance,
    gptBoundary: "El GPT narra los resultados devueltos por backend; no decide dano, escape, moral, heridas, loot ni victoria.",
  };
}

function createDeterministicRng(seed) {
  const hash = crypto.createHash("sha256").update(String(seed || "combat")).digest();
  let state = hash.readUInt32LE(0) || 0x9e3779b9;

  return function nextRandom() {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rollDie(rng, sides) {
  return 1 + Math.floor(rng() * sides);
}

function rollRange(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function getSkillLevel(gameState, skillIds = []) {
  const skills = gameState?.skills || [];
  for (const skillId of skillIds) {
    const found = skills.find((skill) => skill.skillId === skillId);
    if (found) return numberOr(found.level, 0);
  }
  return 0;
}

function getDistance(encounter, actorId, targetId) {
  return encounter?.distanceMap?.[actorId]?.[targetId] || "near";
}

function setDistance(encounter, actorId, targetId, distanceBand) {
  const currentMap = encounter.distanceMap || {};
  currentMap[actorId] = {
    ...(currentMap[actorId] || {}),
    [targetId]: distanceBand,
  };
  currentMap[targetId] = {
    ...(currentMap[targetId] || {}),
    [actorId]: distanceBand,
  };
  encounter.distanceMap = currentMap;
}

function getCombatantById(encounter, combatantId) {
  return (encounter.participants || []).find((entry) => entry.combatantId === combatantId) || null;
}

function updateEncounterCombatant(encounter, updatedCombatant) {
  encounter.participants = (encounter.participants || []).map((entry) =>
    entry.combatantId === updatedCombatant.combatantId ? updatedCombatant : entry
  );
}

function adjustResource(pool = {}, delta = 0) {
  const max = numberOr(pool.max, numberOr(pool.current, 0));
  const before = numberOr(pool.current, 0);
  const after = clamp(before + delta, 0, max);
  return {
    before,
    after,
    delta: after - before,
    pool: {
      current: after,
      max,
    },
  };
}

function syncEnemyStatusFromCombatant(encounter, combatant) {
  if (!combatant || combatant.side !== "enemy") return;
  encounter.enemyStatus = {
    ...(encounter.enemyStatus || {}),
    life: {
      current: numberOr(combatant.hp?.current, 0),
      max: numberOr(combatant.hp?.max, numberOr(combatant.hp?.current, 0)),
    },
    morale: {
      current: numberOr(combatant.morale?.current, 0),
      max: numberOr(combatant.morale?.max, numberOr(combatant.morale?.current, 0)),
    },
    conditions: combatant.conditions || [],
  };
}

function getNextActorId(encounter, side) {
  const participants = encounter.participants || [];
  if (side === "enemy") {
    return participants.find((entry) => entry.side === "enemy" && entry.isAlive !== false)?.combatantId || "";
  }
  return participants.find((entry) => entry.side === "lucas" && entry.isAlive !== false)?.combatantId || "";
}

function getWeaponFallback(itemId = "") {
  const normalized = String(itemId || "").toLowerCase();
  if (normalized.includes("daga")) {
    return {
      weaponProfileId: "fallback_dagger",
      itemId,
      name: "Daga",
      weaponType: "dagger",
      rangeBand: "engaged",
      damageType: "pierce",
      baseDamage: 4,
      accuracyModifier: 1,
      defenseModifier: 0,
      speedModifier: 1,
      fatigueCostModifier: 0,
      requiredSkillId: "skill_daga",
      traits: ["light", "fast"],
    };
  }

  return {
    weaponProfileId: "fallback_unarmed",
    itemId: "",
    name: "Golpe sin armas",
    weaponType: "unarmed",
    rangeBand: "engaged",
    damageType: "blunt",
    baseDamage: 2,
    accuracyModifier: 0,
    defenseModifier: 0,
    speedModifier: 0,
    fatigueCostModifier: 0,
    requiredSkillId: "skill_pelea_sin_armas",
    traits: ["nonlethal"],
  };
}

async function getWeaponProfileForCombatant(combatant) {
  const equippedWeaponIds = combatant?.equippedWeaponIds || [];
  const equippedWeaponId =
    equippedWeaponIds.find((itemId) => {
      const normalized = String(itemId || "").toLowerCase();
      return !normalized.includes("escudo") && !normalized.includes("shield");
    }) ||
    equippedWeaponIds[0] ||
    "";
  if (!equippedWeaponId) return getWeaponFallback("");

  const [profile, item] = await Promise.all([
    WeaponProfile.findOne({ itemId: equippedWeaponId }).lean(),
    Item.findOne({ itemId: equippedWeaponId }).lean(),
  ]);

  if (profile) return profile;
  if (item?.type === "weapon") return getWeaponFallback(item.itemId);
  return getWeaponFallback("");
}

function getEnemyDefenseBonus(enemy, defenseTypes = []) {
  const types = new Set(defenseTypes);
  return (enemy?.defenses || [])
    .filter((defense) => types.has(defense.defenseType))
    .reduce((best, defense) => Math.max(best, numberOr(defense.modifier, 0)), 0);
}

function getBlockingEquipmentModifier(combatant) {
  const equippedIds = (combatant?.equippedWeaponIds || []).map((itemId) => String(itemId || "").toLowerCase());
  if (equippedIds.some((itemId) => itemId.includes("escudo") || itemId.includes("shield"))) return 3;
  if (equippedIds.some((itemId) => itemId.includes("daga") || itemId.includes("sword") || itemId.includes("espada"))) return 1;
  return 0;
}

function getArmorProfile(armorProfileId = "") {
  const normalized = String(armorProfileId || "").toLowerCase();
  if (!normalized) {
    return {
      armorProfileId: "",
      defenseModifier: 0,
      damageReduction: 0,
      dodgeModifier: 0,
      speedModifier: 0,
      fatiguePenalty: 0,
    };
  }
  if (normalized.includes("escudo") || normalized.includes("shield")) {
    return {
      armorProfileId,
      defenseModifier: 2,
      damageReduction: 1,
      dodgeModifier: -1,
      speedModifier: -1,
      fatiguePenalty: 1,
    };
  }
  if (normalized.includes("cuero") || normalized.includes("leather") || normalized.includes("piel")) {
    return {
      armorProfileId,
      defenseModifier: 1,
      damageReduction: 2,
      dodgeModifier: -1,
      speedModifier: -1,
      fatiguePenalty: 1,
    };
  }
  if (normalized.includes("armadura") || normalized.includes("armor") || normalized.includes("mail")) {
    return {
      armorProfileId,
      defenseModifier: 2,
      damageReduction: 3,
      dodgeModifier: -2,
      speedModifier: -2,
      fatiguePenalty: 2,
    };
  }
  if (normalized.includes("ropa") || normalized.includes("clothes") || normalized.includes("capa")) {
    return {
      armorProfileId,
      defenseModifier: 0,
      damageReduction: 0,
      dodgeModifier: 0,
      speedModifier: 0,
      fatiguePenalty: 0,
    };
  }
  if (normalized.includes("botas") || normalized.includes("boots")) {
    return {
      armorProfileId,
      defenseModifier: 0,
      damageReduction: 0,
      dodgeModifier: 0,
      speedModifier: 0,
      fatiguePenalty: 0,
    };
  }
  return {
    armorProfileId,
    defenseModifier: 0,
    damageReduction: 0,
    dodgeModifier: 0,
    speedModifier: 0,
    fatiguePenalty: 0,
  };
}

function chooseBestArmorProfileId(equippedItemIds = []) {
  return equippedItemIds
    .map((itemId) => getArmorProfile(itemId))
    .sort((left, right) => {
      const leftScore = left.damageReduction * 3 + left.defenseModifier - left.fatiguePenalty;
      const rightScore = right.damageReduction * 3 + right.defenseModifier - right.fatiguePenalty;
      return rightScore - leftScore;
    })[0]?.armorProfileId || "";
}

function getInventoryEntry(gameState, itemId) {
  return (gameState?.inventory || []).find(
    (entry) => entry.itemId === itemId && numberOr(entry.quantity, 0) > 0
  );
}

function consumeInventoryItem(gameState, itemId, quantity = 1) {
  const entry = getInventoryEntry(gameState, itemId);
  if (!entry) return null;

  const before = numberOr(entry.quantity, 0);
  const consumed = clamp(quantity, 1, before);
  const after = before - consumed;

  if (after > 0) {
    entry.quantity = after;
  } else {
    gameState.inventory = (gameState.inventory || []).filter((candidate) => candidate.itemId !== itemId);
  }

  gameState.markModified("inventory");
  return {
    itemId,
    before,
    after,
    delta: after - before,
    consumed,
  };
}

function getCombatItemUseDefinition(item) {
  const tags = new Set(item?.tags || []);
  const subtype = item?.subtype || "";
  if (!item) {
    return { supported: false, reason: "El itemId no existe en el catalogo." };
  }
  if (item.type !== "medicine") {
    return { supported: false, reason: `El objeto ${item.itemId} no es medicina usable en combate.` };
  }
  if (subtype === "bandage" || tags.has("bandage")) {
    return {
      supported: true,
      itemUseType: "field_dressing",
      treatmentType: "field_dressing",
      quality: subtype === "bandage_kit" || tags.has("kit") ? "good" : "basic",
      requiresInjuryId: true,
    };
  }
  if (subtype === "ointment" || tags.has("ointment")) {
    return {
      supported: true,
      itemUseType: "ointment",
      treatmentType: "ointment",
      quality: "basic",
      requiresInjuryId: true,
    };
  }

  return {
    supported: false,
    reason: `El objeto ${item.itemId} no tiene uso inmediato de combate soportado.`,
  };
}

function getCombatSkillActionCounts(encounter) {
  return encounter?.flags?.combatSkillActionCounts || {};
}

function incrementCombatSkillActionCount(encounter, key) {
  encounter.flags = {
    ...(encounter.flags || {}),
    combatSkillActionCounts: {
      ...getCombatSkillActionCounts(encounter),
      [key]: numberOr(getCombatSkillActionCounts(encounter)[key], 0) + 1,
    },
  };
  encounter.markModified("flags");
}

function getGameStateSkill(gameState, skillId) {
  return (gameState?.skills || []).find((skill) => skill.skillId === skillId) || null;
}

function applySkillProgressionToGameState(skill, progression) {
  if (!skill || !progression?.after) return;
  skill.phase = progression.after.phase;
  skill.level = progression.after.level;
  skill.exp = progression.after.exp;
  skill.expToNext = progression.after.expToNext;
}

function buildCombatSkillCandidate({ encounter, resolution, weaponProfile = null }) {
  const actionType = resolution?.actionType || "";
  if (actionType === "attack") {
    const requiredSkillId = weaponProfile?.requiredSkillId || "";
    const skillId = ["skill_daga", "skill_pelea_sin_armas"].includes(requiredSkillId)
      ? requiredSkillId
      : "skill_tactica_basica";
    return {
      skillId,
      category: "combate",
      expDelta: resolution.result?.hit ? 5 : 3,
      reason: `Combate avanzado: ataque ${weaponProfile?.name || "sin perfil"}.`,
    };
  }
  if (actionType === "block") {
    return {
      skillId: "skill_bloqueo",
      category: "combate_bloqueos",
      expDelta: 4,
      reason: "Combate avanzado: bloqueo activo.",
    };
  }
  if (actionType === "dodge") {
    return {
      skillId: "skill_esquiva",
      category: "combate_esquivas",
      expDelta: 5,
      reason: "Combate avanzado: esquiva activa.",
    };
  }
  if (actionType === "flee") {
    return {
      skillId: "skill_retirada",
      category: "huida_controlada",
      expDelta: resolution.result?.escaped ? 6 : 4,
      reason: "Combate avanzado: retirada bajo presion.",
    };
  }
  if (actionType === "use_magic") {
    return {
      skillId: "skill_magia_ofensiva",
      category: "uso_hechizo_ofensivo_conocido",
      expDelta: resolution.result?.hit ? 4 : 2,
      reason: "Combate avanzado: uso de hechizo ofensivo conocido.",
    };
  }
  if (["defend", "observe", "move", "intimidate", "prepare"].includes(actionType)) {
    const expByAction = {
      defend: 2,
      observe: 3,
      move: 2,
      intimidate: 4,
      prepare: 2,
    };
    return {
      skillId: "skill_tactica_basica",
      category: "combate",
      expDelta: expByAction[actionType] || 2,
      reason: `Combate avanzado: ${actionType}.`,
    };
  }

  return null;
}

function applyCombatSkillAward({ gameState, encounter, actor, resolution, weaponProfile = null }) {
  if (!actor || actor.side !== "lucas") return [];
  const candidate = buildCombatSkillCandidate({ encounter, resolution, weaponProfile });
  if (!candidate) return [];

  const skill = getGameStateSkill(gameState, candidate.skillId);
  if (!skill) {
    return [
      {
        skillId: candidate.skillId,
        skipped: true,
        reason: "La habilidad tecnica no existe en GameState.",
      },
    ];
  }

  const key = `${candidate.skillId}:${candidate.category}`;
  const previousSimilarCount = numberOr(getCombatSkillActionCounts(encounter)[key], 0);
  const modifiers = {
    realRisk: previousSimilarCount === 0 && !isControlledCombat(encounter),
    newContext: previousSimilarCount === 0,
  };
  const preview = previewSkillProgression({
    skill,
    expDelta: candidate.expDelta,
    reason: candidate.reason,
    category: candidate.category,
    modifiers,
    currentEnergy: gameState.lucasStatus?.energy?.current,
    durationMinutes: 1,
    antiFarmingContext: {
      previousSimilarCount,
    },
  });

  applySkillProgressionToGameState(skill, preview.progression);
  gameState.markModified("skills");
  incrementCombatSkillActionCount(encounter, key);

  return [
    withSkillProgressDisplay({
      skillId: candidate.skillId,
      name: skill.name,
      category: candidate.category,
      reason: candidate.reason,
      effectiveExpDelta: preview.validation?.effectiveExpDelta || 0,
      expDelta: preview.validation?.effectiveExpDelta || 0,
      before: preview.progression?.before || null,
      after: preview.progression?.after || null,
      levelUps: preview.progression?.levelUps || [],
      previousSimilarCount,
      modifiers,
      validation: preview.validation,
      progression: preview.progression,
    }),
  ];
}

function getCombatantStats({ combatant, enemy, gameState, weaponProfile = null }) {
  if (combatant.side === "lucas") {
    const strength = getSkillLevel(gameState, ["skill_fuerza"]);
    const agility = getSkillLevel(gameState, ["skill_agilidad"]);
    const perception = getSkillLevel(gameState, ["skill_percepcion"]);
    const resistance = getSkillLevel(gameState, ["skill_resistencia", "skill_vitalidad"]);
    const dodgeSkill = getSkillLevel(gameState, ["skill_esquiva"]);
    const blockSkill = getSkillLevel(gameState, ["skill_bloqueo"]);
    const retreatSkill = getSkillLevel(gameState, ["skill_retirada"]);
    const tacticsSkill = getSkillLevel(gameState, ["skill_tactica_basica"]);
    const weaponSkill = getSkillLevel(gameState, [weaponProfile?.requiredSkillId, "skill_daga", "skill_pelea_sin_armas"].filter(Boolean));
    const armorProfile = getArmorProfile(combatant.armorProfileId);
    const weaponDefenseModifier = numberOr(weaponProfile?.defenseModifier, 0);
    const weaponSpeedModifier = numberOr(weaponProfile?.speedModifier, 0);
    return {
      attack: strength + weaponSkill + Math.floor(tacticsSkill / 3),
      defense: resistance + Math.floor(blockSkill / 2) + Math.floor(tacticsSkill / 3) + weaponDefenseModifier + armorProfile.defenseModifier,
      agility: agility + Math.floor(dodgeSkill / 2) + weaponSpeedModifier + armorProfile.dodgeModifier,
      perception: perception + Math.floor(tacticsSkill / 4),
      endurance: resistance,
      morale: numberOr(combatant.morale?.current, 100),
      speed: agility + Math.floor(retreatSkill / 2) + weaponSpeedModifier + armorProfile.speedModifier,
      weaponSkill,
      dodgeSkill,
      blockSkill,
      retreatSkill,
      tacticsSkill,
      weaponDefenseModifier,
      weaponSpeedModifier,
      armorProfileId: armorProfile.armorProfileId,
      armorDefenseModifier: armorProfile.defenseModifier,
      armorDamageReduction: armorProfile.damageReduction,
      armorFatiguePenalty: armorProfile.fatiguePenalty,
    };
  }

  const baseStats = enemy?.baseStats || {};
  const dodgeBonus = getEnemyDefenseBonus(enemy, ["dodge", "instinct"]);
  const blockBonus = getEnemyDefenseBonus(enemy, ["block", "armor", "resistance"]);
  const armorReduction = Math.floor(getEnemyDefenseBonus(enemy, ["armor", "resistance"]) / 2);
  const baseSpeed = numberOr(baseStats.speed, 0) || numberOr(enemy?.movement?.speed, 0) || numberOr(baseStats.agility, 0);
  return {
    attack: numberOr(baseStats.attack, 0),
    defense: numberOr(baseStats.defense, 0) + blockBonus,
    agility: numberOr(baseStats.agility, 0) + dodgeBonus,
    perception: numberOr(baseStats.perception, 0),
    endurance: numberOr(baseStats.endurance, numberOr(baseStats.defense, 0)),
    morale: numberOr(baseStats.morale, numberOr(combatant.morale?.current, 0)),
    speed: baseSpeed,
    weaponSkill: 0,
    dodgeSkill: dodgeBonus,
    blockSkill: blockBonus,
    retreatSkill: baseSpeed,
    tacticsSkill: numberOr(baseStats.awareness, numberOr(baseStats.perception, 0)),
    armorProfileId: "",
    armorDefenseModifier: blockBonus,
    armorDamageReduction: armorReduction,
    armorFatiguePenalty: 0,
  };
}

function getDistanceAttackModifier(distanceBand, weaponProfile) {
  const weaponRange = weaponProfile?.rangeBand || "engaged";
  if (distanceBand === weaponRange) return 2;
  if (distanceBand === "engaged" && weaponRange === "near") return 0;
  if (distanceBand === "near" && ["engaged", "short"].includes(weaponRange)) return -2;
  if (distanceBand === "short" && weaponRange === "near") return -4;
  if (["medium", "far", "out_of_sight"].includes(distanceBand) && !["medium", "far"].includes(weaponRange)) return -8;
  return -3;
}

function getTerrainModifier(encounter, combatant) {
  const terrainTags = encounter.terrainTags || [];
  let modifier = 0;
  if (terrainTags.includes("mud")) modifier -= 1;
  if (terrainTags.includes("roots")) modifier -= 1;
  if (terrainTags.includes("narrow_path") && combatant.side === "enemy") modifier += 1;
  return modifier;
}

function getFatigueModifier(combatant) {
  const fatigue = numberOr(combatant.combatFatigue, 0);
  if (fatigue >= 30) return -6;
  if (fatigue >= 20) return -4;
  if (fatigue >= 10) return -2;
  return 0;
}

function getDodgeTerrainModifier(encounter, combatant) {
  const terrainTags = encounter?.terrainTags || [];
  let modifier = 0;
  if (terrainTags.includes("mud")) modifier -= 2;
  if (terrainTags.includes("roots")) modifier -= 2;
  if (terrainTags.includes("uneven_ground")) modifier -= 1;
  if (terrainTags.includes("narrow_path")) modifier -= 1;
  if (terrainTags.includes("cover") && combatant.positionState === "covered") modifier += 1;
  return modifier;
}

function getStanceModifier(combatant, mode, stats = {}, encounter = null) {
  const conditions = combatant.conditions || [];
  let modifier = 0;

  if (mode === "defense") {
    if (conditions.includes("defending")) modifier += 3 + Math.floor(numberOr(stats.tacticsSkill, 0) / 3);
    if (conditions.includes("blocking")) {
      modifier += 4 + Math.floor(numberOr(stats.blockSkill, 0) / 2) + getBlockingEquipmentModifier(combatant);
    }
    if (conditions.includes("dodging")) {
      modifier += 5 + Math.floor(numberOr(stats.dodgeSkill, 0) / 2) + getDodgeTerrainModifier(encounter, combatant);
    }
    if (conditions.includes("exposed")) modifier -= 2;
  }

  if (mode === "attack") {
    if (conditions.includes("prepared")) modifier += 2 + Math.floor(numberOr(stats.tacticsSkill, 0) / 4);
    if (conditions.includes("focused")) modifier += 1;
  }

  if (combatant.positionState === "off_balance") modifier -= 2;
  if (combatant.positionState === "prone") modifier -= 4;
  if (combatant.positionState === "cornered" && mode === "defense") modifier -= 2;

  return modifier;
}

function classifyHit(hitMargin) {
  if (hitMargin <= -8) return "bad_miss";
  if (hitMargin <= -1) return "miss";
  if (hitMargin <= 4) return "glancing_hit";
  if (hitMargin <= 11) return "clean_hit";
  if (hitMargin <= 18) return "strong_hit";
  return "critical_hit";
}

function getDamageBonusFromHit(resultBand, hitMargin) {
  const margin = Math.max(0, numberOr(hitMargin, 0));
  if (resultBand === "glancing_hit") return 0;
  if (resultBand === "clean_hit") return clamp(Math.floor(margin / 4), 0, 3);
  if (resultBand === "strong_hit") return clamp(3 + Math.floor(Math.max(0, margin - 12) / 5), 3, 6);
  if (resultBand === "critical_hit") return clamp(6 + Math.floor(Math.max(0, margin - 19) / 6), 6, 10);
  return 0;
}

function getBodyPartFromRoll(roll) {
  if (roll <= 2) return "left_leg";
  if (roll <= 4) return "right_leg";
  if (roll <= 6) return "left_arm";
  if (roll <= 8) return "right_arm";
  if (roll <= 18) return "torso";
  return "head";
}

function mapDamageTypeToInjuryType(damageType) {
  if (damageType === "cut") return "cut";
  if (damageType === "pierce") return "pierce";
  if (damageType === "blunt") return "blunt";
  if (damageType === "burn") return "burn";
  if (damageType === "magic") return "magic";
  if (damageType === "mixed") return "other";
  return "other";
}

function maybeCreateInjury({ rng, target, resultBand, finalDamage, damageType, encounter, actionId }) {
  if (finalDamage <= 0) return null;

  const injuryRoll = rollDie(rng, 20);
  const severeHit = ["strong_hit", "critical_hit"].includes(resultBand);
  const threshold = resultBand === "critical_hit" ? 8 : severeHit ? 12 : finalDamage >= 6 ? 16 : 21;
  if (injuryRoll < threshold) {
    return {
      injuryRoll,
      injury: null,
    };
  }

  const severity = resultBand === "critical_hit" || finalDamage >= 10 ? "moderate" : "minor";
  const bodyPart = getBodyPartFromRoll(rollDie(rng, 20));
  const injuryType = mapDamageTypeToInjuryType(damageType);
  const injuryId = createId("injury_combat");

  return {
    injuryRoll,
    injury: {
      injuryId,
      gameId: encounter.gameId,
      encounterId: encounter.encounterId,
      targetType: target.type === "character" ? "character" : target.type,
      targetId: target.characterId || target.npcId || target.enemyInstanceId || target.combatantId,
      bodyPart,
      injuryType,
      severity,
      bleeding: injuryType === "cut" || injuryType === "pierce" ? (severity === "moderate" ? 2 : 1) : 0,
      pain: severity === "moderate" ? 3 : 1,
      mobilityPenalty: ["left_leg", "right_leg", "foot"].includes(bodyPart) ? (severity === "moderate" ? -2 : -1) : 0,
      actionPenalty: severity === "moderate" ? -2 : -1,
      concentrationPenalty: severity === "moderate" ? -1 : 0,
      untreatedRisk: severity === "moderate" ? "medium" : "low",
      requiresTreatment: severity === "moderate",
      createdDay: encounter.startedDay,
      createdTime: encounter.startedTime,
      createdByActionId: actionId,
      expectedRecoveryDays: severity === "moderate" ? 4 : 1,
      status: "active",
      notes: `Herida de combate (${injuryType}) por ${resultBand}.`,
    },
  };
}

function toLegacyLucasInjury(injury) {
  if (!injury) return null;
  return {
    injuryId: injury.injuryId,
    location: injury.bodyPart,
    severity: injury.severity === "moderate" ? "moderada" : "leve",
    description: injury.notes || `Herida de combate en ${injury.bodyPart}.`,
    effects: [
      injury.actionPenalty ? `accion ${injury.actionPenalty}` : "",
      injury.mobilityPenalty ? `movilidad ${injury.mobilityPenalty}` : "",
      injury.bleeding ? "sangrado leve" : "",
    ].filter(Boolean),
    createdDay: injury.createdDay,
    createdTime: injury.createdTime,
  };
}

function fatigueToEnergyCost(fatigue) {
  const value = numberOr(fatigue, 0);
  if (value <= 0) return 0;
  if (value <= 5) return -1;
  if (value <= 12) return -3;
  if (value <= 20) return -6;
  if (value <= 35) return -10;
  return -15;
}

function buildVisibleState(combatant) {
  const hpCurrent = numberOr(combatant.hp?.current, 0);
  const hpMax = Math.max(1, numberOr(combatant.hp?.max, 1));
  const moraleCurrent = numberOr(combatant.morale?.current, 0);
  const hpRatio = hpCurrent / hpMax;

  return {
    combatantId: combatant.combatantId,
    name: combatant.name,
    side: combatant.side,
    health: hpRatio <= 0 ? "caido" : hpRatio < 0.25 ? "muy herido" : hpRatio < 0.5 ? "herido" : hpRatio < 0.8 ? "tocado" : "estable",
    morale: moraleCurrent <= 0 ? "roto" : moraleCurrent < 10 ? "asustado" : moraleCurrent < 25 ? "dudando" : "firme",
    positionState: combatant.positionState || "standing",
    conditions: combatant.conditions || [],
  };
}

function getEnemyHp(enemy) {
  return Number(enemy?.baseStats?.hp || enemy?.baseStats?.life || 1);
}

function getEnemyMorale(enemy) {
  return Number(enemy?.baseStats?.morale || 1);
}

function isWeaponLikeItemId(itemId = "") {
  const normalized = String(itemId || "").toLowerCase();
  return [
    "daga",
    "cuchillo",
    "baston",
    "garrote",
    "espada",
    "arco",
    "escudo",
    "sword",
    "dagger",
    "knife",
    "staff",
    "club",
    "bow",
    "shield",
  ].some((token) => normalized.includes(token));
}

function getLucasEquippedWeaponIds(gameState) {
  return (gameState.inventory || [])
    .filter((entry) => entry.equipped && isWeaponLikeItemId(entry.itemId))
    .map((entry) => entry.itemId);
}

function getLucasArmorProfileId(gameState) {
  const equippedIds = (gameState.inventory || [])
    .filter((entry) => entry.equipped)
    .map((entry) => entry.itemId);
  return chooseBestArmorProfileId(equippedIds);
}

function buildCombatantIds(encounterId, enemyId) {
  return {
    lucas: `${encounterId}_lucas`,
    enemy: `${encounterId}_${enemyId || "enemy"}_1`,
  };
}

function buildInitialParticipants({ encounterId, gameState, enemy }) {
  const ids = buildCombatantIds(encounterId, enemy.enemyId);
  const lucasLife = gameState.lucasStatus?.life || {};
  const lucasMp = gameState.lucasStatus?.mp || {};
  const enemyHp = getEnemyHp(enemy);
  const enemyMorale = getEnemyMorale(enemy);

  return [
    {
      combatantId: ids.lucas,
      encounterId,
      gameId: gameState.gameId,
      side: "lucas",
      characterId: "char_lucas",
      name: "Lucas",
      type: "character",
      hp: {
        current: Number(lucasLife.current || 0),
        max: Number(lucasLife.max || lucasLife.current || 0),
      },
      mp: {
        current: Number(lucasMp.current || 0),
        max: Number(lucasMp.max || lucasMp.current || 0),
      },
      morale: {
        current: 100,
        max: 100,
      },
      equippedWeaponIds: getLucasEquippedWeaponIds(gameState),
      armorProfileId: getLucasArmorProfileId(gameState),
    },
    {
      combatantId: ids.enemy,
      encounterId,
      gameId: gameState.gameId,
      side: "enemy",
      enemyInstanceId: `${enemy.enemyId}_instance_1`,
      enemyTemplateId: enemy.enemyId,
      name: enemy.name,
      type: "enemy",
      hp: {
        current: enemyHp,
        max: enemyHp,
      },
      morale: {
        current: enemyMorale,
        max: enemyMorale,
      },
      stance: enemy.behaviorProfile?.archetype || "neutral",
      intent: enemy.behaviorProfile?.notes || "",
    },
  ];
}

function summarizeEncounter(encounter, extra = {}) {
  if (!encounter) return null;

  return {
    encounterId: encounter.encounterId,
    gameId: encounter.gameId,
    status: encounter.status,
    phase: encounter.phase || "player_turn",
    locationId: encounter.locationId,
    sourceEventId: encounter.sourceEventId || "",
    sourceMissionId: encounter.sourceMissionId || "",
    sourceCommitmentId: encounter.sourceCommitmentId || "",
    enemyId: encounter.enemyId,
    enemyName: encounter.enemyName,
    encounterType: encounter.flags?.encounterType || "unknown",
    encounterPolicy: encounter.flags?.encounterPolicy || null,
    latestNpcDecision: encounter.flags?.latestNpcDecision || null,
    enemyStatus: encounter.enemyStatus || {},
    currentRound: encounter.currentRound || encounter.round || 1,
    round: encounter.round || encounter.currentRound || 1,
    encounterVersion: encounter.encounterVersion || 1,
    currentActorId: encounter.currentActorId || "",
    participants: encounter.participants || [],
    turnOrder: encounter.turnOrder || [],
    distanceMap: encounter.distanceMap || {},
    lootState: encounter.lootState || {},
    evidenceState: encounter.evidenceState || {},
    startedDay: encounter.startedDay,
    startedTime: encounter.startedTime,
    endedDay: encounter.endedDay || null,
    endedTime: encounter.endedTime || "",
    reason: encounter.reason || "",
    flags: encounter.flags || {},
    ...extra,
  };
}

function summarizeEnemy(enemy) {
  if (!enemy) return null;
  return {
    enemyId: enemy.enemyId,
    name: enemy.name,
    species: enemy.species || enemy.type,
    type: enemy.type,
    dangerLevel: enemy.dangerLevel,
    dangerRank: enemy.dangerRank || enemy.dangerLevel,
    rankHint: enemy.rankHint,
    baseStats: enemy.baseStats,
    behaviorProfile: enemy.behaviorProfile || {},
    moraleProfile: enemy.moraleProfile || {},
    lootProfile: enemy.lootProfile || {},
    evidenceProfile: enemy.evidenceProfile || {},
    rewardPolicy: enemy.rewardPolicy || "",
    tags: enemy.tags || [],
  };
}

const LOOT_EVIDENCE_READY_STATUSES = ["won", "enemy_fled"];
const EVIDENCE_TYPES = new Set(["sample", "trace", "note", "object", "document", "testimony", "other"]);

function normalizeEvidenceType(value = "other") {
  if (EVIDENCE_TYPES.has(value)) return value;
  const text = String(value || "").toLowerCase();
  if (text.includes("hair") || text.includes("blood") || text.includes("sample") || text.includes("claw")) return "sample";
  if (text.includes("track") || text.includes("trace") || text.includes("mark")) return "trace";
  if (text.includes("note")) return "note";
  if (text.includes("document")) return "document";
  if (text.includes("testimony")) return "testimony";
  return "other";
}

function normalizeProofStatus(value, fallback = "unverified") {
  if (["none", "unverified", "partial", "verified"].includes(value)) return value;
  return fallback;
}

function getCombatGameTime(gameState, encounter) {
  return {
    day: gameState?.currentDay || encounter?.endedDay || encounter?.startedDay || null,
    time: gameState?.time || encounter?.endedTime || encounter?.startedTime || "",
  };
}

function getLootBlockingReasons(encounter) {
  const reasons = [];
  if (!encounter) return ["No existe el encuentro."];
  if (encounter.status === "active") reasons.push("El combate sigue activo.");
  if (!LOOT_EVIDENCE_READY_STATUSES.includes(encounter.status)) {
    reasons.push(`El estado ${encounter.status} no permite reclamar evidencia/loot post-combate.`);
  }
  if (["claimed", "partially_claimed"].includes(encounter.lootState?.status)) {
    reasons.push("Las consecuencias post-combate ya fueron reclamadas.");
  }
  if (encounter.lootState?.blockedByDanger) reasons.push("La zona sigue siendo demasiado peligrosa para revisar.");
  if (encounter.lootState?.blockedByOwnership) reasons.push("Hay propiedad ajena o custodia institucional sobre lo encontrado.");
  return reasons;
}

function buildDefaultEvidenceCandidate(encounter, enemy) {
  const enemyName = enemy?.name || encounter.enemyName || "criatura";
  const isWon = encounter.status === "won";
  return {
    key: isWon ? "combat_sample" : "combat_trace",
    name: isWon ? `Muestra de ${enemyName}` : `Rastro de ${enemyName}`,
    summary: isWon
      ? `Muestra fisica tomada tras el combate contra ${enemyName}. Sirve como prueba, no como recompensa automatica.`
      : `Rastro posterior al combate relacionado con ${enemyName}. Sirve como indicio, no como prueba concluyente.`,
    type: isWon ? "sample" : "trace",
    proofStatus: isWon ? "partial" : "unverified",
    condition: "usable",
    certainty: isWon ? "high" : "medium",
    tags: unique(["combat", "combat_evidence", enemy?.enemyId, enemy?.type, ...(enemy?.tags || [])]).slice(0, 16),
  };
}

function buildEvidenceCandidates(encounter, enemy) {
  const profile = enemy?.evidenceProfile || {};
  const defaultProofStatus = normalizeProofStatus(
    profile.defaultProofStatus,
    encounter.status === "won" ? "partial" : "unverified"
  );
  const proofItems = Array.isArray(profile.proofItems) ? profile.proofItems : [];

  if (proofItems.length > 0) {
    return proofItems.map((item, index) => ({
      key: item.key || item.evidenceId || `proof_${index + 1}`,
      name: item.name || `Prueba de ${enemy?.name || encounter.enemyName || "enemigo"}`,
      summary: item.summary || item.description || profile.notes || `Prueba fisica obtenible tras el combate.`,
      type: normalizeEvidenceType(item.type || item.evidenceType || "sample"),
      proofStatus: normalizeProofStatus(item.proofStatus, defaultProofStatus),
      condition: item.condition || "usable",
      certainty: item.certainty || (defaultProofStatus === "verified" ? "confirmed" : "medium"),
      tags: unique(["combat", "combat_evidence", enemy?.enemyId, ...(item.tags || []), ...(enemy?.tags || [])]).slice(0, 16),
    }));
  }

  return [buildDefaultEvidenceCandidate(encounter, enemy)].map((candidate) => ({
    ...candidate,
    proofStatus: normalizeProofStatus(candidate.proofStatus, defaultProofStatus),
  }));
}

function buildLootCandidates(encounter, enemy) {
  if (encounter.status !== "won") return [];
  const profile = enemy?.lootProfile || {};
  const mode = profile.mode || "logical_search";
  if (["none", "proof_only", "mission_only"].includes(mode)) return [];

  const explicitItems = Array.isArray(profile.candidateItems) ? profile.candidateItems : [];
  if (explicitItems.length > 0) {
    return explicitItems.map((item, index) => ({
      key: item.key || item.itemId || `loot_${index + 1}`,
      name: item.name || item.itemId || `Loot de ${enemy?.name || encounter.enemyName || "enemigo"}`,
      quantity: numberOr(item.quantity, 1),
      claimMode: "blocked_inventory_catalog_required",
      reason: item.reason || "C5 no crea objetos de inventario fuera del catalogo.",
      tags: unique(["combat", "combat_loot", enemy?.enemyId, ...(item.tags || [])]).slice(0, 16),
    }));
  }

  if (["animal", "beast"].includes(enemy?.type) || ["corpse_materials", "logical_search"].includes(mode)) {
    return [
      {
        key: "logical_materials",
        name: `Materiales aprovechables de ${enemy?.name || encounter.enemyName || "enemigo"}`,
        quantity: 1,
        claimMode: "blocked_tools_or_catalog_required",
        reason: "Solo quedan marcados como posibilidad logica; no se agregan al inventario sin herramienta/catalogo.",
        tags: unique(["combat", "combat_loot", "logical_materials", enemy?.enemyId]).slice(0, 16),
      },
    ];
  }

  return [];
}

function summarizePostCombatConsequences({ encounter, enemy, gameState = null }) {
  const blockingReasons = getLootBlockingReasons(encounter);
  const canClaim = blockingReasons.length === 0;
  const evidenceCandidates = canClaim ? buildEvidenceCandidates(encounter, enemy) : [];
  const lootCandidates = canClaim ? buildLootCandidates(encounter, enemy) : [];
  const gameTime = getCombatGameTime(gameState, encounter);

  return {
    canClaim,
    blockedReason: blockingReasons.join(" "),
    blockingReasons,
    encounter: summarizeEncounter(encounter),
    enemy: summarizeEnemy(enemy),
    candidateEvidence: evidenceCandidates,
    candidateItems: lootCandidates,
    proofStatus: evidenceCandidates[0]?.proofStatus || "none",
    gameTime,
    mutation: {
      willCreateEvidence: canClaim && evidenceCandidates.length > 0,
      willCreateInventoryItems: false,
      willUpdateEncounter: canClaim,
      willUpdateWorldEvent: canClaim && Boolean(encounter.sourceEventId),
      willUpdateMissionProof: canClaim && Boolean(encounter.sourceMissionId),
      willGrantMoney: false,
      willCreateCheckpoint: canClaim,
    },
    policy: "C5 crea evidencia/pruebas y marca loot logico; no agrega dinero ni items inexistentes al inventario.",
  };
}

function getRelevantEncounterState(encounter) {
  return {
    encounterId: encounter.encounterId,
    status: encounter.status,
    phase: encounter.phase,
    round: encounter.round || encounter.currentRound,
    currentRound: encounter.currentRound,
    currentActorId: encounter.currentActorId,
    encounterVersion: encounter.encounterVersion,
    participants: encounter.participants || [],
    enemyStatus: encounter.enemyStatus || {},
    distanceMap: encounter.distanceMap || {},
    lootState: encounter.lootState || {},
    evidenceState: encounter.evidenceState || {},
  };
}

function getEncounterStateHash(encounter) {
  return hashObject(getRelevantEncounterState(encounter));
}

async function getGameStateOrThrow(gameId) {
  const gameState = await GameState.findOne({ gameId }).lean();
  if (!gameState) throw makeError(`No existe GameState para gameId: ${gameId}`, 404);
  return gameState;
}

async function getGameStateDocOrThrow(gameId) {
  const gameState = await GameState.findOne({ gameId });
  if (!gameState) throw makeError(`No existe GameState para gameId: ${gameId}`, 404);
  return gameState;
}

async function getEnemyOrThrow(enemyId) {
  if (!enemyId) throw makeError("enemyId es obligatorio.", 400);

  const enemy = await EnemyTemplate.findOne({ enemyId }).lean();
  if (!enemy) throw makeError(`No existe EnemyTemplate: ${enemyId}`, 404);
  return enemy;
}

async function getEncounterOrThrow(encounterId, { lean = true } = {}) {
  const query = CombatEncounter.findOne({ encounterId });
  const encounter = lean ? await query.lean() : await query;
  if (!encounter) throw makeError(`No existe encuentro con id: ${encounterId}`, 404);
  return encounter;
}

async function ensureNoActiveEncounter(gameId) {
  const activeEncounter = await CombatEncounter.findOne({ gameId, status: "active" }).lean();
  if (activeEncounter) {
    throw makeError("Ya existe un combate activo. Debe resolverse antes de iniciar otro.", 400, {
      encounterId: activeEncounter.encounterId,
    });
  }
}

async function safeCombatCheckpoint(options) {
  try {
    return await createAutomaticCheckpoint(options);
  } catch (error) {
    return {
      created: false,
      skipped: false,
      error: error.message,
      checkpoint: null,
    };
  }
}

async function previewStartEncounter({
  gameId = "isekai_lucas_main",
  enemyId,
  reason = "",
  sourceEventId = "",
  sourceMissionId = "",
  sourceCommitmentId = "",
  combatMode = "real",
  encounterType = "",
} = {}) {
  const gameState = await getGameStateOrThrow(gameId);
  const enemy = await getEnemyOrThrow(enemyId);
  const activeEncounter = await CombatEncounter.findOne({ gameId, status: "active" }).lean();
  const canStart = !activeEncounter;
  const encounterPolicy = buildEncounterPolicy({
    enemy,
    encounterType,
    combatMode,
    sourceEventId,
    sourceMissionId,
    sourceCommitmentId,
    reason,
  });
  const previewEncounterId = `preview_combat_${enemy.enemyId}`;
  const participants = buildInitialParticipants({
    encounterId: previewEncounterId,
    gameState,
    enemy,
  });

  return {
    dryRun: true,
    canStart,
    blockedReason: activeEncounter ? "Ya existe un combate activo." : "",
    blockingReasons: activeEncounter ? ["Ya existe un combate activo."] : [],
    enemy: summarizeEnemy(enemy),
    encounterDraft: {
      gameId,
      status: "active",
      phase: "player_turn",
      locationId: gameState.locationId,
      sourceEventId,
      sourceMissionId,
      sourceCommitmentId,
      enemyId: enemy.enemyId,
      enemyName: enemy.name,
      participants,
      turnOrder: participants.map((entry) => entry.combatantId),
      currentActorId: participants[0]?.combatantId || "",
      reason,
      combatMode: encounterPolicy.combatMode,
      encounterType: encounterPolicy.encounterType,
      encounterPolicy,
    },
    mutation: {
      willMutateGameState: false,
      willCreateEncounter: canStart,
      willCreateCheckpoint: canStart,
    },
  };
}

async function startEncounterAdvanced({
  gameId = "isekai_lucas_main",
  enemyId,
  reason = "",
  sourceEventId = "",
  sourceMissionId = "",
  sourceCommitmentId = "",
  terrainTags = [],
  visibility = "unknown",
  noiseLevel = "unknown",
  surpriseState = "unknown",
  combatMode = "real",
  encounterType = "",
} = {}) {
  const gameState = await getGameStateOrThrow(gameId);
  await ensureNoActiveEncounter(gameId);
  const enemy = await getEnemyOrThrow(enemyId);
  const encounterPolicy = buildEncounterPolicy({
    enemy,
    encounterType,
    combatMode,
    sourceEventId,
    sourceMissionId,
    sourceCommitmentId,
    reason,
  });
  const encounterId = createId("combat_adv");
  const participants = buildInitialParticipants({ encounterId, gameState, enemy });
  const [lucasParticipant, enemyParticipant] = participants;

  const beforeCheckpoint = await safeCombatCheckpoint({
    gameId,
    title: `Auto checkpoint - antes de combate avanzado con ${enemy.name}`,
    reason: `Checkpoint automatico antes de iniciar combate avanzado contra ${enemy.name}.`,
    triggerKey: `combat_advanced_start:${enemy.enemyId}:${gameState.currentDay}:${gameState.time}`,
    metadata: {
      source: "startEncounterAdvanced",
      enemyId: enemy.enemyId,
      dangerRank: enemy.dangerRank || enemy.dangerLevel,
      encounterType: encounterPolicy.encounterType,
      sourceEventId,
      sourceMissionId,
    },
  });

  const encounter = await CombatEncounter.create({
    encounterId,
    gameId,
    status: "active",
    phase: "player_turn",
    locationId: gameState.locationId,
    sourceEventId,
    sourceMissionId,
    sourceCommitmentId,
    enemyId: enemy.enemyId,
    enemyName: enemy.name,
    enemyStatus: {
      life: {
        current: enemyParticipant.hp.current,
        max: enemyParticipant.hp.max,
      },
      morale: {
        current: enemyParticipant.morale.current,
        max: enemyParticipant.morale.max,
      },
      conditions: [],
    },
    currentRound: 1,
    round: 1,
    startedDay: gameState.currentDay,
    startedTime: gameState.time,
    terrainTags,
    visibility,
    noiseLevel,
    surpriseState,
    participants,
    turnOrder: participants.map((entry) => entry.combatantId),
    currentActorId: lucasParticipant.combatantId,
    distanceMap: {
      [lucasParticipant.combatantId]: {
        [enemyParticipant.combatantId]: "near",
      },
      [enemyParticipant.combatantId]: {
        [lucasParticipant.combatantId]: "near",
      },
    },
    lootState: {
      status: "unavailable",
      reason: "El combate sigue activo. No hay loot automatico.",
    },
    evidenceState: {
      proofStatus: "none",
    },
    reason,
    flags: {
      advancedCombat: true,
      dangerLevel: enemy.dangerLevel,
      dangerRank: enemy.dangerRank || enemy.dangerLevel,
      enemyType: enemy.type,
      rewardPolicy: enemy.rewardPolicy,
      c4Resolution: "backend_basic",
      c12EncounterPolicy: true,
      combatMode: encounterPolicy.combatMode,
      encounterType: encounterPolicy.encounterType,
      encounterPolicy,
    },
  });

  await CombatantState.insertMany(participants, { ordered: true });

  await EventLog.create({
    logId: createId("log"),
    gameId,
    day: gameState.currentDay,
    timeStart: gameState.time,
    timeEnd: gameState.time,
    locationId: gameState.locationId,
    type: "combat_advanced_start",
    summary: `Comienza combate avanzado contra ${enemy.name}.`,
    involvedCharacterIds: ["char_lucas"],
    mechanicalChanges: {
      encounterId,
      enemyId: enemy.enemyId,
      enemyName: enemy.name,
      participantIds: participants.map((entry) => entry.combatantId),
      encounterType: encounterPolicy.encounterType,
      encounterPolicy,
    },
    visibility: "private",
    source: "system",
    tags: ["combat", "combat_advanced"],
  });

  return {
    encounter: summarizeEncounter(encounter.toObject(), {
      autoCheckpoint: beforeCheckpoint,
    }),
    combatants: participants,
  };
}

async function listActiveAdvancedEncounters({ gameId = "isekai_lucas_main" } = {}) {
  const encounters = await CombatEncounter.find({ gameId, status: "active" })
    .sort({ createdAt: -1 })
    .lean();

  return encounters.map((encounter) => summarizeEncounter(encounter));
}

async function getAdvancedEncounter(encounterId) {
  const encounter = await getEncounterOrThrow(encounterId);
  const [combatants, pendingPreviews, logEntries] = await Promise.all([
    CombatantState.find({ encounterId }).sort({ side: 1, createdAt: 1 }).lean(),
    CombatActionPreview.find({ encounterId, status: "pending" }).sort({ createdAt: -1 }).limit(5).lean(),
    CombatLogEntry.find({ encounterId }).sort({ round: 1, createdAt: 1 }).limit(20).lean(),
  ]);

  return summarizeEncounter(encounter, {
    combatants,
    pendingPreviews,
    logEntries,
  });
}

function getDefaultTargetIds(encounter, action) {
  if (!action.targetRequired) return [];
  const currentActorId = encounter.currentActorId || "";
  const participants = encounter.participants || [];
  const actor = participants.find((entry) => entry.combatantId === currentActorId);
  const actorSide = actor?.side || "lucas";

  return participants
    .filter((entry) => {
      if (entry.combatantId === currentActorId) return false;
      if (actorSide === "lucas" || actorSide === "ally") return entry.side === "enemy";
      if (actorSide === "enemy") return entry.side === "lucas" || entry.side === "ally";
      return false;
    })
    .slice(0, 1)
    .map((entry) => entry.combatantId);
}

function buildActionAvailability(encounter, action) {
  const blockingReasons = [];

  if (!encounter) {
    blockingReasons.push("No existe encuentro.");
  } else if (encounter.status !== "active") {
    blockingReasons.push(`El encuentro no esta activo. Estado actual: ${encounter.status}.`);
  }

  if (encounter?.phase && !["player_turn", "reaction_window"].includes(encounter.phase)) {
    blockingReasons.push(`La fase actual (${encounter.phase}) no permite accion directa de Lucas.`);
  }

  const actor = (encounter?.participants || []).find((entry) => entry.combatantId === encounter.currentActorId);
  if (actor && !["lucas", "ally"].includes(actor.side)) {
    blockingReasons.push("El actor actual no pertenece al lado de Lucas.");
  }

  return {
    ...action,
    canPreview: blockingReasons.length === 0,
    c4ApplySupported: Boolean(action.c4ApplySupported),
    blockingReasons,
  };
}

function validateResolvedActionIntent({ encounter, action, actorId, targetIds = [] }) {
  const blockingReasons = [];
  const participants = encounter?.participants || [];
  const actor = participants.find((entry) => entry.combatantId === actorId);

  if (!actorId) {
    blockingReasons.push("No hay actorId resuelto para la accion.");
  } else if (!actor) {
    blockingReasons.push(`No existe actor de combate: ${actorId}.`);
  } else {
    if (actorId !== encounter.currentActorId) {
      blockingReasons.push(`Solo puede actuar el actor actual del encuentro: ${encounter.currentActorId}.`);
    }
    if (!["lucas", "ally"].includes(actor.side)) {
      blockingReasons.push("El actor resuelto no pertenece al lado de Lucas.");
    }
    if (actor.isAlive === false || actor.isConscious === false || actor.canAct === false) {
      blockingReasons.push("El actor resuelto no puede actuar en este momento.");
    }
  }

  if (action.targetRequired) {
    if (!Array.isArray(targetIds) || targetIds.length === 0) {
      blockingReasons.push("La accion requiere objetivo y no hay targetIds validos.");
    }

    for (const targetId of targetIds || []) {
      const target = participants.find((entry) => entry.combatantId === targetId);
      if (!target) {
        blockingReasons.push(`No existe targetId de combate: ${targetId}.`);
      } else if (target.combatantId === actorId) {
        blockingReasons.push("El actor no puede apuntarse a si mismo con esta accion.");
      } else if (actor && ["lucas", "ally"].includes(actor.side) && target.side !== "enemy") {
        blockingReasons.push(`El objetivo ${targetId} no es enemigo valido para ${action.actionType}.`);
      }
    }
  }

  return blockingReasons;
}

async function validateUseItemIntent({ gameId, params = {} }) {
  const blockingReasons = [];
  const itemId = params.itemId || "";
  const injuryId = params.injuryId || "";

  if (!itemId) blockingReasons.push("use_item requiere params.itemId.");
  if (!injuryId) blockingReasons.push("use_item de tratamiento requiere params.injuryId.");
  if (!itemId && !injuryId) return blockingReasons;

  const [gameState, item, injury] = await Promise.all([
    GameState.findOne({ gameId }).lean(),
    itemId ? Item.findOne({ itemId }).lean() : Promise.resolve(null),
    injuryId ? InjuryRecord.findOne({ gameId, injuryId }).lean() : Promise.resolve(null),
  ]);

  if (!gameState) {
    blockingReasons.push(`No existe GameState para gameId: ${gameId}.`);
    return blockingReasons;
  }

  if (itemId && !getInventoryEntry(gameState, itemId)) {
    blockingReasons.push(`Lucas no tiene ${itemId} en inventario disponible.`);
  }

  const itemUse = getCombatItemUseDefinition(item);
  if (itemId && !itemUse.supported) blockingReasons.push(itemUse.reason);

  if (injuryId && !injury) {
    blockingReasons.push(`No existe InjuryRecord para tratar: ${injuryId}.`);
  }

  if (injury) {
    if (injury.targetType !== "character" || injury.targetId !== "char_lucas") {
      blockingReasons.push("C8 solo permite usar objetos de tratamiento sobre heridas de Lucas.");
    }
    const plan = buildTreatmentPlan(injury, {
      treatmentType: itemUse.treatmentType || "field_dressing",
      quality: itemUse.quality || "basic",
    });
    if (!plan.canTreat) {
      blockingReasons.push(`La herida no admite tratamiento en estado ${injury.status}.`);
    }
    if (itemUse.itemUseType === "ointment" && numberOr(injury.pain, 0) <= 0) {
      blockingReasons.push("El unguento no tiene efecto inmediato: la herida no registra dolor tratable.");
    }
  }

  return blockingReasons;
}

function getMagicMpCost(technique) {
  const mpCost = technique?.mpCost || {};
  if (Number.isFinite(Number(mpCost.fixed))) return Number(mpCost.fixed);
  if (Number.isFinite(Number(mpCost.min))) return Number(mpCost.min);
  return 0;
}

function isSimpleOffensiveCombatSpell(technique) {
  const combatUse = technique?.effectProfile?.combatUse || (technique?.isOffensive ? "offensive_simple" : "unsupported");
  return Boolean(technique?.isRealSpell && technique?.isOffensive && combatUse === "offensive_simple");
}

async function getKnownMagicTechniqueForCombat({ gameState, techniqueId }) {
  const characterId = gameState.characterId || "char_lucas";
  const [technique, knowledge] = await Promise.all([
    MagicTechnique.findOne({ techniqueId }).lean(),
    CharacterMagicKnowledge.findOne({
      characterId,
      techniqueId,
      status: { $in: ["known", "mastered"] },
    }).lean(),
  ]);

  const knownByFlag = (gameState.flags?.knownSpells || []).includes(techniqueId);
  const knownByRecord = Boolean(knowledge);

  return {
    technique,
    knowledge,
    known: Boolean(technique?.isRealSpell && (knownByFlag || knownByRecord)),
    knownByFlag,
    knownByRecord,
  };
}

async function validateUseMagicIntent({ gameId, params = {} }) {
  const blockingReasons = [];
  const techniqueId = params.techniqueId || "";

  if (!techniqueId) {
    blockingReasons.push("use_magic requiere params.techniqueId.");
    return blockingReasons;
  }

  const gameState = await GameState.findOne({ gameId }).lean();
  if (!gameState) {
    blockingReasons.push(`No existe GameState para gameId: ${gameId}.`);
    return blockingReasons;
  }

  const { technique, known } = await getKnownMagicTechniqueForCombat({ gameState, techniqueId });
  if (!technique) {
    blockingReasons.push(`No existe tecnica magica: ${techniqueId}.`);
    return blockingReasons;
  }
  if (!technique.isRealSpell) {
    blockingReasons.push(`La tecnica ${techniqueId} no es un hechizo real usable en combate.`);
  }
  if (!known) {
    blockingReasons.push(`Lucas no conoce formalmente el hechizo ${techniqueId}.`);
  }
  if (!isSimpleOffensiveCombatSpell(technique)) {
    blockingReasons.push(`El combate avanzado solo permite hechizos ofensivos simples: ${techniqueId}.`);
  }

  const mpCost = getMagicMpCost(technique);
  const currentMp = gameState.lucasStatus?.mp?.current ?? 0;
  if (mpCost > currentMp) {
    blockingReasons.push(`MP insuficiente: requiere ${mpCost}, actual ${currentMp}.`);
  }

  return blockingReasons;
}

async function listAvailableAdvancedActions({ encounterId } = {}) {
  const encounter = await getEncounterOrThrow(encounterId);
  return {
    encounter: summarizeEncounter(encounter),
    actions: ADVANCED_ACTIONS.map((action) => buildActionAvailability(encounter, action)),
  };
}

async function previewAdvancedAction({
  gameId = "isekai_lucas_main",
  encounterId,
  actionType,
  actorId = "",
  targetIds = null,
  params = {},
} = {}) {
  const action = ACTIONS_BY_TYPE.get(actionType);
  if (!action) {
    throw makeError(`actionType invalido: ${actionType}`, 400, {
      allowedActionTypes: ADVANCED_ACTIONS.map((entry) => entry.actionType),
    });
  }

  const encounter = await getEncounterOrThrow(encounterId);
  if (encounter.gameId !== gameId) {
    throw makeError("El encounterId no pertenece al gameId indicado.", 400, {
      encounterGameId: encounter.gameId,
      gameId,
    });
  }

  const availability = buildActionAvailability(encounter, action);
  const resolvedActorId = actorId || encounter.currentActorId || "";
  const resolvedTargetIds = Array.isArray(targetIds) ? targetIds : getDefaultTargetIds(encounter, action);

  availability.blockingReasons.push(
    ...validateResolvedActionIntent({
      encounter,
      action,
      actorId: resolvedActorId,
      targetIds: resolvedTargetIds,
    })
  );
  if (actionType === "use_item") {
    availability.blockingReasons.push(...(await validateUseItemIntent({ gameId, params })));
  } else if (actionType === "use_magic") {
    availability.blockingReasons.push(...(await validateUseMagicIntent({ gameId, params })));
  }

  const canAct = availability.blockingReasons.length === 0;
  const willMutateGameStateOnApply = Boolean(action.c4ApplySupported);
  const stateHash = getEncounterStateHash(encounter);
  const previewId = createId("combat_preview");
  const deterministicSeed = hashObject({
    previewId,
    encounterId,
    actionType,
    round: encounter.round || encounter.currentRound || 1,
    actorId: resolvedActorId,
    targetIds: resolvedTargetIds,
  });

  if (canAct) {
    await CombatActionPreview.updateMany(
      {
        gameId,
        encounterId,
        actorId: resolvedActorId,
        status: "pending",
      },
      {
        $set: {
          status: "invalidated",
          invalidationReason: "Nueva preview creada para el mismo actor.",
        },
      }
    );
  }

  const preview = await CombatActionPreview.create({
    previewId,
    gameId,
    encounterId,
    encounterVersion: encounter.encounterVersion || 1,
    stateHash,
    round: encounter.round || encounter.currentRound || 1,
    phase: encounter.phase || "player_turn",
    actorId: resolvedActorId,
    actionType,
    targetIds: resolvedTargetIds,
    params,
    expectedCosts: {
      willMutateGameState: willMutateGameStateOnApply,
      willMutateGameStateOnApply,
      willMutateEncounterOnApply: Boolean(action.c4ApplySupported),
      c4ApplySupported: Boolean(action.c4ApplySupported),
    },
    riskSummary: {
      c4: action.c4ApplySupported
        ? "Preview token creado. applyAction resolvera la accion con backend rolls."
        : "Preview token creado, pero esta accion todavia no tiene aplicacion real en C4.",
      canAct,
      blockingReasons: availability.blockingReasons,
    },
    possibleOutcomes: canAct
      ? [
          {
            outcome: action.c4ApplySupported ? "resolved_by_apply_action" : "unsupported_until_later_phase",
            description: action.c4ApplySupported
              ? "applyAction validara previewId y resolvera rolls, fatiga, posicion/moral/dano segun accion."
              : "La accion se puede previsualizar, pero no aplicarse todavia.",
          },
        ]
      : [],
    deterministicSeed,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    status: canAct ? "pending" : "invalidated",
    invalidationReason: canAct ? "" : availability.blockingReasons.join(" "),
  });

  return {
    dryRun: true,
    canAct,
    blockedReason: availability.blockingReasons.join(" "),
    blockingReasons: availability.blockingReasons,
    preview: preview.toObject(),
    encounter: summarizeEncounter(encounter),
    action: availability,
    mutation: {
      willMutateGameState: willMutateGameStateOnApply,
      willMutateEncounter: false,
      willCreatePreviewToken: true,
      willResolveCombat: Boolean(action.c4ApplySupported),
    },
  };
}

async function validatePendingPreview({ previewId, gameId = "isekai_lucas_main" } = {}) {
  if (!previewId) throw makeError("previewId es obligatorio.", 400);

  const preview = await CombatActionPreview.findOne({ previewId }).lean();
  if (!preview) throw makeError(`No existe previewId: ${previewId}`, 404);
  if (preview.gameId !== gameId) {
    throw makeError("El previewId no pertenece al gameId indicado.", 400, {
      previewGameId: preview.gameId,
      gameId,
    });
  }
  if (preview.status !== "pending") {
    throw makeError(`El previewId no esta pendiente. Estado actual: ${preview.status}.`, 400);
  }
  if (preview.riskSummary?.canAct === false || (preview.riskSummary?.blockingReasons || []).length > 0) {
    throw makeError("El previewId fue creado con bloqueos y no puede aplicarse.", 400, {
      previewId,
      blockingReasons: preview.riskSummary?.blockingReasons || [],
    });
  }
  if (preview.expiresAt && new Date(preview.expiresAt).getTime() < Date.now()) {
    await CombatActionPreview.updateOne(
      { previewId },
      {
        $set: {
          status: "expired",
          invalidationReason: "Preview vencida.",
        },
      }
    );
    throw makeError("El previewId esta vencido.", 400);
  }

  const encounter = await getEncounterOrThrow(preview.encounterId);
  if (encounter.status !== "active") {
    throw makeError(`El encuentro no esta activo. Estado actual: ${encounter.status}.`, 400);
  }
  if ((encounter.encounterVersion || 1) !== preview.encounterVersion) {
    throw makeError("El estado del encuentro cambio desde la preview.", 409, {
      previewVersion: preview.encounterVersion,
      encounterVersion: encounter.encounterVersion || 1,
    });
  }
  if (getEncounterStateHash(encounter) !== preview.stateHash) {
    throw makeError("El hash de estado del encuentro ya no coincide con la preview.", 409);
  }

  return {
    preview,
    encounter,
  };
}

function getEnemyAttackProfile(enemy) {
  const attack = enemy?.attacks?.[0] || {};
  return {
    weaponProfileId: attack.attackId || "enemy_natural_attack",
    itemId: "",
    name: attack.name || "Ataque natural",
    weaponType: "improvised",
    rangeBand: attack.rangeBand || "engaged",
    damageType: attack.damageType === "physical" ? "pierce" : (attack.damageType || "pierce"),
    baseDamage: numberOr(attack.baseDamage, Math.max(2, Math.floor(numberOr(enemy?.baseStats?.attack, 4) / 3))),
    accuracyModifier: numberOr(attack.accuracyModifier, 0),
    defenseModifier: 0,
    speedModifier: 0,
    fatigueCostModifier: numberOr(attack.fatigueCost, 0),
    requiredSkillId: "",
    traits: attack.traits || [],
  };
}

async function loadMutableCombatState({ gameId, encounterId }) {
  const [gameState, encounter] = await Promise.all([
    GameState.findOne({ gameId }),
    CombatEncounter.findOne({ encounterId }),
  ]);

  if (!gameState) throw makeError(`No existe GameState para gameId: ${gameId}`, 404);
  if (!encounter) throw makeError(`No existe encuentro con id: ${encounterId}`, 404);
  if (encounter.gameId !== gameId) throw makeError("El encounterId no pertenece al gameId indicado.", 400);

  const [enemy, combatantDocs] = await Promise.all([
    EnemyTemplate.findOne({ enemyId: encounter.enemyId }).lean(),
    CombatantState.find({ gameId, encounterId }).lean(),
  ]);

  return {
    gameState,
    encounter,
    enemy,
    combatantDocs,
  };
}

function mergeCombatantWithDoc(encounterCombatant, combatantDocs) {
  const doc = combatantDocs.find((entry) => entry.combatantId === encounterCombatant.combatantId);
  return {
    ...(doc || {}),
    ...encounterCombatant,
  };
}

function getMutableCombatant(encounter, combatantDocs, combatantId) {
  const embedded = getCombatantById(encounter, combatantId);
  if (!embedded) return null;
  return mergeCombatantWithDoc(embedded, combatantDocs);
}

function findFirstEnemyTarget(encounter, actor) {
  const participants = encounter.participants || [];
  if (actor.side === "enemy") {
    return participants.find((entry) => ["lucas", "ally"].includes(entry.side) && entry.isAlive !== false) || null;
  }
  return participants.find((entry) => entry.side === "enemy" && entry.isAlive !== false) || null;
}

function getResolvedTarget(encounter, combatantDocs, actor, targetIds = []) {
  const targetId = targetIds[0] || findFirstEnemyTarget(encounter, actor)?.combatantId || "";
  return targetId ? getMutableCombatant(encounter, combatantDocs, targetId) : null;
}

function shouldResolveTargetForAction(actionType) {
  return ACTIONS_WITH_RESOLVED_TARGET.has(actionType);
}

function removeCondition(combatant, condition) {
  combatant.conditions = (combatant.conditions || []).filter((entry) => entry !== condition);
}

function addCondition(combatant, condition) {
  combatant.conditions = Array.from(new Set([...(combatant.conditions || []), condition]));
}

function applyFatigue(combatant, amount) {
  combatant.combatFatigue = Math.max(0, numberOr(combatant.combatFatigue, 0) + amount);
  combatant.breath = clamp(numberOr(combatant.breath, 100) - amount * 2, 0, 100);
}

function applyStress(combatant, amount) {
  combatant.stress = Math.max(0, numberOr(combatant.stress, 0) + amount);
}

function markDefeatedIfNeeded(combatant) {
  if (numberOr(combatant.hp?.current, 0) <= 0) {
    combatant.hp = {
      ...(combatant.hp || {}),
      current: 0,
    };
    combatant.isConscious = false;
    combatant.canAct = false;
    combatant.isAlive = false;
    addCondition(combatant, "defeated");
  }
}

async function persistCombatants(combatants) {
  await Promise.all(
    combatants.map((combatant) =>
      CombatantState.updateOne(
        { combatantId: combatant.combatantId },
        {
          $set: {
            side: combatant.side,
            characterId: combatant.characterId || "",
            npcId: combatant.npcId || "",
            enemyInstanceId: combatant.enemyInstanceId || "",
            enemyTemplateId: combatant.enemyTemplateId || "",
            name: combatant.name,
            type: combatant.type,
            hp: combatant.hp,
            mp: combatant.mp,
            combatFatigue: combatant.combatFatigue || 0,
            breath: combatant.breath ?? 100,
            stress: combatant.stress || 0,
            morale: combatant.morale,
            stance: combatant.stance || "neutral",
            positionState: combatant.positionState || "standing",
            bodyState: combatant.bodyState || "able",
            awarenessState: combatant.awarenessState || "aware",
            equippedWeaponIds: combatant.equippedWeaponIds || [],
            armorProfileId: combatant.armorProfileId || "",
            injuries: combatant.injuries || [],
            conditions: combatant.conditions || [],
            intent: combatant.intent || "",
            targetPriority: combatant.targetPriority || [],
            distanceToOthers: combatant.distanceToOthers || {},
            actionEconomy: combatant.actionEconomy || {},
            isConscious: combatant.isConscious !== false,
            isAlive: combatant.isAlive !== false,
            canAct: combatant.canAct !== false,
            flags: combatant.flags || {},
          },
        }
      )
    )
  );
}

function updateLucasGameStateFromCombatant(gameState, combatant) {
  if (combatant.side !== "lucas") return;
  const life = gameState.lucasStatus?.life;
  if (life) {
    life.current = clamp(numberOr(combatant.hp?.current, life.current), 0, life.max);
  }
  const mp = gameState.lucasStatus?.mp;
  if (mp && combatant.mp) {
    mp.current = clamp(numberOr(combatant.mp.current, mp.current), 0, mp.max);
  }
}

function getCombatantGameTime(gameState, encounter) {
  return {
    day: gameState.currentDay || encounter.startedDay,
    time: gameState.time || encounter.startedTime,
  };
}

function resolveAttack({
  rng,
  encounter,
  gameState,
  enemy,
  actor,
  target,
  weaponProfile,
  actionId,
}) {
  const actorStats = getCombatantStats({ combatant: actor, enemy, gameState, weaponProfile });
  const targetStats = getCombatantStats({ combatant: target, enemy, gameState });
  const distanceBand = getDistance(encounter, actor.combatantId, target.combatantId);
  const attackRoll = rollDie(rng, 20);
  const defenseRoll = rollDie(rng, 20);
  const damageRoll = rollDie(rng, 6);
  const distanceModifier = getDistanceAttackModifier(distanceBand, weaponProfile);
  const terrainAttackModifier = getTerrainModifier(encounter, actor);
  const terrainDefenseModifier = getTerrainModifier(encounter, target);
  const actorStanceModifier = getStanceModifier(actor, "attack", actorStats, encounter);
  const targetDefensiveModifier = getStanceModifier(target, "defense", targetStats, encounter);
  const controlledCombat = isControlledCombat(encounter);
  const attackScore =
    actorStats.agility +
    actorStats.attack +
    numberOr(weaponProfile.accuracyModifier, 0) +
    Math.floor(actorStats.perception / 3) +
    distanceModifier +
    terrainAttackModifier +
    getFatigueModifier(actor) +
    actorStanceModifier +
    attackRoll;
  const defenseScore =
    targetStats.agility +
    targetStats.defense +
    Math.floor(targetStats.perception / 4) +
    terrainDefenseModifier +
    getFatigueModifier(target) +
    targetDefensiveModifier +
    defenseRoll;
  const hitMargin = attackScore - defenseScore;
  const resultBand = classifyHit(hitMargin);
  const hit = !["bad_miss", "miss"].includes(resultBand);
  const statBonus = Math.floor(actorStats.attack / 5);
  const hitBonus = getDamageBonusFromHit(resultBand, hitMargin);
  const rawDamage = hit
    ? numberOr(weaponProfile.baseDamage, 1) + statBonus + hitBonus + damageRoll
    : 0;
  const armorReduction = hit ? numberOr(targetStats.armorDamageReduction, 0) : 0;
  const reduction = hit ? Math.floor(targetStats.endurance / 6) + Math.floor(targetStats.defense / 8) + armorReduction : 0;
  let finalDamage = hit ? Math.max(0, rawDamage - reduction) : 0;
  if (controlledCombat) {
    const safeDamageCap = Math.max(0, numberOr(target.hp?.current, 0) - 1);
    finalDamage = Math.min(finalDamage, safeDamageCap, 2);
  }
  const hpChange = finalDamage > 0 ? adjustResource(target.hp, -finalDamage) : null;
  const moraleDamage = finalDamage > 0 ? Math.max(1, Math.floor(finalDamage / 2) + (["strong_hit", "critical_hit"].includes(resultBand) ? 2 : 0)) : 0;
  const moraleChange = moraleDamage > 0 ? adjustResource(target.morale, -moraleDamage) : null;
  const injuryResult = controlledCombat
    ? { injuryRoll: null, injury: null }
    : maybeCreateInjury({
        rng,
        target,
        resultBand,
        finalDamage,
        damageType: weaponProfile.damageType,
        encounter,
        actionId,
      });
  const gameTime = getCombatantGameTime(gameState, encounter);

  if (hpChange) target.hp = hpChange.pool;
  if (moraleChange) target.morale = moraleChange.pool;
  applyFatigue(
    actor,
    3 +
      Math.max(0, numberOr(weaponProfile.fatigueCostModifier, 0)) +
      Math.max(0, numberOr(actorStats.armorFatiguePenalty, 0))
  );
  if (finalDamage > 0) applyStress(target, Math.max(1, Math.floor(finalDamage / 2)));
  removeCondition(actor, "prepared");
  removeCondition(actor, "focused");
  for (const condition of DEFENSIVE_CONDITIONS) removeCondition(target, condition);

  if (injuryResult?.injury) {
    injuryResult.injury.createdDay = gameTime.day;
    injuryResult.injury.createdTime = gameTime.time;
    target.injuries = Array.from(new Set([...(target.injuries || []), injuryResult.injury.injuryId]));
  }

  markDefeatedIfNeeded(target);

  return {
    actionType: "attack",
    actorId: actor.combatantId,
    targetIds: [target.combatantId],
    rolls: {
      attackRoll,
      defenseRoll,
      damageRoll,
      injuryRoll: injuryResult?.injuryRoll || null,
    },
    modifiers: {
      distanceBand,
      distanceModifier,
      terrainAttackModifier,
      terrainDefenseModifier,
      attackFatigueModifier: getFatigueModifier(actor),
      targetFatigueModifier: getFatigueModifier(target),
      actorStanceModifier,
      targetDefensiveModifier,
      actorWeaponDefenseModifier: actorStats.weaponDefenseModifier || 0,
      actorWeaponSpeedModifier: actorStats.weaponSpeedModifier || 0,
      actorArmorProfileId: actorStats.armorProfileId || "",
      targetArmorProfileId: targetStats.armorProfileId || "",
      targetArmorReduction: armorReduction,
      weapon: weaponProfile.name,
      controlledCombat,
    },
    result: {
      resultBand,
      hit,
      attackScore,
      defenseScore,
      hitMargin,
      visibleStates: [buildVisibleState(actor), buildVisibleState(target)],
    },
    damage: {
      rawDamage,
      reduction,
      finalDamage,
      hpChange,
    },
    moraleChanges: moraleChange
      ? [
          {
            targetId: target.combatantId,
            before: moraleChange.before,
            after: moraleChange.after,
            delta: moraleChange.delta,
          },
        ]
      : [],
    fatigueChanges: [
      {
        targetId: actor.combatantId,
        combatFatigue: actor.combatFatigue,
      },
    ],
    injuriesCreated: injuryResult?.injury ? [injuryResult.injury] : [],
    narrativeSummary: hit
      ? `${actor.name} impacta a ${target.name} (${resultBand}) por ${finalDamage} de dano${controlledCombat ? " controlado" : ""}.`
      : `${actor.name} falla contra ${target.name} (${resultBand}).`,
  };
}

function resolveDefend({ actor }) {
  addCondition(actor, "defending");
  actor.stance = "defensive";
  applyFatigue(actor, 1);

  return {
    actionType: "defend",
    actorId: actor.combatantId,
    targetIds: [],
    rolls: {},
    modifiers: {},
    result: {
      resultBand: "defensive_stance",
      visibleStates: [buildVisibleState(actor)],
    },
    damage: {},
    moraleChanges: [],
    fatigueChanges: [{ targetId: actor.combatantId, combatFatigue: actor.combatFatigue }],
    injuriesCreated: [],
    narrativeSummary: `${actor.name} adopta una postura defensiva.`,
  };
}

function resolveBlock({ actor, gameState }) {
  const stats = getCombatantStats({ combatant: actor, gameState });
  const equipmentModifier = getBlockingEquipmentModifier(actor);
  addCondition(actor, "blocking");
  actor.stance = "guarded";
  applyFatigue(actor, 2);

  return {
    actionType: "block",
    actorId: actor.combatantId,
    targetIds: [],
    rolls: {},
    modifiers: {
      blockSkill: stats.blockSkill || 0,
      equipmentModifier,
      expectedDefenseBonus: 4 + Math.floor(numberOr(stats.blockSkill, 0) / 2) + equipmentModifier,
    },
    result: {
      resultBand: "blocking_guard",
      visibleStates: [buildVisibleState(actor)],
    },
    damage: {},
    moraleChanges: [],
    fatigueChanges: [{ targetId: actor.combatantId, combatFatigue: actor.combatFatigue }],
    injuriesCreated: [],
    narrativeSummary: `${actor.name} levanta una guardia de bloqueo.`,
  };
}

function resolveDodge({ actor, encounter, gameState }) {
  const stats = getCombatantStats({ combatant: actor, gameState });
  const terrainModifier = getDodgeTerrainModifier(encounter, actor);
  addCondition(actor, "dodging");
  actor.stance = "evasive";
  applyFatigue(actor, terrainModifier < 0 ? 5 : 4);

  return {
    actionType: "dodge",
    actorId: actor.combatantId,
    targetIds: [],
    rolls: {},
    modifiers: {
      dodgeSkill: stats.dodgeSkill || 0,
      terrainModifier,
      expectedDefenseBonus: 5 + Math.floor(numberOr(stats.dodgeSkill, 0) / 2) + terrainModifier,
    },
    result: {
      resultBand: "evasive_guard",
      visibleStates: [buildVisibleState(actor)],
    },
    damage: {},
    moraleChanges: [],
    fatigueChanges: [{ targetId: actor.combatantId, combatFatigue: actor.combatFatigue }],
    injuriesCreated: [],
    narrativeSummary: `${actor.name} se concentra en esquivar y abrir angulo.`,
  };
}

function resolveObserve({ actor, target }) {
  addCondition(actor, "focused");

  return {
    actionType: "observe",
    actorId: actor.combatantId,
    targetIds: target ? [target.combatantId] : [],
    rolls: {},
    modifiers: {},
    result: {
      resultBand: "observed",
      visibleStates: [actor, target].filter(Boolean).map(buildVisibleState),
    },
    damage: {},
    moraleChanges: [],
    fatigueChanges: [],
    injuriesCreated: [],
    narrativeSummary: target
      ? `${actor.name} observa a ${target.name} y confirma su estado visible.`
      : `${actor.name} observa el combate.`,
  };
}

function getNextDistanceBand(current, direction) {
  const order = ["grappled", "engaged", "near", "short", "medium", "far", "out_of_sight"];
  const index = Math.max(0, order.indexOf(current));
  if (direction === "closer") return order[Math.max(0, index - 1)];
  return order[Math.min(order.length - 1, index + 1)];
}

function resolveMove({ encounter, actor, target, params = {} }) {
  const currentDistance = target ? getDistance(encounter, actor.combatantId, target.combatantId) : "near";
  const desiredDistance = params.distanceBand || getNextDistanceBand(currentDistance, params.direction === "closer" ? "closer" : "farther");
  if (target) setDistance(encounter, actor.combatantId, target.combatantId, desiredDistance);
  actor.positionState = params.positionState || actor.positionState || "standing";
  applyFatigue(actor, 2);

  return {
    actionType: "move",
    actorId: actor.combatantId,
    targetIds: target ? [target.combatantId] : [],
    rolls: {},
    modifiers: {
      currentDistance,
      desiredDistance,
    },
    result: {
      resultBand: "position_changed",
      visibleStates: [buildVisibleState(actor)],
    },
    damage: {},
    moraleChanges: [],
    fatigueChanges: [{ targetId: actor.combatantId, combatFatigue: actor.combatFatigue }],
    injuriesCreated: [],
    narrativeSummary: target
      ? `${actor.name} cambia la distancia frente a ${target.name}: ${currentDistance} -> ${desiredDistance}.`
      : `${actor.name} se reposiciona.`,
  };
}

function resolveIntimidate({ rng, actor, target, gameState, enemy }) {
  const actorStats = getCombatantStats({ combatant: actor, gameState });
  const targetStats = getCombatantStats({ combatant: target, enemy, gameState });
  const pressureRoll = rollDie(rng, 20);
  const resistRoll = rollDie(rng, 20);
  const pressureScore =
    actorStats.perception + Math.floor(actorStats.attack / 2) + pressureRoll + getStanceModifier(actor, "attack", actorStats);
  const resistScore = targetStats.morale + Math.floor(targetStats.perception / 2) + resistRoll + getFatigueModifier(target);
  const margin = pressureScore - resistScore;
  const moraleDamage = margin > 0 ? clamp(Math.floor(margin / 3) + 1, 1, 10) : 0;
  const moraleChange = moraleDamage > 0 ? adjustResource(target.morale, -moraleDamage) : null;

  if (moraleChange) {
    target.morale = moraleChange.pool;
    applyStress(target, moraleDamage);
  }
  applyFatigue(actor, 2);

  return {
    actionType: "intimidate",
    actorId: actor.combatantId,
    targetIds: [target.combatantId],
    rolls: { pressureRoll, resistRoll },
    modifiers: { pressureScore, resistScore, margin },
    result: {
      resultBand: moraleDamage > 0 ? "morale_pressure" : "resisted",
      visibleStates: [buildVisibleState(actor), buildVisibleState(target)],
    },
    damage: {},
    moraleChanges: moraleChange
      ? [{ targetId: target.combatantId, before: moraleChange.before, after: moraleChange.after, delta: moraleChange.delta }]
      : [],
    fatigueChanges: [{ targetId: actor.combatantId, combatFatigue: actor.combatFatigue }],
    injuriesCreated: [],
    narrativeSummary: moraleDamage > 0
      ? `${actor.name} presiona la moral de ${target.name}.`
      : `${target.name} resiste la intimidacion de ${actor.name}.`,
  };
}

function resolvePrepare({ actor }) {
  addCondition(actor, "prepared");
  actor.stance = "ready";
  applyFatigue(actor, 1);
  return {
    actionType: "prepare",
    actorId: actor.combatantId,
    targetIds: [],
    rolls: {},
    modifiers: {},
    result: {
      resultBand: "prepared",
      visibleStates: [buildVisibleState(actor)],
    },
    damage: {},
    moraleChanges: [],
    fatigueChanges: [{ targetId: actor.combatantId, combatFatigue: actor.combatFatigue }],
    injuriesCreated: [],
    narrativeSummary: `${actor.name} se prepara para la siguiente accion.`,
  };
}

function getFleeDistanceModifier(distanceBand) {
  if (distanceBand === "grappled") return -8;
  if (distanceBand === "engaged") return -4;
  if (distanceBand === "near") return -1;
  if (distanceBand === "short") return 2;
  if (distanceBand === "medium") return 5;
  if (distanceBand === "far") return 8;
  if (distanceBand === "out_of_sight") return 12;
  return 0;
}

function getEscapeRouteModifier(encounter) {
  const routes = encounter?.escapeRoutes || [];
  if (routes.length === 0) return 0;
  const usableRoutes = routes.filter((route) => !route.blocked);
  if (usableRoutes.length === 0) return -6;
  if (usableRoutes.some((route) => route.riskLevel === "safe")) return 3;
  if (usableRoutes.some((route) => route.riskLevel === "low")) return 2;
  if (usableRoutes.some((route) => route.riskLevel === "medium")) return 0;
  if (usableRoutes.some((route) => route.riskLevel === "high")) return -2;
  return -1;
}

function resolveFlee({ rng, encounter, actor, target, gameState, enemy }) {
  const actorStats = getCombatantStats({ combatant: actor, enemy, gameState });
  const targetStats = target ? getCombatantStats({ combatant: target, enemy, gameState }) : {};
  const fleeRoll = rollDie(rng, 20);
  const pursuitRoll = target ? rollDie(rng, 20) : 0;
  const distanceBand = target ? getDistance(encounter, actor.combatantId, target.combatantId) : "near";
  const terrainPenalty = (encounter.terrainTags || []).reduce((total, tag) => {
    if (["mud", "roots"].includes(tag)) return total - 2;
    if (["narrow_path", "uneven_ground", "darkness", "poor_visibility"].includes(tag)) return total - 1;
    return total;
  }, 0);
  const distanceModifier = getFleeDistanceModifier(distanceBand);
  const escapeRouteModifier = getEscapeRouteModifier(encounter);
  const retreatSkillModifier = Math.floor(numberOr(actorStats.retreatSkill, 0) / 2) + Math.floor(numberOr(actorStats.tacticsSkill, 0) / 4);
  const fleeScore =
    actorStats.speed +
    retreatSkillModifier +
    fleeRoll +
    getFatigueModifier(actor) +
    terrainPenalty +
    distanceModifier +
    escapeRouteModifier;
  const pursuitScore = target
    ? targetStats.speed + pursuitRoll + getFatigueModifier(target) + (distanceBand === "grappled" ? 4 : 0)
    : 0;
  const escaped = !target || fleeScore >= pursuitScore + 2;
  applyFatigue(actor, 5);

  if (!escaped) {
    actor.positionState = "off_balance";
    addCondition(actor, "exposed");
  } else if (target) {
    setDistance(encounter, actor.combatantId, target.combatantId, "out_of_sight");
    addCondition(actor, "fleeing");
  }

  return {
    actionType: "flee",
    actorId: actor.combatantId,
    targetIds: target ? [target.combatantId] : [],
    rolls: { fleeRoll, pursuitRoll },
    modifiers: {
      fleeScore,
      pursuitScore,
      terrainPenalty,
      distanceBand,
      distanceModifier,
      escapeRouteModifier,
      retreatSkillModifier,
    },
    result: {
      resultBand: escaped ? "escaped" : "failed_escape",
      escaped,
      visibleStates: [actor, target].filter(Boolean).map(buildVisibleState),
    },
    damage: {},
    moraleChanges: [],
    fatigueChanges: [{ targetId: actor.combatantId, combatFatigue: actor.combatFatigue }],
    injuriesCreated: [],
    narrativeSummary: escaped
      ? `${actor.name} logra retirarse del combate.`
      : `${actor.name} intenta retirarse, pero no consigue abrir distancia suficiente.`,
  };
}

function resolveSurrender({ actor }) {
  actor.canAct = false;
  addCondition(actor, "surrendering");
  return {
    actionType: "surrender",
    actorId: actor.combatantId,
    targetIds: [],
    rolls: {},
    modifiers: {},
    result: {
      resultBand: "surrendered",
      visibleStates: [buildVisibleState(actor)],
    },
    damage: {},
    moraleChanges: [],
    fatigueChanges: [],
    injuriesCreated: [],
    narrativeSummary: `${actor.name} se rinde.`,
  };
}

function getMagicDistanceModifier(distanceBand) {
  if (distanceBand === "grappled") return -6;
  if (distanceBand === "engaged") return -2;
  if (distanceBand === "near") return 1;
  if (distanceBand === "short") return 2;
  if (distanceBand === "medium") return 0;
  if (distanceBand === "far") return -4;
  if (distanceBand === "out_of_sight") return -12;
  return 0;
}

async function resolveUseMagic({ rng, encounter, actor, target, gameState, enemy, params = {}, actionId }) {
  const techniqueId = params.techniqueId || "";
  if (!techniqueId) throw makeError("use_magic requiere params.techniqueId.", 400);
  if (!target) throw makeError("use_magic requiere objetivo valido.", 400);

  const { technique, known } = await getKnownMagicTechniqueForCombat({ gameState, techniqueId });
  if (!technique) throw makeError(`No existe tecnica magica: ${techniqueId}.`, 404);
  if (!known) throw makeError(`Lucas no conoce formalmente el hechizo ${techniqueId}.`, 400);
  if (!isSimpleOffensiveCombatSpell(technique)) {
    throw makeError(`El combate avanzado solo permite hechizos ofensivos reales simples: ${techniqueId}.`, 400);
  }

  const mpCost = getMagicMpCost(technique);
  const mpBefore = numberOr(actor.mp?.current, gameState.lucasStatus?.mp?.current ?? 0);
  if (mpCost > mpBefore) {
    throw makeError("MP insuficiente para lanzar el hechizo.", 400, { techniqueId, mpCost, currentMp: mpBefore });
  }

  const actorStats = getCombatantStats({ combatant: actor, enemy, gameState });
  const targetStats = getCombatantStats({ combatant: target, enemy, gameState });
  const magicSkill = getSkillLevel(gameState, ["skill_magia_ofensiva", "skill_magia"]);
  const manaSkill = getSkillLevel(gameState, ["skill_mana"]);
  const attackRoll = rollDie(rng, 20);
  const resistRoll = rollDie(rng, 20);
  const damageRoll = rollDie(rng, 4);
  const distanceBand = getDistance(encounter, actor.combatantId, target.combatantId);
  const distanceModifier = getMagicDistanceModifier(distanceBand);
  const terrainAttackModifier = getTerrainModifier(encounter, actor);
  const terrainDefenseModifier = getTerrainModifier(encounter, target);
  const actorStanceModifier = getStanceModifier(actor, "attack", actorStats, encounter);
  const targetDefensiveModifier = getStanceModifier(target, "defense", targetStats, encounter);
  const attackScore =
    magicSkill * 2 +
    Math.floor(manaSkill / 2) +
    Math.floor(actorStats.perception / 3) +
    attackRoll +
    distanceModifier +
    terrainAttackModifier +
    actorStanceModifier +
    getFatigueModifier(actor);
  const defenseScore =
    targetStats.agility +
    Math.floor(targetStats.perception / 2) +
    resistRoll +
    terrainDefenseModifier +
    targetDefensiveModifier +
    getFatigueModifier(target);
  const hitMargin = attackScore - defenseScore;
  const resultBand = classifyHit(hitMargin);
  const hit = !["bad_miss", "miss"].includes(resultBand);
  const hitBonus = getDamageBonusFromHit(resultBand, hitMargin);
  const rawDamage = hit ? 1 + Math.floor(magicSkill / 3) + damageRoll + Math.min(hitBonus, 4) : 0;
  const reduction = hit ? Math.floor(targetStats.endurance / 8) + Math.floor(targetStats.defense / 10) : 0;
  let finalDamage = hit ? Math.max(0, rawDamage - reduction) : 0;
  const controlledCombat = isControlledCombat(encounter);
  if (controlledCombat) {
    const safeDamageCap = Math.max(0, numberOr(target.hp?.current, 0) - 1);
    finalDamage = Math.min(finalDamage, safeDamageCap, 1);
  }

  const hpChange = finalDamage > 0 ? adjustResource(target.hp, -finalDamage) : null;
  const moraleDamage = finalDamage > 0 ? Math.max(1, Math.floor(finalDamage / 2)) : hit ? 1 : 0;
  const moraleChange = moraleDamage > 0 ? adjustResource(target.morale, -moraleDamage) : null;
  const mpChange = adjustResource(actor.mp || { current: mpBefore, max: gameState.lucasStatus?.mp?.max || mpBefore }, -mpCost);
  const injuryResult = controlledCombat
    ? { injuryRoll: null, injury: null }
    : maybeCreateInjury({
        rng,
        target,
        resultBand,
        finalDamage,
        damageType: technique.disciplineId === "discipline_fire" ? "burn" : "magic",
        encounter,
        actionId,
      });
  const gameTime = getCombatantGameTime(gameState, encounter);

  actor.mp = mpChange.pool;
  if (hpChange) target.hp = hpChange.pool;
  if (moraleChange) target.morale = moraleChange.pool;
  applyFatigue(actor, 4);
  if (hit) applyStress(target, Math.max(1, moraleDamage));
  removeCondition(actor, "prepared");
  removeCondition(actor, "focused");
  for (const condition of DEFENSIVE_CONDITIONS) removeCondition(target, condition);

  if (injuryResult?.injury) {
    injuryResult.injury.createdDay = gameTime.day;
    injuryResult.injury.createdTime = gameTime.time;
    target.injuries = Array.from(new Set([...(target.injuries || []), injuryResult.injury.injuryId]));
  }

  markDefeatedIfNeeded(target);

  return {
    actionType: "use_magic",
    actorId: actor.combatantId,
    targetIds: [target.combatantId],
    rolls: {
      attackRoll,
      resistRoll,
      damageRoll,
      injuryRoll: injuryResult?.injuryRoll || null,
    },
    modifiers: {
      techniqueId,
      techniqueName: technique.name,
      mpCost,
      magicSkill,
      manaSkill,
      distanceBand,
      distanceModifier,
      terrainAttackModifier,
      terrainDefenseModifier,
      attackFatigueModifier: getFatigueModifier(actor),
      targetFatigueModifier: getFatigueModifier(target),
      actorStanceModifier,
      targetDefensiveModifier,
      controlledCombat,
    },
    result: {
      resultBand,
      hit,
      attackScore,
      defenseScore,
      hitMargin,
      visibleStates: [buildVisibleState(actor), buildVisibleState(target)],
      spell: {
        techniqueId,
        techniqueName: technique.name,
        disciplineId: technique.disciplineId,
        combatUse: technique.effectProfile?.combatUse || "offensive_simple",
        isRealSpell: true,
        offensive: true,
      },
    },
    damage: {
      rawDamage,
      reduction,
      finalDamage,
      damageType: technique.disciplineId === "discipline_fire" ? "burn" : "magic",
      hpChange,
    },
    moraleChanges: moraleChange
      ? [{ targetId: target.combatantId, before: moraleChange.before, after: moraleChange.after, delta: moraleChange.delta }]
      : [],
    fatigueChanges: [{ targetId: actor.combatantId, combatFatigue: actor.combatFatigue }],
    resourceChanges: [
      {
        type: "mp",
        targetId: actor.combatantId,
        before: mpChange.before,
        after: mpChange.after,
        delta: mpChange.delta,
        reason: "combat_use_magic",
      },
    ],
    injuriesCreated: injuryResult?.injury ? [injuryResult.injury] : [],
    narrativeSummary: hit
      ? `${actor.name} lanza ${technique.name} contra ${target.name}: impacto ${resultBand}, dano ${finalDamage}, MP -${mpCost}.`
      : `${actor.name} intenta ${technique.name}, pero falla el control contra ${target.name}; MP -${mpCost}.`,
  };
}

async function resolveUseItem({ actor, gameState, params = {} }) {
  const itemId = params.itemId || "";
  const injuryId = params.injuryId || "";
  if (!itemId) throw makeError("use_item requiere params.itemId.", 400);
  if (!injuryId) throw makeError("use_item de tratamiento requiere params.injuryId.", 400);

  const inventoryEntry = getInventoryEntry(gameState, itemId);
  if (!inventoryEntry) throw makeError(`Lucas no tiene ${itemId} en inventario disponible.`, 400);

  const [item, injury] = await Promise.all([
    Item.findOne({ itemId }).lean(),
    InjuryRecord.findOne({ gameId: gameState.gameId, injuryId }),
  ]);
  const itemUse = getCombatItemUseDefinition(item);
  if (!itemUse.supported) throw makeError(itemUse.reason, 400, { itemId });
  if (!injury) throw makeError(`No existe InjuryRecord para tratar: ${injuryId}.`, 404);
  if (injury.targetType !== "character" || injury.targetId !== "char_lucas") {
    throw makeError("C8 solo permite usar objetos de tratamiento sobre heridas de Lucas.", 400, {
      injuryId,
      targetType: injury.targetType,
      targetId: injury.targetId,
    });
  }

  const treatmentType = itemUse.treatmentType || "field_dressing";
  const plan = buildTreatmentPlan(injury, {
    treatmentType,
    quality: itemUse.quality || "basic",
  });
  if (!plan.canTreat) {
    throw makeError(`La herida no admite tratamiento en estado ${injury.status}.`, 400, {
      injuryId,
      status: injury.status,
    });
  }
  if (itemUse.itemUseType === "ointment" && numberOr(injury.pain, 0) <= 0) {
    throw makeError("El unguento no tiene efecto inmediato: la herida no registra dolor tratable.", 400, {
      injuryId,
    });
  }

  injury.bleeding = plan.bleeding.after;
  injury.pain = plan.pain.after;
  injury.requiresTreatment = plan.requiresTreatment.after;
  injury.untreatedRisk = plan.untreatedRisk.after;
  injury.treated = true;
  injury.treatmentQuality = plan.quality;
  injury.status = plan.status.after;
  injury.flags = {
    ...(injury.flags || {}),
    treatments: [
      ...(injury.flags?.treatments || []),
      {
        day: gameState.currentDay,
        time: gameState.time,
        treatmentType,
        quality: plan.quality,
        source: "combat_use_item",
        itemId,
      },
    ],
  };
  injury.markModified("flags");

  const legacyInjury = syncLegacyLucasInjuryTreatment(gameState, injuryId, plan);
  if (legacyInjury) gameState.markModified("lucasStatus.injuries");
  const inventoryChange = consumeInventoryItem(gameState, itemId, 1);

  addCondition(actor, "treating");
  applyFatigue(actor, 2);

  return {
    actionType: "use_item",
    actorId: actor.combatantId,
    targetIds: [],
    rolls: {},
    modifiers: {
      itemId,
      itemName: item.name,
      itemUseType: itemUse.itemUseType,
      treatmentType,
      treatmentQuality: plan.quality,
      willRestoreLife: false,
    },
    result: {
      resultBand: "item_used",
      itemId,
      injuryId,
      treatment: plan,
      visibleStates: [buildVisibleState(actor)],
    },
    damage: {},
    moraleChanges: [],
    fatigueChanges: [{ targetId: actor.combatantId, combatFatigue: actor.combatFatigue }],
    resourceChanges: [
      {
        type: "inventory",
        itemId,
        before: inventoryChange.before,
        after: inventoryChange.after,
        delta: inventoryChange.delta,
      },
    ],
    inventoryChanges: [
      {
        ...inventoryChange,
        itemName: item.name,
        reason: "combat_use_item",
      },
    ],
    injuriesCreated: [],
    injuriesTreated: [
      {
        injuryId,
        treatment: plan,
      },
    ],
    injuryRecordsToSave: [injury],
    narrativeSummary: `${actor.name} usa ${item.name} para aplicar ${treatmentType} a la herida ${injuryId}.`,
  };
}

function getEnemyMoraleBreakThreshold(enemy) {
  const profile = enemy?.moraleProfile || {};
  return Math.max(numberOr(profile.breaksAt, 0), numberOr(profile.fleesAt, 0));
}

function isEnemyMoraleBroken(combatant, enemy) {
  if (!combatant || combatant.side !== "enemy") return false;
  return numberOr(combatant.morale?.current, 0) <= getEnemyMoraleBreakThreshold(enemy);
}

function resolveEnemyMoraleBreak({ actor }) {
  actor.canAct = false;
  addCondition(actor, "fleeing");
  addCondition(actor, "morale_broken");

  return {
    actionType: "flee",
    actorId: actor.combatantId,
    targetIds: [],
    rolls: {},
    modifiers: {
      moraleBreak: true,
      moraleCurrent: numberOr(actor.morale?.current, 0),
    },
    result: {
      resultBand: "morale_break_flee",
      escaped: true,
      moraleBreak: true,
      visibleStates: [buildVisibleState(actor)],
    },
    damage: {},
    moraleChanges: [],
    fatigueChanges: [],
    injuriesCreated: [],
    narrativeSummary: `${actor.name} rompe moral y abandona el combate.`,
  };
}

function getPoolRatio(pool = {}) {
  return clamp(numberOr(pool.current, 0) / Math.max(1, numberOr(pool.max, 1)), 0, 1);
}

function hasCondition(combatant, condition) {
  return (combatant?.conditions || []).includes(condition);
}

function getDistancePressure(distanceBand = "near") {
  if (["grappled", "engaged"].includes(distanceBand)) return 2;
  if (distanceBand === "near") return 1;
  if (["short", "medium"].includes(distanceBand)) return -1;
  if (["far", "out_of_sight"].includes(distanceBand)) return -2;
  return 0;
}

function scorePreferredNpcActions(scores, preferredActions = [], avoidsActions = []) {
  for (const actionType of preferredActions || []) {
    if (Object.prototype.hasOwnProperty.call(scores, actionType)) scores[actionType] += 8;
  }
  for (const actionType of avoidsActions || []) {
    if (Object.prototype.hasOwnProperty.call(scores, actionType)) scores[actionType] -= 18;
  }
}

function chooseNpcCombatDecision({ rng, encounter, actor, target, gameState, enemy }) {
  const policy = encounter.flags?.encounterPolicy || buildEncounterPolicy({
    enemy,
    encounterType: encounter.flags?.encounterType || "",
    combatMode: encounter.flags?.combatMode || "real",
    sourceEventId: encounter.sourceEventId || "",
    sourceMissionId: encounter.sourceMissionId || "",
    sourceCommitmentId: encounter.sourceCommitmentId || "",
    reason: encounter.reason || "",
  });
  const behavior = enemy?.behaviorProfile || {};
  const archetype = behavior.archetype || policy.enemyArchetype || "unknown";
  const distanceBand = target ? getDistance(encounter, actor.combatantId, target.combatantId) : "near";
  const hpRatio = getPoolRatio(actor.hp);
  const moraleRatio = getPoolRatio(actor.morale);
  const targetHpRatio = getPoolRatio(target?.hp || {});
  const moraleCurrent = numberOr(actor.morale?.current, 0);
  const fleesAt = Math.max(numberOr(policy.moraleFleesAt, 0), numberOr(enemy?.moraleProfile?.fleesAt, 0));
  const breaksAt = Math.max(numberOr(policy.moraleBreaksAt, 0), numberOr(enemy?.moraleProfile?.breaksAt, 0));
  const round = numberOr(encounter.round || encounter.currentRound, 1);
  const fatigue = numberOr(actor.combatFatigue, 0);
  const targetExposed = hasCondition(target, "exposed") || hasCondition(target, "off_balance");
  const targetDefensive = DEFENSIVE_CONDITIONS.some((condition) => hasCondition(target, condition));
  const controlledCombat = isControlledCombat(encounter);
  const distancePressure = getDistancePressure(distanceBand);
  const reasons = [];
  const scores = {
    attack: 42,
    flee: 4,
    intimidate: 0,
    move: 0,
    prepare: 0,
    defend: 0,
  };

  if (controlledCombat) {
    scores.attack -= 8;
    scores.prepare += 18;
    scores.defend += 12;
    reasons.push("modo controlado");
  }

  if (distancePressure < 0) {
    scores.move += 25 + Math.abs(distancePressure) * 4;
    scores.attack -= 10;
    reasons.push(`distancia ${distanceBand}`);
  } else if (distancePressure > 0) {
    scores.attack += 6;
  }

  if (hpRatio <= 0.25) {
    scores.flee += 58;
    scores.attack -= 18;
    reasons.push("hp critico");
  } else if (hpRatio <= 0.45) {
    scores.flee += 30;
    scores.defend += 10;
    reasons.push("hp bajo");
  }

  if (moraleCurrent <= breaksAt || moraleRatio <= 0.18) {
    scores.flee += 70;
    scores.attack -= 20;
    reasons.push("moral rota o casi rota");
  } else if (moraleCurrent <= fleesAt || moraleRatio <= 0.35) {
    scores.flee += 36;
    scores.intimidate -= 8;
    reasons.push("moral baja");
  }

  if (fatigue >= 28) {
    scores.flee += 20;
    scores.defend += 10;
    scores.attack -= 10;
    reasons.push("fatiga alta");
  } else if (fatigue >= 16) {
    scores.defend += 8;
    scores.prepare += 5;
    reasons.push("fatiga moderada");
  }

  if (targetExposed) {
    scores.attack += 18;
    reasons.push("objetivo expuesto");
  }
  if (targetDefensive) {
    scores.intimidate += 8;
    scores.prepare += 8;
    scores.attack -= 6;
    reasons.push("objetivo en guardia");
  }
  if (targetHpRatio > 0 && targetHpRatio <= 0.35) {
    scores.attack += 12;
    scores.intimidate += 8;
    reasons.push("objetivo debilitado");
  }

  if (policy.encounterType === "bandit_robbery" || archetype === "opportunist") {
    scores.intimidate += round <= 1 ? 56 : 14;
    scores.flee += hpRatio <= 0.55 || moraleRatio <= 0.45 ? 24 : 4;
    scores.attack += targetExposed ? 8 : -2;
    reasons.push("perfil oportunista/coercitivo");
  }

  if (policy.encounterType === "territorial_creature" || ["territorial", "protective"].includes(archetype)) {
    scores.attack += distancePressure >= 0 ? 14 : 0;
    scores.move += distancePressure < 0 ? 18 : 0;
    scores.flee += hpRatio <= 0.4 ? 24 : 0;
    scores.intimidate -= 12;
    reasons.push("perfil territorial");
  }

  if (policy.encounterType === "predatory_hunt" || ["predatory", "hungry"].includes(archetype)) {
    scores.attack += targetHpRatio <= 0.5 ? 20 : 10;
    scores.flee += hpRatio <= 0.45 || moraleRatio <= 0.45 ? 26 : 0;
    scores.prepare += distancePressure < 0 ? 8 : 0;
    reasons.push("perfil depredador");
  }

  if (archetype === "cowardly") {
    scores.flee += hpRatio < 0.8 || moraleRatio < 0.8 ? 30 : 8;
    scores.attack -= 8;
    reasons.push("perfil cobarde");
  }

  if (archetype === "mindless") {
    scores.attack += 36;
    scores.flee -= 40;
    scores.intimidate -= 30;
    reasons.push("perfil sin criterio social");
  }

  if (["ambush", "mission_combat"].includes(policy.encounterType)) {
    scores.attack += round <= 1 ? 12 : 4;
    reasons.push(`encuentro ${policy.encounterType}`);
  }

  scorePreferredNpcActions(scores, policy.preferredNpcActions, policy.avoidsNpcActions);

  if (!target) {
    scores.attack = -1000;
    scores.intimidate = -1000;
    scores.move += 12;
  }
  if (distanceBand === "out_of_sight") {
    scores.attack = -1000;
    scores.intimidate = -1000;
    scores.flee += 12;
  }
  if (!policy.surrenderPossible) {
    // Surrender remains a manual/end-state concern for now; keep C12 choices to supported NPC actions.
  }

  const tieBreaker = rollDie(rng, 6) / 100;
  const ranked = Object.entries(scores)
    .map(([actionType, score]) => ({
      actionType,
      score: Number((score + tieBreaker).toFixed(2)),
    }))
    .sort((left, right) => right.score - left.score);
  const selected = ranked[0]?.actionType || "attack";
  const moveDirection = selected === "move" && hpRatio <= 0.45 ? "farther" : "closer";

  return {
    version: "C12",
    selectedAction: selected,
    reason: reasons.join("; ") || "perfil enemigo y estado actual",
    scores,
    ranked: ranked.slice(0, 4),
    policy: {
      encounterType: policy.encounterType,
      enemyGoal: policy.enemyGoal,
      stakes: policy.stakes,
      enemyArchetype: policy.enemyArchetype,
    },
    state: {
      hpRatio: Number(hpRatio.toFixed(2)),
      moraleRatio: Number(moraleRatio.toFixed(2)),
      moraleCurrent,
      fleesAt,
      breaksAt,
      fatigue,
      distanceBand,
      targetHpRatio: Number(targetHpRatio.toFixed(2)),
    },
    params: selected === "move" ? { direction: moveDirection } : {},
    gptBoundary: "Narrar esta decision; no cambiar actionType ni resultado mecanico.",
  };
}

function attachNpcDecision(resolution, decision) {
  return {
    ...resolution,
    modifiers: {
      ...(resolution.modifiers || {}),
      npcDecision: decision,
    },
    narrativeSummary: `${resolution.narrativeSummary} Decision NPC C12: ${decision.selectedAction} (${decision.reason}).`,
  };
}

async function finalizeEncounterFatigueIfNeeded({ gameState, encounter }) {
  if (encounter.status === "active") return null;
  if (encounter.flags?.combatFatigueConverted) return null;

  const lucas = (encounter.participants || []).find((entry) => entry.side === "lucas");
  const energyDelta = fatigueToEnergyCost(lucas?.combatFatigue || 0);
  const energy = gameState.lucasStatus?.energy;
  let energyChange = null;

  if (energy && energyDelta !== 0) {
    const before = energy.current;
    energy.current = clamp(before + energyDelta, 0, energy.max);
    energyChange = {
      before,
      delta: energy.current - before,
      after: energy.current,
      sourceFatigue: lucas.combatFatigue || 0,
    };
  }

  encounter.flags = {
    ...(encounter.flags || {}),
    combatFatigueConverted: true,
  };

  return energyChange;
}

function applyEndStateFromCombatants({ encounter, actor, target, actionType, resolution, enemy = null }) {
  if (target) {
    markDefeatedIfNeeded(target);
    if (target.side === "enemy") {
      syncEnemyStatusFromCombatant(encounter, target);
      if (numberOr(target.hp?.current, 0) <= 0) {
        encounter.status = "won";
        encounter.phase = "ending";
        encounter.currentActorId = "";
      } else if (isEnemyMoraleBroken(target, enemy)) {
        encounter.status = "enemy_fled";
        encounter.phase = "ending";
        encounter.currentActorId = "";
      }
    } else if (target.side === "lucas" && numberOr(target.hp?.current, 0) <= 0) {
      encounter.status = "lost";
      encounter.phase = "ending";
      encounter.currentActorId = "";
    }
  }

  if (actionType === "flee" && resolution.result?.escaped) {
    encounter.status = actor.side === "enemy" ? "enemy_fled" : "escaped";
    encounter.phase = "ending";
    encounter.currentActorId = "";
  }

  if (actionType === "surrender") {
    encounter.status = "surrendered";
    encounter.phase = "ending";
    encounter.currentActorId = "";
  }
}

function advanceTurnAfterPlayerAction(encounter) {
  if (encounter.status !== "active") {
    encounter.phase = "ending";
    encounter.currentActorId = "";
    return;
  }

  const enemyActorId = getNextActorId(encounter, "enemy");
  encounter.phase = enemyActorId ? "npc_turn" : "round_end";
  encounter.currentActorId = enemyActorId;
}

function advanceTurnAfterNpcAction(encounter) {
  if (encounter.status !== "active") {
    encounter.phase = "ending";
    encounter.currentActorId = "";
    return;
  }

  const lucasActorId = getNextActorId(encounter, "lucas");
  encounter.phase = "player_turn";
  encounter.currentActorId = lucasActorId;
  encounter.round = numberOr(encounter.round || encounter.currentRound, 1) + 1;
  encounter.currentRound = numberOr(encounter.currentRound || encounter.round, 1) + 1;
}

async function persistResolution({
  gameState,
  encounter,
  preview = null,
  changedCombatants = [],
  resolution,
  autoCheckpoint = null,
}) {
  const gameTime = getCombatantGameTime(gameState, encounter);
  const injuries = resolution.injuriesCreated || [];
  const injuryRecordsToSave = resolution.injuryRecordsToSave || [];
  if (injuries.length > 0) {
    await InjuryRecord.insertMany(injuries, { ordered: true });
    for (const injury of injuries) {
      if (injury.targetType === "character" && injury.targetId === "char_lucas") {
        const legacy = toLegacyLucasInjury(injury);
        if (legacy) gameState.lucasStatus.injuries.push(legacy);
      }
    }
  }

  for (const combatant of changedCombatants) {
    updateEncounterCombatant(encounter, combatant);
    if (combatant.side === "enemy") syncEnemyStatusFromCombatant(encounter, combatant);
    if (combatant.side === "lucas") updateLucasGameStateFromCombatant(gameState, combatant);
  }

  encounter.elapsedSeconds = numberOr(encounter.elapsedSeconds, 0) + numberOr(encounter.roundDurationSeconds, 6);
  encounter.pendingClockAdvanceSeconds =
    numberOr(encounter.pendingClockAdvanceSeconds, 0) + numberOr(encounter.roundDurationSeconds, 6);
  encounter.encounterVersion = numberOr(encounter.encounterVersion, 1) + 1;
  encounter.flags = {
    ...(encounter.flags || {}),
    c4Resolution: true,
  };

  if (encounter.status !== "active") {
    encounter.endedDay = gameTime.day;
    encounter.endedTime = gameTime.time;
    await finalizeEncounterFatigueIfNeeded({ gameState, encounter });
  }

  const logId = createId("combat_log");
  const logEntry = await CombatLogEntry.create({
    logId,
    encounterId: encounter.encounterId,
    gameId: encounter.gameId,
    round: encounter.round || encounter.currentRound || 1,
    phase: encounter.phase || "",
    actorId: resolution.actorId || "",
    actorName: changedCombatants.find((entry) => entry.combatantId === resolution.actorId)?.name || "",
    actionType: resolution.actionType,
    targetIds: resolution.targetIds || [],
    previewId: preview?.previewId || "",
    rolls: resolution.rolls || {},
    modifiers: resolution.modifiers || {},
    result: resolution.result || {},
    damage: resolution.damage || {},
    injuriesCreated: injuries.map((injury) => injury.injuryId),
    positionChanges: resolution.positionChanges || [],
    moraleChanges: resolution.moraleChanges || [],
    fatigueChanges: resolution.fatigueChanges || [],
    resourceChanges: resolution.resourceChanges || [],
    inventoryChanges: resolution.inventoryChanges || [],
    lootChanges: [],
    evidenceChanges: [],
    missionChanges: [],
    eventChanges: [],
    narrativeSummary: resolution.narrativeSummary,
    visibility: "private",
    createdDay: gameTime.day,
    createdTime: gameTime.time,
    elapsedSeconds: encounter.elapsedSeconds,
  });

  encounter.combatLogIds = Array.from(new Set([...(encounter.combatLogIds || []), logId]));
  encounter.combatLog.push({
    round: encounter.currentRound || encounter.round || 1,
    summary: resolution.narrativeSummary,
    lucasChanges: resolution.lucasChanges || {},
    enemyChanges: resolution.enemyChanges || {},
    injuriesAdded: injuries.map((injury) => ({
      injuryId: injury.injuryId,
      bodyPart: injury.bodyPart,
      severity: injury.severity,
      targetId: injury.targetId,
    })),
  });

  await Promise.all([
    persistCombatants(changedCombatants),
    ...injuryRecordsToSave.map((injury) => injury.save()),
    preview
      ? CombatActionPreview.updateOne(
          { previewId: preview.previewId },
          {
            $set: {
              status: "applied",
              invalidationReason: "",
            },
          }
        )
      : Promise.resolve(),
    preview
      ? CombatActionPreview.updateMany(
          {
            gameId: encounter.gameId,
            encounterId: encounter.encounterId,
            status: "pending",
            previewId: { $ne: preview.previewId },
          },
          {
            $set: {
              status: "invalidated",
              invalidationReason: "El encuentro avanzo.",
            },
          }
        )
      : CombatActionPreview.updateMany(
          {
            gameId: encounter.gameId,
            encounterId: encounter.encounterId,
            status: "pending",
          },
          {
            $set: {
              status: "invalidated",
              invalidationReason: "El encuentro avanzo.",
            },
          }
        ),
  ]);

  await gameState.save();
  await encounter.save();

  await EventLog.create({
    logId: createId("log"),
    gameId: encounter.gameId,
    day: gameTime.day,
    timeStart: gameTime.time,
    timeEnd: gameTime.time,
    locationId: encounter.locationId,
    type: "combat_advanced_action",
    summary: resolution.narrativeSummary,
    involvedCharacterIds: ["char_lucas"],
    mechanicalChanges: {
      encounterId: encounter.encounterId,
      encounterStatus: encounter.status,
      actionType: resolution.actionType,
      combatLogId: logId,
      previewId: preview?.previewId || "",
      result: resolution.result,
      damage: resolution.damage,
      injuriesCreated: injuries.map((injury) => injury.injuryId),
      injuriesTreated: resolution.injuriesTreated || [],
      inventoryChanges: resolution.inventoryChanges || [],
      skillProgression: resolution.skillProgression || [],
    },
    visibility: "private",
    source: "system",
    tags: ["combat", "combat_advanced", "combat_resolution"],
  });

  return {
    encounter: summarizeEncounter(encounter.toObject()),
    logEntry: logEntry.toObject(),
    resolution: {
      ...Object.fromEntries(
        Object.entries(resolution).filter(([key]) => key !== "injuryRecordsToSave")
      ),
      injuriesCreated: injuries,
    },
    autoCheckpoint,
  };
}

async function applyAdvancedAction({ gameId = "isekai_lucas_main", previewId } = {}) {
  const { preview } = await validatePendingPreview({ previewId, gameId });
  const action = ACTIONS_BY_TYPE.get(preview.actionType);
  if (!action?.c4ApplySupported) {
    throw makeError(`La accion ${preview.actionType} todavia no tiene aplicacion real en C4.`, 501, {
      previewId: preview.previewId,
      actionType: preview.actionType,
    });
  }

  const { gameState, encounter, enemy, combatantDocs } = await loadMutableCombatState({
    gameId,
    encounterId: preview.encounterId,
  });

  const actor = getMutableCombatant(encounter, combatantDocs, preview.actorId);
  if (!actor) throw makeError(`No existe actor de combate: ${preview.actorId}`, 400);
  if (!["player_turn", "reaction_window"].includes(encounter.phase)) {
    throw makeError(`La fase actual no permite accion de Lucas: ${encounter.phase}`, 400);
  }
  if (preview.actorId !== encounter.currentActorId) {
    throw makeError("El actor del preview ya no es el actor actual del encuentro.", 409, {
      previewActorId: preview.actorId,
      currentActorId: encounter.currentActorId,
    });
  }
  if (!["lucas", "ally"].includes(actor.side)) {
    throw makeError("El actor del preview no pertenece al lado de Lucas.", 400);
  }
  if (actor.isAlive === false || actor.isConscious === false || actor.canAct === false) {
    throw makeError("El actor del preview no puede actuar.", 400);
  }

  const target = shouldResolveTargetForAction(preview.actionType)
    ? getResolvedTarget(encounter, combatantDocs, actor, preview.targetIds || [])
    : null;
  const rng = createDeterministicRng(preview.deterministicSeed || preview.previewId);
  let resolution;
  let usedWeaponProfile = null;

  if (preview.actionType === "attack") {
    if (!target) throw makeError("attack requiere objetivo valido.", 400);
    const weaponProfile = await getWeaponProfileForCombatant(actor);
    usedWeaponProfile = weaponProfile;
    resolution = resolveAttack({
      rng,
      encounter,
      gameState,
      enemy,
      actor,
      target,
      weaponProfile,
      actionId: preview.previewId,
    });
  } else if (preview.actionType === "defend") {
    resolution = resolveDefend({ actor });
  } else if (preview.actionType === "block") {
    resolution = resolveBlock({ actor, gameState });
  } else if (preview.actionType === "dodge") {
    resolution = resolveDodge({ actor, encounter, gameState });
  } else if (preview.actionType === "observe") {
    resolution = resolveObserve({ actor, target });
  } else if (preview.actionType === "move") {
    resolution = resolveMove({ encounter, actor, target, params: preview.params || {} });
  } else if (preview.actionType === "flee") {
    resolution = resolveFlee({ rng, encounter, actor, target, gameState, enemy });
  } else if (preview.actionType === "surrender") {
    resolution = resolveSurrender({ actor });
  } else if (preview.actionType === "use_magic") {
    if (!target) throw makeError("use_magic requiere objetivo valido.", 400);
    resolution = await resolveUseMagic({
      rng,
      encounter,
      actor,
      target,
      gameState,
      enemy,
      params: preview.params || {},
      actionId: preview.previewId,
    });
  } else if (preview.actionType === "use_item") {
    resolution = await resolveUseItem({ actor, gameState, params: preview.params || {} });
  } else if (preview.actionType === "intimidate") {
    if (!target) throw makeError("intimidate requiere objetivo valido.", 400);
    resolution = resolveIntimidate({ rng, actor, target, gameState, enemy });
  } else if (preview.actionType === "prepare") {
    resolution = resolvePrepare({ actor });
  } else {
    throw makeError(`Accion no soportada en C4: ${preview.actionType}`, 501);
  }

  const changedCombatants = [actor];
  if (target && target.combatantId !== actor.combatantId) changedCombatants.push(target);
  const skillProgression = applyCombatSkillAward({
    gameState,
    encounter,
    actor,
    resolution,
    weaponProfile: usedWeaponProfile,
  });
  if (skillProgression.length > 0) {
    resolution.skillProgression = skillProgression;
    resolution.resourceChanges = [
      ...(resolution.resourceChanges || []),
      ...skillProgression
        .filter((entry) => !entry.skipped)
        .map((entry) => ({
          type: "skill_progression",
          skillId: entry.skillId,
          category: entry.category,
          effectiveExpDelta: entry.validation?.effectiveExpDelta || 0,
          before: entry.progression?.before || null,
          after: entry.progression?.after || null,
          displayLine: entry.displayLine || "",
          displayLines: entry.displayLines || [],
          formatRuleId: entry.formatRuleId || "format.skill_progress",
        })),
    ];
  }

  applyEndStateFromCombatants({
    encounter,
    actor,
    target,
    actionType: preview.actionType,
    resolution,
    enemy,
  });
  advanceTurnAfterPlayerAction(encounter);

  const autoCheckpoint = await safeCombatCheckpoint({
    gameId,
    title: `Auto checkpoint - antes de accion ${preview.actionType}`,
    reason: `Checkpoint automatico antes de resolver accion de combate ${preview.actionType}.`,
    triggerKey: `combat_advanced_action:${preview.previewId}`,
    metadata: {
      source: "applyAdvancedAction",
      encounterId: encounter.encounterId,
      previewId: preview.previewId,
      actionType: preview.actionType,
    },
  });

  return persistResolution({
    gameState,
    encounter,
    preview,
    changedCombatants,
    resolution,
    autoCheckpoint,
  });
}

async function resolveNextNpcTurn({ gameId = "isekai_lucas_main", encounterId } = {}) {
  const { gameState, encounter, enemy, combatantDocs } = await loadMutableCombatState({ gameId, encounterId });
  if (encounter.status !== "active") {
    throw makeError(`El encuentro no esta activo. Estado actual: ${encounter.status}.`, 400);
  }
  if (encounter.phase !== "npc_turn") {
    throw makeError(`La fase actual no es npc_turn: ${encounter.phase}.`, 400);
  }

  const actorId = encounter.currentActorId || getNextActorId(encounter, "enemy");
  const actor = getMutableCombatant(encounter, combatantDocs, actorId);
  const target = getResolvedTarget(encounter, combatantDocs, actor, []);
  if (!actor || actor.side !== "enemy") throw makeError("No hay enemigo activo para resolver turno NPC.", 400);
  if (!target) throw makeError("No hay objetivo valido para el turno NPC.", 400);

  const rng = createDeterministicRng(
    hashObject({
      encounterId,
      round: encounter.round || encounter.currentRound || 1,
      actorId,
      actionType: "npc_turn",
      version: encounter.encounterVersion || 1,
    })
  );

  const moraleBroken = isEnemyMoraleBroken(actor, enemy);
  const decision = chooseNpcCombatDecision({ rng, encounter, actor, target, gameState, enemy });
  let resolution;

  if (moraleBroken) {
    resolution = attachNpcDecision(resolveEnemyMoraleBreak({ actor }), {
      ...decision,
      selectedAction: "flee",
      reason: "moral rota por umbral de perfil enemigo",
    });
  } else if (decision.selectedAction === "flee") {
    resolution = resolveFlee({ rng, encounter, actor, target, gameState, enemy });
  } else if (decision.selectedAction === "intimidate") {
    resolution = resolveIntimidate({ rng, actor, target, gameState, enemy });
  } else if (decision.selectedAction === "move") {
    resolution = resolveMove({ encounter, actor, target, params: decision.params || {} });
  } else if (decision.selectedAction === "prepare") {
    resolution = resolvePrepare({ actor });
  } else if (decision.selectedAction === "defend") {
    resolution = resolveDefend({ actor });
  } else {
    resolution = resolveAttack({
      rng,
      encounter,
      gameState,
      enemy,
      actor,
      target,
      weaponProfile: getEnemyAttackProfile(enemy),
      actionId: `npc_${encounterId}_${encounter.round || encounter.currentRound || 1}`,
    });
  }
  if (!resolution.modifiers?.npcDecision) resolution = attachNpcDecision(resolution, decision);

  const changedCombatants = [actor];
  if (target && target.combatantId !== actor.combatantId) changedCombatants.push(target);

  applyEndStateFromCombatants({
    encounter,
    actor,
    target,
    actionType: resolution.actionType,
    resolution,
    enemy,
  });
  advanceTurnAfterNpcAction(encounter);

  const autoCheckpoint = await safeCombatCheckpoint({
    gameId,
    title: `Auto checkpoint - antes de turno NPC ${encounter.encounterId}`,
    reason: "Checkpoint automatico antes de resolver turno NPC de combate avanzado.",
    triggerKey: `combat_advanced_npc:${encounter.encounterId}:r${encounter.round || encounter.currentRound || 1}:v${encounter.encounterVersion || 1}`,
    metadata: {
      source: "resolveNextNpcTurn",
      encounterId,
      actorId,
      actionType: resolution.actionType,
      npcDecision: decision,
    },
  });

  encounter.flags = {
    ...(encounter.flags || {}),
    latestNpcDecision: decision,
  };

  return persistResolution({
    gameState,
    encounter,
    preview: null,
    changedCombatants,
    resolution,
    autoCheckpoint,
  });
}

async function previewEndEncounter({
  gameId = "isekai_lucas_main",
  encounterId,
  endStatus = "cancelled",
  reason = "",
} = {}) {
  const encounter = await getEncounterOrThrow(encounterId);
  const blockingReasons = [];

  if (encounter.gameId !== gameId) blockingReasons.push("El encounterId no pertenece al gameId indicado.");
  if (encounter.status !== "active") blockingReasons.push(`El encuentro no esta activo: ${encounter.status}.`);
  if (!MANUAL_END_STATUSES.includes(endStatus)) {
    blockingReasons.push(`endStatus invalido para cierre manual C4: ${endStatus}.`);
  }

  return {
    dryRun: true,
    canEnd: blockingReasons.length === 0,
    blockedReason: blockingReasons.join(" "),
    blockingReasons,
    allowedEndStatuses: MANUAL_END_STATUSES,
    encounter: summarizeEncounter(encounter),
    requestedEndStatus: endStatus,
    reason,
    mutation: {
      willMutateEncounter: blockingReasons.length === 0,
      willMutateGameState: false,
      willCreateCheckpoint: blockingReasons.length === 0,
      willGrantLoot: false,
    },
  };
}

async function endEncounterAdvanced({
  gameId = "isekai_lucas_main",
  encounterId,
  endStatus = "cancelled",
  reason = "",
} = {}) {
  if (!MANUAL_END_STATUSES.includes(endStatus)) {
    throw makeError(`endStatus invalido para cierre manual C4: ${endStatus}`, 400, {
      allowedEndStatuses: MANUAL_END_STATUSES,
    });
  }

  const [gameState, encounter] = await Promise.all([
    getGameStateDocOrThrow(gameId),
    getEncounterOrThrow(encounterId, { lean: false }),
  ]);

  if (encounter.gameId !== gameId) throw makeError("El encounterId no pertenece al gameId indicado.", 400);
  if (encounter.status !== "active") {
    throw makeError(`El encuentro no esta activo. Estado actual: ${encounter.status}.`, 400);
  }

  const beforeCheckpoint = await safeCombatCheckpoint({
    gameId,
    title: `Auto checkpoint - antes de cerrar combate ${encounter.encounterId}`,
    reason: `Checkpoint automatico antes de cerrar combate avanzado con estado ${endStatus}.`,
    triggerKey: `combat_advanced_end:${encounter.encounterId}:${endStatus}`,
    metadata: {
      source: "endEncounterAdvanced",
      encounterId,
      endStatus,
      reason,
    },
  });

  encounter.status = endStatus;
  encounter.phase = "ending";
  encounter.endedDay = gameState.currentDay;
  encounter.endedTime = gameState.time;
  encounter.encounterVersion = (encounter.encounterVersion || 1) + 1;
  encounter.currentActorId = "";
  encounter.flags = {
    ...(encounter.flags || {}),
    c4ManualEnd: true,
    manualEndReason: reason,
  };

  const fatigueEnergyChange = await finalizeEncounterFatigueIfNeeded({ gameState, encounter });

  await encounter.save();
  await gameState.save();

  await Promise.all([
    CombatantState.updateMany(
      { gameId, encounterId },
      {
        $set: {
          canAct: false,
        },
      }
    ),
    CombatActionPreview.updateMany(
      { gameId, encounterId, status: "pending" },
      {
        $set: {
          status: "invalidated",
          invalidationReason: "Encuentro cerrado.",
        },
      }
    ),
    EventLog.create({
      logId: createId("log"),
      gameId,
      day: gameState.currentDay,
      timeStart: gameState.time,
      timeEnd: gameState.time,
      locationId: gameState.locationId,
      type: "combat_advanced_end",
      summary: reason || `Combate avanzado cerrado con estado ${endStatus}.`,
      involvedCharacterIds: ["char_lucas"],
      mechanicalChanges: {
        encounterId,
        endStatus,
      },
      visibility: "private",
      source: "system",
      tags: ["combat", "combat_advanced"],
    }),
  ]);

  return {
    encounter: summarizeEncounter(encounter.toObject(), {
      autoCheckpoint: beforeCheckpoint,
      fatigueEnergyChange,
    }),
  };
}

async function loadPostCombatState({ gameId, encounterId }) {
  const [gameState, encounter] = await Promise.all([
    getGameStateDocOrThrow(gameId),
    getEncounterOrThrow(encounterId, { lean: false }),
  ]);
  if (encounter.gameId !== gameId) throw makeError("El encounterId no pertenece al gameId indicado.", 400);

  const enemy = await EnemyTemplate.findOne({ enemyId: encounter.enemyId }).lean();
  return { gameState, encounter, enemy };
}

async function previewCombatLoot({ gameId = "isekai_lucas_main", encounterId } = {}) {
  const { gameState, encounter, enemy } = await loadPostCombatState({ gameId, encounterId });
  return summarizePostCombatConsequences({
    encounter: encounter.toObject ? encounter.toObject() : encounter,
    enemy,
    gameState,
  });
}

async function updateWorldEventFromCombatEvidence({ encounter, evidenceIds, gameTime }) {
  if (!encounter.sourceEventId) return null;
  const event = await WorldEvent.findOne({ gameId: encounter.gameId, eventId: encounter.sourceEventId });
  if (!event) return null;

  const progress = event.progress || {};
  event.progress = {
    ...progress,
    stage: "combat_evidence_collected",
    statusLabel: "Evidencia de combate recogida",
    summary: `Lucas obtuvo evidencia fisica vinculada al combate ${encounter.encounterId}.`,
    confidence: encounter.status === "won" ? "strong" : "partial",
    nextAction: "Reportar o verificar la evidencia con una fuente competente.",
    clueIds: progress.clueIds || [],
    evidenceIds: unique([...(progress.evidenceIds || []), ...evidenceIds]).slice(0, 20),
    reportIds: progress.reportIds || [],
    lastUpdatedDay: gameTime.day,
    lastUpdatedTime: gameTime.time,
    updatedByCharacterId: "char_lucas",
  };
  event.markModified("progress");
  await event.save();

  return {
    eventId: event.eventId,
    stage: event.progress.stage,
    confidence: event.progress.confidence,
    evidenceIds: event.progress.evidenceIds,
  };
}

async function updateMissionAndFactionFromCombatEvidence({ encounter, evidenceIds }) {
  if (!encounter.sourceMissionId) return { mission: null, faction: null };

  const mission = await Mission.findOne({ missionId: encounter.sourceMissionId });
  if (!mission) return { mission: null, faction: null };

  const beforeProofStatus = mission.proofStatus;
  mission.flags = {
    ...(mission.flags || {}),
    combatEvidenceIds: unique([...(mission.flags?.combatEvidenceIds || []), ...evidenceIds]).slice(0, 20),
    combatEncounterIds: unique([...(mission.flags?.combatEncounterIds || []), encounter.encounterId]).slice(0, 20),
  };
  mission.markModified("flags");
  if (mission.proofStatus === "pending") mission.proofStatus = "submitted";
  await mission.save();

  let factionChange = null;
  if (mission.sourceFactionId) {
    const faction = await Faction.findOne({ factionId: mission.sourceFactionId });
    if (faction) {
      const relationship = faction.relationshipWithLucas || {};
      const beforeCredit = numberOr(relationship.institutionalCredit, 0);
      const beforeMerit = numberOr(relationship.merit, 0);
      faction.relationshipWithLucas = {
        ...relationship,
        institutionalCredit: beforeCredit + 1,
        merit: beforeMerit + 1,
      };
      faction.flags = {
        ...(faction.flags || {}),
        combatEvidenceIds: unique([...(faction.flags?.combatEvidenceIds || []), ...evidenceIds]).slice(0, 20),
      };
      faction.markModified("relationshipWithLucas");
      faction.markModified("flags");
      await faction.save();
      factionChange = {
        factionId: faction.factionId,
        institutionalCredit: {
          before: beforeCredit,
          after: beforeCredit + 1,
          delta: 1,
        },
        merit: {
          before: beforeMerit,
          after: beforeMerit + 1,
          delta: 1,
        },
      };
    }
  }

  return {
    mission: {
      missionId: mission.missionId,
      proofStatus: {
        before: beforeProofStatus,
        after: mission.proofStatus,
      },
      combatEvidenceIds: mission.flags.combatEvidenceIds || [],
    },
    faction: factionChange,
  };
}

async function claimCombatLoot({ gameId = "isekai_lucas_main", encounterId } = {}) {
  const { gameState, encounter, enemy } = await loadPostCombatState({ gameId, encounterId });
  const preview = summarizePostCombatConsequences({
    encounter: encounter.toObject ? encounter.toObject() : encounter,
    enemy,
    gameState,
  });
  if (!preview.canClaim) {
    throw makeError("No se pueden reclamar consecuencias post-combate.", 400, {
      blockingReasons: preview.blockingReasons,
    });
  }

  const gameTime = preview.gameTime;
  const checkpoint = await safeCombatCheckpoint({
    gameId,
    title: `Auto checkpoint - antes de reclamar consecuencias ${encounter.encounterId}`,
    reason: "Checkpoint automatico antes de crear evidencia/loot post-combate.",
    triggerKey: `combat_advanced_claim:${encounter.encounterId}`,
    metadata: {
      source: "claimCombatLoot",
      encounterId,
      sourceEventId: encounter.sourceEventId || "",
      sourceMissionId: encounter.sourceMissionId || "",
    },
  });

  const evidenceDocs = preview.candidateEvidence.map((candidate) => ({
    evidenceId: createId("evidence_combat"),
    gameId,
    characterId: "char_lucas",
    name: candidate.name,
    summary: candidate.summary,
    type: normalizeEvidenceType(candidate.type),
    status: "collected",
    holderType: "character",
    holderId: "char_lucas",
    containerItemId: "",
    locationId: encounter.locationId,
    sourceEventId: encounter.sourceEventId || "",
    sourceMissionId: encounter.sourceMissionId || "",
    relatedEventIds: encounter.sourceEventId ? [encounter.sourceEventId] : [],
    relatedMissionIds: encounter.sourceMissionId ? [encounter.sourceMissionId] : [],
    condition: candidate.condition || "usable",
    integrity: 100,
    collectedDay: gameTime.day,
    collectedTime: gameTime.time,
    observations: [
      {
        day: gameTime.day,
        time: gameTime.time,
        locationId: encounter.locationId,
        summary: candidate.summary,
        byCharacterId: "char_lucas",
        certainty: candidate.certainty || "medium",
        tags: candidate.tags || [],
      },
    ],
    tags: unique([...(candidate.tags || []), "combat_claimed", `proof_${candidate.proofStatus || "unverified"}`]).slice(0, 20),
  }));

  const createdEvidence = evidenceDocs.length > 0 ? await Evidence.insertMany(evidenceDocs, { ordered: true }) : [];
  const evidenceIds = createdEvidence.map((entry) => entry.evidenceId);
  const eventChange = await updateWorldEventFromCombatEvidence({ encounter, evidenceIds, gameTime });
  const missionFactionChange = await updateMissionAndFactionFromCombatEvidence({ encounter, evidenceIds });

  encounter.lootState = {
    ...(encounter.lootState || {}),
    status: "claimed",
    reason: "Consecuencias post-combate reclamadas de forma controlada.",
    candidateItems: preview.candidateItems,
    candidateEvidence: preview.candidateEvidence,
    requiresSearchAction: false,
    searched: true,
    claimedByCharacterId: "char_lucas",
    claimedDay: gameTime.day,
    claimedTime: gameTime.time,
  };
  encounter.evidenceState = {
    ...(encounter.evidenceState || {}),
    evidenceIds: unique([...(encounter.evidenceState?.evidenceIds || []), ...evidenceIds]),
    candidateEvidence: preview.candidateEvidence,
    proofStatus: normalizeProofStatus(preview.proofStatus, "partial"),
  };
  encounter.encounterVersion = numberOr(encounter.encounterVersion, 1) + 1;
  encounter.flags = {
    ...(encounter.flags || {}),
    c5PostCombatConsequences: true,
  };
  encounter.markModified("lootState");
  encounter.markModified("evidenceState");
  encounter.markModified("flags");
  await encounter.save();

  const combatLog = await CombatLogEntry.create({
    logId: createId("combat_log"),
    encounterId,
    gameId,
    round: encounter.round || encounter.currentRound || 1,
    phase: "post_combat",
    actorId: "combatant_lucas",
    actorName: "Lucas",
    actionType: "claim_post_combat_consequences",
    targetIds: [],
    rolls: {},
    modifiers: {},
    result: {
      proofStatus: encounter.evidenceState.proofStatus,
      inventoryItemsCreated: false,
    },
    damage: {},
    lootChanges: [
      {
        status: encounter.lootState.status,
        candidateItems: preview.candidateItems,
      },
    ],
    evidenceChanges: evidenceIds.map((evidenceId) => ({ evidenceId, status: "collected" })),
    missionChanges: missionFactionChange.mission ? [missionFactionChange.mission] : [],
    eventChanges: eventChange ? [eventChange] : [],
    narrativeSummary: "Lucas reclama consecuencias post-combate sin generar recompensa automatica.",
    visibility: "private",
    createdDay: gameTime.day,
    createdTime: gameTime.time,
    elapsedSeconds: encounter.elapsedSeconds || 0,
  });

  await EventLog.create({
    logId: createId("log"),
    gameId,
    day: gameTime.day,
    timeStart: gameTime.time,
    timeEnd: gameTime.time,
    locationId: encounter.locationId,
    type: "combat_advanced_post_combat_claim",
    summary: "Lucas recogio evidencia post-combate de forma controlada.",
    involvedCharacterIds: ["char_lucas"],
    mechanicalChanges: {
      encounterId,
      evidenceIds,
      sourceEventId: encounter.sourceEventId || "",
      sourceMissionId: encounter.sourceMissionId || "",
      inventoryItemsCreated: false,
    },
    visibility: "private",
    source: "system",
    tags: ["combat", "combat_advanced", "post_combat", "evidence"],
  });

  return {
    encounter: summarizeEncounter(encounter.toObject(), { autoCheckpoint: checkpoint }),
    evidence: createdEvidence.map((entry) => entry.toObject()),
    loot: {
      candidateItems: preview.candidateItems,
      inventoryItemsCreated: false,
      policy: preview.policy,
    },
    worldEvent: eventChange,
    mission: missionFactionChange.mission,
    faction: missionFactionChange.faction,
    logEntry: combatLog.toObject(),
  };
}

const TREATMENT_QUALITIES = ["poor", "basic", "good", "excellent"];
const TREATMENT_TYPES = ["field_dressing", "clean_and_bind", "rest_care", "ointment", "pain_relief"];
const RECOVERY_REST_QUALITIES = ["poor", "basic", "good", "excellent"];
const RECOVERY_CARE_LEVELS = ["none", "self", "trained", "healer"];
const RECOVERY_ACTIVITY_LEVELS = ["rest", "light", "normal", "hard"];
const RISK_LEVELS = ["none", "low", "medium", "high", "critical"];

function normalizeTreatmentQuality(value = "basic") {
  return TREATMENT_QUALITIES.includes(value) ? value : "basic";
}

function normalizeTreatmentType(value = "field_dressing") {
  return TREATMENT_TYPES.includes(value) ? value : "field_dressing";
}

function normalizeRecoveryOption(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeRecoveryHours(hours = 8) {
  return clamp(numberOr(hours, 8), 1, 24);
}

function roundTenths(value) {
  return Math.round(numberOr(value, 0) * 10) / 10;
}

function lowerUntreatedRisk(risk = "none", steps = 1) {
  const index = RISK_LEVELS.indexOf(risk);
  if (index <= 0) return "none";
  return RISK_LEVELS[Math.max(0, index - Math.max(0, steps))];
}

function getRecoveryTotalHours(injury) {
  const expectedDays = numberOr(injury.expectedRecoveryDays, 0);
  if (expectedDays > 0) return Math.max(1, expectedDays * 24);

  const bySeverity = {
    scratch: 6,
    minor: 18,
    moderate: 72,
    serious: 168,
    critical: 336,
    maimed: 9999,
  };

  return bySeverity[injury.severity] || 24;
}

function buildTreatmentPlan(injury, { treatmentType = "field_dressing", quality = "basic" } = {}) {
  const normalizedType = normalizeTreatmentType(treatmentType);
  const normalizedQuality = normalizeTreatmentQuality(quality);
  const qualityPower = {
    poor: 0,
    basic: 1,
    good: 2,
    excellent: 3,
  }[normalizedQuality];
  const isOintment = normalizedType === "ointment" || normalizedType === "pain_relief";
  const bleedingBefore = numberOr(injury.bleeding, 0);
  const painBefore = numberOr(injury.pain, 0);
  const blockingReasons = [];

  if (["healed", "permanent"].includes(injury.status)) {
    blockingReasons.push(`La herida no admite tratamiento en estado ${injury.status}.`);
  }
  if (normalizedType === "rest_care" && bleedingBefore > 0) {
    blockingReasons.push("rest_care no reemplaza tratamiento: primero hay que estabilizar el sangrado.");
  }

  const canTreat = blockingReasons.length === 0;
  let bleedingReduction = 0;
  let painReduction = 0;

  if (canTreat) {
    if (isOintment) {
      painReduction = Math.max(1, qualityPower);
    } else if (normalizedType === "clean_and_bind") {
      bleedingReduction = Math.max(0, qualityPower);
      painReduction = qualityPower >= 1 ? 1 : 0;
    } else if (normalizedType === "rest_care") {
      painReduction = Math.max(1, qualityPower);
    } else {
      bleedingReduction = Math.max(0, qualityPower);
      painReduction = qualityPower >= 2 ? 1 : 0;
    }
  }

  const bleedingAfter = isOintment ? bleedingBefore : Math.max(0, bleedingBefore - bleedingReduction);
  const painAfter = Math.max(0, painBefore - painReduction);
  const statusAfter = !canTreat ? injury.status : bleedingAfter > 0 ? "treated" : "healing";
  const untreatedRiskAfter = !canTreat
    ? injury.untreatedRisk || "none"
    : bleedingAfter > 0
      ? lowerUntreatedRisk(injury.untreatedRisk || "low", qualityPower >= 2 ? 1 : 0)
      : lowerUntreatedRisk(injury.untreatedRisk || "low", normalizedType === "clean_and_bind" && qualityPower >= 2 ? 2 : 1);

  return {
    treatmentType: normalizedType,
    quality: normalizedQuality,
    canTreat,
    blockingReasons,
    bleeding: {
      before: bleedingBefore,
      after: bleedingAfter,
      delta: bleedingAfter - bleedingBefore,
    },
    pain: {
      before: painBefore,
      after: painAfter,
      delta: painAfter - painBefore,
    },
    status: {
      before: injury.status,
      after: statusAfter,
    },
    requiresTreatment: {
      before: Boolean(injury.requiresTreatment),
      after: bleedingAfter > 0,
    },
    untreatedRisk: {
      before: injury.untreatedRisk || "none",
      after: untreatedRiskAfter,
    },
    policy: "Tratamiento C5 estabiliza o mejora; no cura instantaneamente ni restaura vida.",
  };
}

async function previewInjuryTreatment({
  gameId = "isekai_lucas_main",
  injuryId,
  treatmentType = "field_dressing",
  quality = "basic",
} = {}) {
  if (!injuryId) throw makeError("injuryId es obligatorio.", 400);
  const injury = await InjuryRecord.findOne({ gameId, injuryId }).lean();
  if (!injury) throw makeError(`No existe InjuryRecord: ${injuryId}`, 404);
  const plan = buildTreatmentPlan(injury, { treatmentType, quality });
  const blockingReasons = plan.blockingReasons || [];

  return {
    dryRun: true,
    canTreat: blockingReasons.length === 0,
    blockedReason: blockingReasons.join(" "),
    blockingReasons,
    injury,
    treatment: plan,
    mutation: {
      willMutateInjury: blockingReasons.length === 0,
      willRestoreLife: false,
      willCreateCheckpoint: blockingReasons.length === 0,
    },
  };
}

function syncLegacyLucasInjuryTreatment(gameState, injuryId, plan) {
  const injuries = gameState.lucasStatus?.injuries || [];
  const legacy = injuries.find((entry) => entry.injuryId === injuryId);
  if (!legacy) return null;
  legacy.status = plan.status.after;
  legacy.treated = true;
  legacy.effects = unique([
    ...(legacy.effects || []),
    `tratada:${plan.quality}`,
    plan.bleeding.after === 0 ? "sangrado_estabilizado" : "",
  ]);
  return legacy;
}

function buildRecoveryPlan(
  injury,
  {
    hours = 8,
    restQuality = "basic",
    careLevel = "self",
    activityLevel = "rest",
    currentDay = null,
    currentTime = "",
  } = {}
) {
  const normalizedHours = normalizeRecoveryHours(hours);
  const normalizedRestQuality = normalizeRecoveryOption(restQuality, RECOVERY_REST_QUALITIES, "basic");
  const normalizedCareLevel = normalizeRecoveryOption(careLevel, RECOVERY_CARE_LEVELS, "self");
  const normalizedActivityLevel = normalizeRecoveryOption(activityLevel, RECOVERY_ACTIVITY_LEVELS, "rest");
  const totalHours = getRecoveryTotalHours(injury);
  const storedProgress = clamp(numberOr(injury.healingProgress, 0), 0, totalHours);
  const storedRemaining =
    injury.recoveryHoursRemaining === null || injury.recoveryHoursRemaining === undefined
      ? null
      : clamp(numberOr(injury.recoveryHoursRemaining, totalHours), 0, totalHours);
  const progressBefore = storedRemaining === null ? storedProgress : Math.max(storedProgress, totalHours - storedRemaining);
  const remainingBefore = Math.max(0, totalHours - progressBefore);
  const bleedingBefore = numberOr(injury.bleeding, 0);
  const painBefore = numberOr(injury.pain, 0);
  const statusBefore = injury.status || "active";
  const blockingReasons = [];

  if (["healed", "permanent"].includes(statusBefore) || injury.severity === "maimed") {
    blockingReasons.push(`La herida no admite recuperacion en estado ${statusBefore}.`);
  }
  if (bleedingBefore > 0 || injury.requiresTreatment) {
    blockingReasons.push("La recuperacion C13 requiere sangrado estabilizado y tratamiento pendiente resuelto.");
  }
  if (normalizedActivityLevel === "hard") {
    blockingReasons.push("Actividad dura no cuenta como recuperacion de herida.");
  }
  if (
    currentDay !== null &&
    injury.lastRecoveryDay === currentDay &&
    injury.lastRecoveryTime &&
    injury.lastRecoveryTime === currentTime
  ) {
    blockingReasons.push("Ya se aplico recuperacion de esta herida en el timestamp actual del GameState.");
  }

  const canRecover = blockingReasons.length === 0;
  const qualityMultiplier = {
    poor: 0.5,
    basic: 1,
    good: 1.25,
    excellent: 1.5,
  }[normalizedRestQuality];
  const careMultiplier = {
    none: injury.treated ? 0.75 : 0.35,
    self: 1,
    trained: 1.25,
    healer: 1.6,
  }[normalizedCareLevel];
  const activityMultiplier = {
    rest: 1,
    light: 0.5,
    normal: 0.2,
    hard: 0,
  }[normalizedActivityLevel];
  const effectiveHours = canRecover
    ? roundTenths(clamp(normalizedHours * qualityMultiplier * careMultiplier * activityMultiplier, 0, normalizedHours * 2))
    : 0;
  const progressAfter = roundTenths(clamp(progressBefore + effectiveHours, 0, totalHours));
  const remainingAfter = roundTenths(Math.max(0, totalHours - progressAfter));
  const painReduction = canRecover
    ? clamp(Math.floor(effectiveHours / 12) + (normalizedCareLevel === "healer" && effectiveHours >= 4 ? 1 : 0), 0, painBefore)
    : 0;
  const painAfter = Math.max(0, painBefore - painReduction);
  const healed = canRecover && remainingAfter <= 0 && bleedingBefore === 0;
  const statusAfter = healed ? "healed" : progressAfter > progressBefore ? "healing" : statusBefore;
  const untreatedRiskAfter = healed
    ? "none"
    : effectiveHours >= 8
      ? lowerUntreatedRisk(injury.untreatedRisk || "none", normalizedCareLevel === "healer" ? 2 : 1)
      : injury.untreatedRisk || "none";

  return {
    hours: normalizedHours,
    restQuality: normalizedRestQuality,
    careLevel: normalizedCareLevel,
    activityLevel: normalizedActivityLevel,
    canRecover,
    blockingReasons,
    recovery: {
      totalHours,
      effectiveHours,
      progressBefore,
      progressAfter,
      delta: roundTenths(progressAfter - progressBefore),
    },
    recoveryHoursRemaining: {
      before: roundTenths(remainingBefore),
      after: remainingAfter,
      delta: roundTenths(remainingAfter - remainingBefore),
    },
    bleeding: {
      before: bleedingBefore,
      after: bleedingBefore,
      delta: 0,
    },
    pain: {
      before: painBefore,
      after: painAfter,
      delta: painAfter - painBefore,
    },
    status: {
      before: statusBefore,
      after: statusAfter,
    },
    requiresTreatment: {
      before: Boolean(injury.requiresTreatment),
      after: healed ? false : Boolean(injury.requiresTreatment),
    },
    untreatedRisk: {
      before: injury.untreatedRisk || "none",
      after: untreatedRiskAfter,
    },
    policy:
      "Recuperacion C13 acumula horas efectivas de descanso/cuidado; no avanza reloj, no restaura vida y no sustituye tratamiento de sangrado.",
  };
}

async function previewInjuryRecovery({
  gameId = "isekai_lucas_main",
  injuryId,
  hours = 8,
  restQuality = "basic",
  careLevel = "self",
  activityLevel = "rest",
} = {}) {
  if (!injuryId) throw makeError("injuryId es obligatorio.", 400);
  const [gameState, injury] = await Promise.all([
    getGameStateOrThrow(gameId),
    InjuryRecord.findOne({ gameId, injuryId }).lean(),
  ]);
  if (!injury) throw makeError(`No existe InjuryRecord: ${injuryId}`, 404);

  const plan = buildRecoveryPlan(injury, {
    hours,
    restQuality,
    careLevel,
    activityLevel,
    currentDay: gameState.currentDay,
    currentTime: gameState.time,
  });

  return {
    dryRun: true,
    canRecover: plan.canRecover,
    blockedReason: plan.blockingReasons.join(" "),
    blockingReasons: plan.blockingReasons,
    injury,
    recovery: plan,
    mutation: {
      willMutateInjury: plan.canRecover,
      willRestoreLife: false,
      willAdvanceClock: false,
      willCreateCheckpoint: plan.canRecover,
    },
  };
}

function syncLegacyLucasInjuryRecovery(gameState, injuryId, plan, injury) {
  const injuries = gameState.lucasStatus?.injuries || [];
  const legacy = injuries.find((entry) => entry.injuryId === injuryId);
  if (!legacy) return null;

  legacy.status = plan.status.after;
  legacy.treated = Boolean(injury.treated || legacy.treated || plan.status.after !== "active");
  legacy.healingProgress = plan.recovery.progressAfter;
  legacy.recoveryHoursRemaining = plan.recoveryHoursRemaining.after;
  legacy.effects = unique([
    ...(legacy.effects || []),
    plan.status.after === "healed" ? "curada" : "recuperando",
    plan.recovery.delta > 0 ? `recuperacion:${plan.recovery.delta}h` : "",
  ]);
  return legacy;
}

async function applyInjuryTreatment({
  gameId = "isekai_lucas_main",
  injuryId,
  treatmentType = "field_dressing",
  quality = "basic",
} = {}) {
  if (!injuryId) throw makeError("injuryId es obligatorio.", 400);
  const [gameState, injury] = await Promise.all([
    getGameStateDocOrThrow(gameId),
    InjuryRecord.findOne({ gameId, injuryId }),
  ]);
  if (!injury) throw makeError(`No existe InjuryRecord: ${injuryId}`, 404);

  const plan = buildTreatmentPlan(injury, { treatmentType, quality });
  if (!plan.canTreat) {
    throw makeError(`La herida no admite tratamiento en estado ${injury.status}.`, 400, {
      injuryId,
      status: injury.status,
    });
  }

  const checkpoint = await safeCombatCheckpoint({
    gameId,
    title: `Auto checkpoint - antes de tratar herida ${injuryId}`,
    reason: "Checkpoint automatico antes de aplicar tratamiento de herida.",
    triggerKey: `combat_advanced_treatment:${injuryId}:${plan.quality}`,
    metadata: {
      source: "applyInjuryTreatment",
      injuryId,
      treatmentType,
      quality: plan.quality,
    },
  });

  injury.bleeding = plan.bleeding.after;
  injury.pain = plan.pain.after;
  injury.requiresTreatment = plan.requiresTreatment.after;
  injury.untreatedRisk = plan.untreatedRisk.after;
  injury.treated = true;
  injury.treatmentQuality = plan.quality;
  injury.status = plan.status.after;
  injury.flags = {
    ...(injury.flags || {}),
    treatments: [
      ...(injury.flags?.treatments || []),
      {
        day: gameState.currentDay,
        time: gameState.time,
        treatmentType,
        quality: plan.quality,
      },
    ],
  };
  injury.markModified("flags");

  const legacyInjury = syncLegacyLucasInjuryTreatment(gameState, injuryId, plan);
  await injury.save();
  if (legacyInjury) gameState.markModified("lucasStatus.injuries");
  await gameState.save();

  await EventLog.create({
    logId: createId("log"),
    gameId,
    day: gameState.currentDay,
    timeStart: gameState.time,
    timeEnd: gameState.time,
    locationId: gameState.locationId,
    type: "combat_advanced_injury_treatment",
    summary: `Tratamiento ${plan.quality} aplicado a herida ${injuryId}.`,
    involvedCharacterIds: injury.targetType === "character" ? [injury.targetId] : ["char_lucas"],
    mechanicalChanges: {
      injuryId,
      treatment: plan,
      restoredLife: false,
    },
    visibility: "private",
    source: "system",
    tags: ["combat", "combat_advanced", "injury", "treatment"],
  });

  return {
    injury: injury.toObject(),
    treatment: plan,
    legacyInjury,
    autoCheckpoint: checkpoint,
  };
}

async function applyInjuryRecovery({
  gameId = "isekai_lucas_main",
  injuryId,
  hours = 8,
  restQuality = "basic",
  careLevel = "self",
  activityLevel = "rest",
} = {}) {
  if (!injuryId) throw makeError("injuryId es obligatorio.", 400);
  const [gameState, injury] = await Promise.all([
    getGameStateDocOrThrow(gameId),
    InjuryRecord.findOne({ gameId, injuryId }),
  ]);
  if (!injury) throw makeError(`No existe InjuryRecord: ${injuryId}`, 404);

  const plan = buildRecoveryPlan(injury, {
    hours,
    restQuality,
    careLevel,
    activityLevel,
    currentDay: gameState.currentDay,
    currentTime: gameState.time,
  });
  if (!plan.canRecover) {
    throw makeError(plan.blockingReasons.join(" ") || "La herida no admite recuperacion ahora.", 400, {
      injuryId,
      status: injury.status,
      blockingReasons: plan.blockingReasons,
    });
  }

  const checkpoint = await safeCombatCheckpoint({
    gameId,
    title: `Auto checkpoint - antes de recuperacion de herida ${injuryId}`,
    reason: "Checkpoint automatico antes de aplicar recuperacion de herida.",
    triggerKey: `combat_advanced_recovery:${injuryId}:${gameState.currentDay}:${gameState.time}`,
    metadata: {
      source: "applyInjuryRecovery",
      injuryId,
      hours: plan.hours,
      restQuality: plan.restQuality,
      careLevel: plan.careLevel,
      activityLevel: plan.activityLevel,
    },
  });

  injury.healingProgress = plan.recovery.progressAfter;
  injury.recoveryHoursRemaining = plan.recoveryHoursRemaining.after;
  injury.pain = plan.pain.after;
  injury.requiresTreatment = plan.requiresTreatment.after;
  injury.untreatedRisk = plan.untreatedRisk.after;
  injury.status = plan.status.after;
  injury.lastRecoveryDay = gameState.currentDay;
  injury.lastRecoveryTime = gameState.time;
  injury.flags = {
    ...(injury.flags || {}),
    recoveryHistory: [
      ...(injury.flags?.recoveryHistory || []),
      {
        day: gameState.currentDay,
        time: gameState.time,
        hours: plan.hours,
        effectiveHours: plan.recovery.effectiveHours,
        restQuality: plan.restQuality,
        careLevel: plan.careLevel,
        activityLevel: plan.activityLevel,
        statusAfter: plan.status.after,
      },
    ],
  };
  injury.markModified("flags");

  const legacyInjury =
    injury.targetType === "character" && injury.targetId === "char_lucas"
      ? syncLegacyLucasInjuryRecovery(gameState, injuryId, plan, injury)
      : null;

  await injury.save();
  if (legacyInjury) gameState.markModified("lucasStatus.injuries");
  await gameState.save();

  await EventLog.create({
    logId: createId("log"),
    gameId,
    day: gameState.currentDay,
    timeStart: gameState.time,
    timeEnd: gameState.time,
    locationId: gameState.locationId,
    type: "combat_advanced_injury_recovery",
    summary: `Recuperacion ${plan.recovery.effectiveHours}h aplicada a herida ${injuryId}.`,
    involvedCharacterIds: injury.targetType === "character" ? [injury.targetId] : ["char_lucas"],
    mechanicalChanges: {
      injuryId,
      recovery: plan,
      restoredLife: false,
      advancedClock: false,
    },
    visibility: "private",
    source: "system",
    tags: ["combat", "combat_advanced", "injury", "recovery"],
  });

  return {
    injury: injury.toObject(),
    recovery: plan,
    legacyInjury,
    autoCheckpoint: checkpoint,
  };
}

module.exports = {
  ADVANCED_ACTIONS,
  previewStartEncounter,
  startEncounterAdvanced,
  listActiveAdvancedEncounters,
  getAdvancedEncounter,
  listAvailableAdvancedActions,
  previewAdvancedAction,
  applyAdvancedAction,
  resolveNextNpcTurn,
  previewEndEncounter,
  endEncounterAdvanced,
  previewCombatLoot,
  claimCombatLoot,
  previewInjuryTreatment,
  applyInjuryTreatment,
  previewInjuryRecovery,
  applyInjuryRecovery,
};
