const GameState = require("../models/GameState");
const EnemyTemplate = require("../models/EnemyTemplate");
const CombatEncounter = require("../models/CombatEncounter");
const EventLog = require("../models/EventLog");

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function createLogId() {
  return createId("log");
}

function validateInteger(value, fieldName) {
  if (!Number.isInteger(value)) {
    const error = new Error(`${fieldName} debe ser un numero entero.`);
    error.statusCode = 400;
    throw error;
  }
}

async function listEnemies({ type, dangerLevel } = {}) {
  const query = {};

  if (type) query.type = type;
  if (dangerLevel) query.dangerLevel = dangerLevel;

  return EnemyTemplate.find(query)
    .sort({ dangerLevel: 1, name: 1 })
    .lean();
}

async function getEnemy(enemyId) {
  const enemy = await EnemyTemplate.findOne({ enemyId }).lean();

  if (!enemy) {
    const error = new Error(`No existe enemigo con id: ${enemyId}`);
    error.statusCode = 404;
    throw error;
  }

  return enemy;
}

async function startEncounter({
  gameId = "isekai_lucas_main",
  enemyId,
  reason = "",
}) {
  if (!enemyId) {
    const error = new Error("enemyId es obligatorio.");
    error.statusCode = 400;
    throw error;
  }

  const gameState = await GameState.findOne({ gameId }).lean();

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const activeEncounter = await CombatEncounter.findOne({
    gameId,
    status: "active",
  }).lean();

  if (activeEncounter) {
    const error = new Error("Ya existe un combate activo. Debe resolverse antes de iniciar otro.");
    error.statusCode = 400;
    error.details = { encounterId: activeEncounter.encounterId };
    throw error;
  }

  const enemy = await EnemyTemplate.findOne({ enemyId }).lean();

  if (!enemy) {
    const error = new Error(`No existe EnemyTemplate: ${enemyId}`);
    error.statusCode = 404;
    throw error;
  }

  const encounter = await CombatEncounter.create({
    encounterId: createId("combat"),
    gameId,
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
    reason,
    flags: {
      dangerLevel: enemy.dangerLevel,
      enemyType: enemy.type,
      rewardPolicy: enemy.rewardPolicy,
    },
  });

  await EventLog.create({
    logId: createLogId(),
    gameId,
    day: gameState.currentDay,
    timeStart: gameState.time,
    timeEnd: gameState.time,
    locationId: gameState.locationId,
    type: "combat_start",
    summary: `Comienza combate contra ${enemy.name}.`,
    involvedCharacterIds: ["char_lucas"],
    mechanicalChanges: {
      encounterId: encounter.encounterId,
      enemyId: enemy.enemyId,
      enemyName: enemy.name,
    },
    visibility: "private",
    source: "system",
    tags: ["combat"],
  });

  return encounter.toObject();
}

async function listActiveEncounters({ gameId = "isekai_lucas_main" } = {}) {
  return CombatEncounter.find({
    gameId,
    status: "active",
  })
    .sort({ createdAt: -1 })
    .lean();
}

async function getEncounter(encounterId) {
  const encounter = await CombatEncounter.findOne({ encounterId }).lean();

  if (!encounter) {
    const error = new Error(`No existe encuentro con id: ${encounterId}`);
    error.statusCode = 404;
    throw error;
  }

  return encounter;
}

