const CombatEncounter = require("../models/CombatEncounter");
const EnemyTemplate = require("../models/EnemyTemplate");
const GameState = require("../models/GameState");
const Item = require("../models/Item");
const { previewMagicPractice } = require("./magicService");

const ACTION_DEFINITIONS = [
  {
    actionType: "attack",
    label: "Atacar",
    requiresActiveCombat: true,
    cost: { energy: -4, satiety: -1, mp: 0 },
    notes: "Preview de ataque fisico; no aplica dano ni loot.",
  },
  {
    actionType: "defend",
    label: "Bloquear/defender",
    requiresActiveCombat: true,
    cost: { energy: -2, satiety: 0, mp: 0 },
    notes: "Reduce riesgo del siguiente intercambio en una aplicacion futura.",
  },
  {
    actionType: "dodge",
    label: "Esquivar",
    requiresActiveCombat: true,
    cost: { energy: -5, satiety: 0, mp: 0 },
    notes: "Mayor coste de energia; depende de agilidad y espacio.",
  },
  {
    actionType: "retreat",
    label: "Retirarse/huir",
    requiresActiveCombat: true,
    cost: { energy: -6, satiety: -1, mp: 0 },
    notes: "No cierra combate en preview; solo estima riesgo.",
  },
  {
    actionType: "intimidate",
    label: "Intimidar",
    requiresActiveCombat: true,
    cost: { energy: -3, satiety: 0, mp: 0 },
    notes: "Puede afectar moral enemiga en aplicacion futura.",
  },
  {
    actionType: "use_item",
    label: "Usar objeto",
    requiresActiveCombat: true,
    cost: { energy: -1, satiety: 0, mp: 0 },
    notes: "Valida que el item exista en inventario; no consume nada en preview.",
  },
  {
    actionType: "cast_magic_preview",
    label: "Previsualizar magia",
    requiresActiveCombat: true,
    cost: { energy: 0, satiety: 0, mp: "technique" },
    notes: "Delega en magicService; no gasta MP ni aprende hechizos.",
  },
  {
    actionType: "surrender",
    label: "Rendirse",
    requiresActiveCombat: true,
    cost: { energy: 0, satiety: 0, mp: 0 },
    notes: "No cambia estado del combate en preview.",
  },
  {
    actionType: "protect",
    label: "Proteger a alguien",
    requiresActiveCombat: true,
    cost: { energy: -4, satiety: -1, mp: 0 },
    notes: "Requiere objetivo en params.targetId para aplicacion real.",
  },
];

const ACTIONS_BY_TYPE = new Map(ACTION_DEFINITIONS.map((action) => [action.actionType, action]));

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function summarizeStatus(gameState) {
  return {
    life: gameState.lucasStatus?.life?.current ?? 0,
    satiety: gameState.lucasStatus?.satiety?.current ?? 0,
    energy: gameState.lucasStatus?.energy?.current ?? 0,
    mp: gameState.lucasStatus?.mp?.current ?? 0,
    injuries: gameState.lucasStatus?.injuries || [],
    conditions: gameState.lucasStatus?.conditions || [],
    moneyCopper: gameState.moneyCopper,
    inventoryCount: (gameState.inventory || []).length,
  };
}

function buildFixtureEncounter(enemy, gameState) {
  return {
    encounterId: `fixture_${enemy.enemyId}`,
    gameId: gameState.gameId,
    status: "active",
    locationId: gameState.locationId,
    enemyId: enemy.enemyId,
    enemyName: enemy.name,
    enemyStatus: {
      life: {
        current: enemy.baseStats.life,
        max: enemy.baseStats.life,
      },
      morale: {
        current: enemy.baseStats.morale,
        max: enemy.baseStats.morale,
      },
      conditions: [],
    },
    currentRound: 1,
    startedDay: gameState.currentDay,
    startedTime: gameState.time,
    flags: {
      fixture: true,
      dangerLevel: enemy.dangerLevel,
      enemyType: enemy.type,
      rewardPolicy: enemy.rewardPolicy,
    },
  };
}

async function findEncounterForPreview({ encounterId, gameState }) {
  if (String(encounterId || "").startsWith("fixture_")) {
    const enemyId = String(encounterId).replace(/^fixture_/, "");
    const enemy = await EnemyTemplate.findOne({ enemyId }).lean();

    if (!enemy) {
      return {
        encounter: null,
        blockedReason: `No existe fixture EnemyTemplate: ${enemyId}`,
      };
    }

    return {
      encounter: buildFixtureEncounter(enemy, gameState),
      enemy,
      fixture: true,
    };
  }

  const encounter = await CombatEncounter.findOne({ encounterId }).lean();

  if (!encounter) {
    return {
      encounter: null,
      blockedReason: `No existe encuentro activo con id: ${encounterId}`,
    };
  }

  const enemy = await EnemyTemplate.findOne({ enemyId: encounter.enemyId }).lean();

  return {
    encounter,
    enemy,
    fixture: false,
  };
}

function getEquippedWeapon(gameState, itemsById) {
  const equipped = (gameState.inventory || []).find((entry) => entry.equipped);
  if (!equipped) return null;

  const item = itemsById.get(equipped.itemId);
  if (!item || item.type !== "weapon") return null;

  return {
    inventoryEntry: equipped,
    item,
  };
}

async function getInventoryItems(gameState) {
  const itemIds = Array.from(new Set((gameState.inventory || []).map((entry) => entry.itemId)));
  const items = await Item.find({ itemId: { $in: itemIds } }).lean();
  return new Map(items.map((item) => [item.itemId, item]));
}

function getSkillLevel(gameState, skillId) {
  return (gameState.skills || []).find((skill) => skill.skillId === skillId)?.level || 0;
}

function buildBaseValidation({ gameState, encounter, action, itemsById, params }) {
  const blockingReasons = [];
  const warnings = [];
  const status = summarizeStatus(gameState);

  if (!encounter) {
    blockingReasons.push("No hay combate activo valido para previsualizar esta accion.");
  } else if (encounter.status !== "active") {
    blockingReasons.push(`El encuentro no esta activo. Estado actual: ${encounter.status}.`);
  }

  if (status.life <= 0) {
    blockingReasons.push("Lucas no puede actuar con vida en 0.");
  }

  if (status.energy <= 0 && !["surrender"].includes(action.actionType)) {
    blockingReasons.push("Lucas no puede actuar sin energia.");
  }

  if (status.satiety <= 0) {
    warnings.push("Saciedad en 0: cualquier accion real deberia aplicar riesgo severo.");
  } else if (status.satiety <= 30) {
    warnings.push("Saciedad baja: accion fisica puede empeorar hambre/cansancio.");
  }

  if ((status.injuries || []).length > 0) {
    warnings.push("Lucas tiene heridas; el preview no calcula penalizadores por zona todavia.");
  }

  if (action.actionType === "use_item") {
    const itemId = params.itemId || "";
    const inventoryEntry = (gameState.inventory || []).find((entry) => entry.itemId === itemId);

    if (!itemId) {
      blockingReasons.push("use_item requiere params.itemId.");
    } else if (!inventoryEntry) {
      blockingReasons.push(`Lucas no tiene ${itemId} en inventario.`);
    } else if (!itemsById.has(itemId)) {
      blockingReasons.push(`El item ${itemId} no existe en catalogo.`);
    }
  }

  if (action.actionType === "protect" && !params.targetId) {
    warnings.push("protect no indica targetId; una aplicacion real deberia exigir objetivo.");
  }

  return {
    blockingReasons,
    warnings,
    status,
  };
}

function estimateOutcomes({ action, gameState, encounter, enemy, itemsById, params }) {
  const strengthLevel = getSkillLevel(gameState, "skill_fuerza");
  const agilityLevel = getSkillLevel(gameState, "skill_agilidad");
  const perceptionLevel = getSkillLevel(gameState, "skill_percepcion");
  const weapon = getEquippedWeapon(gameState, itemsById);
  const enemyStats = enemy?.baseStats || {};
  const enemyDefense = enemyStats.defense || 0;
  const enemyAgility = enemyStats.agility || 0;
  const currentEnemyLife = encounter?.enemyStatus?.life?.current || enemyStats.life || 1;
  const currentEnemyMorale = encounter?.enemyStatus?.morale?.current || enemyStats.morale || 1;
  const weaponBonus = weapon ? 2 : 0;

  if (action.actionType === "attack") {
    const low = clamp(Math.floor(strengthLevel / 2) + weaponBonus - Math.floor(enemyDefense / 3), 0, currentEnemyLife);
    const high = clamp(low + 3, low, currentEnemyLife);

    return [
      {
        outcome: "hit_range",
        description: "Rango estimado de dano fisico si el ataque conecta.",
        enemyLifeDamageRange: [low, high],
        dependsOn: ["arma equipada", "Fuerza", "defensa enemiga", "narrativa de posicion"],
      },
      {
        outcome: "miss_or_counter",
        description: "Puede fallar o abrir contraataque si la posicion es mala.",
        enemyAgility,
      },
    ];
  }

  if (action.actionType === "defend") {
    return [
      {
        outcome: "reduced_incoming_risk",
        description: "Reduce riesgo de dano recibido en la proxima resolucion real.",
        dependsOn: ["escudo/arma", "Resistencia", "tipo de ataque enemigo"],
      },
    ];
  }

  if (action.actionType === "dodge") {
    return [
      {
        outcome: "avoid_or_reposition",
        description: "Puede evitar ataque y reposicionar; coste de energia mayor.",
        agilityLevel,
        enemyAgility,
      },
    ];
  }

  if (action.actionType === "retreat") {
    return [
      {
        outcome: "escape_attempt",
        description: "Puede escapar, fallar o recibir ataque de oportunidad en aplicacion real.",
        risk: enemyAgility > agilityLevel ? "elevated" : "moderate",
      },
    ];
  }

  if (action.actionType === "intimidate") {
    const low = clamp(Math.floor((strengthLevel + perceptionLevel) / 5), 0, currentEnemyMorale);
    const high = clamp(low + 4, low, currentEnemyMorale);

    return [
      {
        outcome: "morale_pressure",
        description: "Rango estimado de presion sobre moral enemiga.",
        enemyMoraleDamageRange: [low, high],
      },
    ];
  }

  if (action.actionType === "use_item") {
    const item = itemsById.get(params.itemId);
    return [
      {
        outcome: "item_effect_preview",
        description: item
          ? `El objeto ${item.name} podria usarse si la escena lo permite.`
          : "Objeto no disponible.",
        itemId: params.itemId || "",
        willConsumeItem: false,
      },
    ];
  }

  if (action.actionType === "cast_magic_preview") {
    return [
      {
        outcome: "magic_preview_only",
        description: "La magia se calcula por magicService y no se aplica al combate.",
      },
    ];
  }

  if (action.actionType === "surrender") {
    return [
      {
        outcome: "surrender_consequence_pending",
        description: "La rendicion requiere resolucion narrativa; preview no cambia estado.",
      },
    ];
  }

  if (action.actionType === "protect") {
    return [
      {
        outcome: "interpose",
        description: "Puede reducir riesgo para el objetivo y aumentar riesgo para Lucas.",
        targetId: params.targetId || "",
      },
    ];
  }

  return [];
}