async function applyCombatRound({
  encounterId,
  gameId = "isekai_lucas_main",
  summary,
  enemyDamage = 0,
  moraleDamage = 0,
  lucasPatch = {},
  addInjuries = [],
  endStatus = "",
}) {
  if (!summary) {
    const error = new Error("summary es obligatorio para registrar una ronda de combate.");
    error.statusCode = 400;
    throw error;
  }

  validateInteger(enemyDamage, "enemyDamage");
  validateInteger(moraleDamage, "moraleDamage");

  if (enemyDamage < 0 || moraleDamage < 0) {
    const error = new Error("enemyDamage y moraleDamage no pueden ser negativos.");
    error.statusCode = 400;
    throw error;
  }

  const encounter = await CombatEncounter.findOne({ encounterId });

  if (!encounter) {
    const error = new Error(`No existe encuentro con id: ${encounterId}`);
    error.statusCode = 404;
    throw error;
  }

  if (encounter.status !== "active") {
    const error = new Error(`El encuentro no esta activo. Estado actual: ${encounter.status}`);
    error.statusCode = 400;
    throw error;
  }

  const gameState = await GameState.findOne({ gameId });

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const changes = {
    lucas: {},
    enemy: {},
    injuriesAdded: [],
  };

  const allowedLucasDeltas = {
    lifeDelta: "life",
    satietyDelta: "satiety",
    energyDelta: "energy",
    mpDelta: "mp",
  };

  for (const [deltaKey, statKey] of Object.entries(allowedLucasDeltas)) {
    if (lucasPatch[deltaKey] !== undefined) {
      const delta = lucasPatch[deltaKey];
      validateInteger(delta, `lucasPatch.${deltaKey}`);

      const stat = gameState.lucasStatus[statKey];
      const before = stat.current;
      const after = clamp(before + delta, 0, stat.max);

      stat.current = after;

      changes.lucas[statKey] = {
        before,
        delta,
        after,
      };
    }
  }

  if (Array.isArray(addInjuries)) {
    for (const injury of addInjuries) {
      const requiredFields = ["injuryId", "location", "severity", "description"];

      for (const field of requiredFields) {
        if (!injury[field]) {
          const error = new Error(`Falta campo obligatorio en herida: ${field}`);
          error.statusCode = 400;
          throw error;
        }
      }

      const injuryToAdd = {
        ...injury,
        createdDay: injury.createdDay || gameState.currentDay,
        createdTime: injury.createdTime || gameState.time,
      };

      gameState.lucasStatus.injuries.push(injuryToAdd);
      changes.injuriesAdded.push(injuryToAdd);
    }
  }

  if (enemyDamage > 0) {
    const before = encounter.enemyStatus.life.current;
    const after = clamp(before - enemyDamage, 0, encounter.enemyStatus.life.max);
    encounter.enemyStatus.life.current = after;

    changes.enemy.life = {
      before,
      damage: enemyDamage,
      after,
    };
  }

  if (moraleDamage > 0) {
    const before = encounter.enemyStatus.morale.current;
    const after = clamp(before - moraleDamage, 0, encounter.enemyStatus.morale.max);
    encounter.enemyStatus.morale.current = after;

    changes.enemy.morale = {
      before,
      damage: moraleDamage,
      after,
    };
  }

  const validEndStatuses = ["won", "lost", "escaped", "cancelled"];

  if (endStatus) {
    if (!validEndStatuses.includes(endStatus)) {
      const error = new Error(`endStatus invalido: ${endStatus}`);
      error.statusCode = 400;
      throw error;
    }

    encounter.status = endStatus;
    encounter.endedDay = gameState.currentDay;
    encounter.endedTime = gameState.time;
  } else if (encounter.enemyStatus.life.current <= 0 || encounter.enemyStatus.morale.current <= 0) {
    encounter.status = "won";
    encounter.endedDay = gameState.currentDay;
    encounter.endedTime = gameState.time;
  } else if (gameState.lucasStatus.life.current <= 0) {
    encounter.status = "lost";
    encounter.endedDay = gameState.currentDay;
    encounter.endedTime = gameState.time;
  }

  encounter.combatLog.push({
    round: encounter.currentRound,
    summary,
    lucasChanges: changes.lucas,
    enemyChanges: changes.enemy,
    injuriesAdded: changes.injuriesAdded,
  });

  if (encounter.status === "active") {
    encounter.currentRound += 1;
  }

  await gameState.save();
  await encounter.save();

  await EventLog.create({
    logId: createLogId(),
    gameId,
    day: gameState.currentDay,
    timeStart: gameState.time,
    timeEnd: gameState.time,
    locationId: gameState.locationId,
    type: "combat_round",
    summary,
    involvedCharacterIds: ["char_lucas"],
    mechanicalChanges: {
      encounterId: encounter.encounterId,
      encounterStatus: encounter.status,
      ...changes,
    },
    visibility: "private",
    source: "system",
    tags: ["combat"],
  });

  return {
    encounter: encounter.toObject(),
    gameState: gameState.toObject(),
    changes,
  };
}

module.exports = {
  listEnemies,
  getEnemy,
  startEncounter,
  listActiveEncounters,
  getEncounter,
  applyCombatRound,
};