async function listCombatActions() {
  return ACTION_DEFINITIONS;
}

async function previewCombatAction({
  gameId = "isekai_lucas_main",
  encounterId,
  actionType,
  params = {},
} = {}) {
  const action = ACTIONS_BY_TYPE.get(actionType);

  if (!action) {
    const error = new Error(`actionType invalido: ${actionType}`);
    error.statusCode = 400;
    throw error;
  }

  const gameState = await GameState.findOne({ gameId }).lean();

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const [encounterResult, itemsById] = await Promise.all([
    findEncounterForPreview({ encounterId, gameState }),
    getInventoryItems(gameState),
  ]);

  const { encounter, enemy, fixture, blockedReason } = encounterResult;
  const validation = buildBaseValidation({
    gameState,
    encounter,
    action,
    itemsById,
    params,
  });

  if (blockedReason) {
    validation.blockingReasons.unshift(blockedReason);
  }

  let magicPreview = null;
  if (action.actionType === "cast_magic_preview" && params.techniqueId) {
    magicPreview = await previewMagicPractice({
      gameId,
      techniqueId: params.techniqueId,
      minutes: params.minutes || 10,
      guidedByNpcId: params.guidedByNpcId || "",
    });

    if (!magicPreview.canPractice) {
      validation.blockingReasons.push(magicPreview.blockedReason || "La tecnica magica no puede practicarse.");
    }
  } else if (action.actionType === "cast_magic_preview") {
    validation.blockingReasons.push("cast_magic_preview requiere params.techniqueId.");
  }

  const canAct = validation.blockingReasons.length === 0;
  const expectedCost = {
    energy: canAct ? action.cost.energy || 0 : 0,
    satiety: canAct ? action.cost.satiety || 0 : 0,
    mp: magicPreview ? -Number(magicPreview.mpCost || 0) : 0,
    willMutate: false,
  };

  return {
    dryRun: true,
    canAct,
    blockedReason: validation.blockingReasons.join(" "),
    blockingReasons: validation.blockingReasons,
    action,
    gameState: {
      day: gameState.currentDay,
      time: gameState.time,
      locationId: gameState.locationId,
      status: validation.status,
    },
    encounter: encounter
      ? {
          encounterId: encounter.encounterId,
          fixture,
          status: encounter.status,
          enemyId: encounter.enemyId,
          enemyName: encounter.enemyName,
          currentRound: encounter.currentRound,
          enemyStatus: encounter.enemyStatus,
        }
      : null,
    expectedCost,
    possibleOutcomes: canAct
      ? estimateOutcomes({ action, gameState, encounter, enemy, itemsById, params })
      : [],
    warnings: validation.warnings,
    magicPreview,
    mutation: {
      willMutateGameState: false,
      willMutateEncounter: false,
      willCloseCombat: false,
      willGrantLoot: false,
    },
    lootPolicy: "No hay loot automatico en preview ni cierre de combate.",
  };
}

module.exports = {
  ACTION_DEFINITIONS,
  listCombatActions,
  previewCombatAction,
};
