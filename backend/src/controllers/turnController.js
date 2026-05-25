const mongoose = require("mongoose");

const GameState = require("../models/GameState");
const EventLog = require("../models/EventLog");
const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const Rumor = require("../models/Rumor");
const WorldEvent = require("../models/WorldEvent");
const Location = require("../models/Location");
const ShopStock = require("../models/ShopStock");
const Item = require("../models/Item");
const { syncNpcRoutines } = require("../services/routineService");
const { calculateActivityCost } = require("../services/biologicalClockService");

const VALID_EVENT_LOG_SOURCES = new Set([
  "player_action",
  "system",
  "npc_action",
  "world_event",
  "admin",
  "system_correction",
  "mechanical_audit",
  "backend_validation",
  "admin_fix",
]);

const VALID_EVENT_LOG_VISIBILITIES = new Set(["hidden", "private", "local", "public"]);

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

function validationError(message, details = {}) {
  const error = new Error(message);
  error.statusCode = 400;
  error.details = details;
  return error;
}

function isValidTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function getBlockFromTime(time) {
  const hour = Number(time.split(":")[0]);

  if (hour >= 0 && hour < 6) return "Madrugada";
  if (hour >= 6 && hour < 12) return "Mañana";
  if (hour >= 12 && hour < 14) return "Mediodía";
  if (hour >= 14 && hour < 18) return "Tarde";
  return "Noche";
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createLogId() {
  return createId("log");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toPlain(value) {
  if (!value) return value;
  if (typeof value.toObject === "function") return value.toObject();
  return JSON.parse(JSON.stringify(value));
}

function getStatusLabel(statKey, current) {
  if (statKey === "satiety") {
    if (current >= 71) return "satisfecho";
    if (current >= 51) return "hambre leve";
    if (current >= 21) return "hambre fuerte";
    if (current >= 1) return "debilidad/mareos";
    return "inanicion/riesgo de vida";
  }

  if (statKey === "energy") {
    if (current >= 70) return "rendimiento normal";
    if (current >= 40) return "cansancio leve/energia media";
    if (current >= 20) return "cansancio serio";
    if (current >= 1) return "agotamiento peligroso";
    return "colapso";
  }

  return "";
}

function applyStatDelta(stat, delta, statKey) {
  const before = stat.current;
  const after = clamp(before + delta, 0, stat.max);
  stat.current = after;

  const label = getStatusLabel(statKey, after);
  if (label) {
    stat.label = label;
  }

  return {
    before,
    delta,
    after,
    labelAfter: stat.label || "",
  };
}

function getNextPhase(currentPhase) {
  const index = PHASE_ORDER.indexOf(currentPhase);

  if (index === -1 || index >= PHASE_ORDER.length - 1) {
    return null;
  }

  return PHASE_ORDER[index + 1];
}

function applySkillExp(skill, expDelta) {
  if (!Number.isInteger(expDelta) || expDelta < 0) {
    throw validationError("skillPatch.expDelta debe ser un entero positivo o cero.");
  }

  const before = {
    phase: skill.phase,
    level: skill.level,
    exp: skill.exp,
    expToNext: skill.expToNext,
  };

  skill.exp += expDelta;

  const levelUps = [];

  while (skill.exp >= skill.expToNext) {
    skill.exp -= skill.expToNext;

    if (skill.level < 10) {
      skill.level += 1;
    } else {
      const nextPhase = getNextPhase(skill.phase);

      if (!nextPhase) {
        skill.level = 10;
        skill.exp = 0;
        break;
      }

      skill.phase = nextPhase;
      skill.level = 1;
      skill.expToNext = EXP_TO_NEXT_BY_PHASE[nextPhase];
    }

    levelUps.push({
      phase: skill.phase,
      level: skill.level,
      expToNext: skill.expToNext,
    });
  }

  const after = {
    phase: skill.phase,
    level: skill.level,
    exp: skill.exp,
    expToNext: skill.expToNext,
  };

  return {
    before,
    expDelta,
    after,
    levelUps,
  };
}

async function applyInventoryPatch(inventory, patch, session = null) {
  const { op, itemId, quantity = 1, condition = "normal", equipped = false, notes = "" } = patch;

  if (!["add", "remove", "set_quantity"].includes(op)) {
    throw validationError(`Operación de inventario inválida: ${op}`);
  }

  if (!itemId) {
    throw validationError("inventoryPatch.itemId es obligatorio.");
  }

  if (op === "add" || op === "set_quantity") {
    const itemExists = await Item.exists({ itemId }).session(session);

    if (!itemExists) {
      throw validationError("No se puede agregar item inexistente al inventario.", {
        itemId,
      });
    }
  }

  if (!Number.isInteger(quantity) || quantity < 1) {
    throw validationError("inventoryPatch.quantity debe ser entero mayor o igual a 1.");
  }

  const index = inventory.findIndex((item) => item.itemId === itemId);
  const beforeItem = index >= 0 ? toPlain(inventory[index]) : null;

  if (op === "add") {
    if (index >= 0) {
      inventory[index].quantity += quantity;
    } else {
      inventory.push({
        itemId,
        quantity,
        condition,
        equipped,
        notes,
      });
    }
  }

  if (op === "remove") {
    if (index < 0) {
      throw validationError(`No se puede remover ${itemId}: no existe en inventario.`);
    }

    if (inventory[index].quantity < quantity) {
      throw validationError(`No se puede remover ${quantity} de ${itemId}: cantidad insuficiente.`);
    }

    inventory[index].quantity -= quantity;

    if (inventory[index].quantity === 0) {
      inventory.splice(index, 1);
    }
  }

  if (op === "set_quantity") {
    if (index < 0) {
      inventory.push({
        itemId,
        quantity,
        condition,
        equipped,
        notes,
      });
    } else {
      inventory[index].quantity = quantity;
      inventory[index].condition = condition || inventory[index].condition;
      inventory[index].equipped = equipped;
      inventory[index].notes = notes || inventory[index].notes;
    }
  }

  const afterIndex = inventory.findIndex((item) => item.itemId === itemId);
  const afterItem = afterIndex >= 0 ? toPlain(inventory[afterIndex]) : null;

  return {
    op,
    itemId,
    quantity,
    before: beforeItem,
    after: afterItem,
  };
}

async function applyNpcRelationshipPatches(patches, session = null) {
  const results = [];

  for (const patch of patches) {
    if (!patch.npcId) {
      throw validationError("npcRelationshipPatch.npcId es obligatorio.");
    }

    const npc = await Npc.findOne({ npcId: patch.npcId }).session(session);

    if (!npc) {
      throw validationError(`No existe NPC persistente con id: ${patch.npcId}`);
    }

    const relationship = npc.relationshipWithLucas;
    const before = toPlain(relationship);

    const allowedDeltas = ["trust", "affection", "suspicion", "respect", "fear", "jealousy"];

    for (const key of allowedDeltas) {
      const deltaKey = `${key}Delta`;

      if (patch[deltaKey] !== undefined) {
        if (!Number.isInteger(patch[deltaKey])) {
          throw validationError(`${deltaKey} debe ser un número entero.`);
        }

        relationship[key] = clamp((relationship[key] || 0) + patch[deltaKey], 0, 100);
      }
    }

    if (typeof patch.notes === "string" && patch.notes.trim()) {
      relationship.notes = patch.notes.trim();
    }

    await npc.save({ session });

    results.push({
      npcId: npc.npcId,
      name: npc.name,
      before,
      after: toPlain(npc.relationshipWithLucas),
      reason: patch.reason || "",
    });
  }

  return results;
}

async function applyNpcMemoryPatches(gameState, patches, session = null) {
  const results = [];

  for (const patch of patches) {
    if (!patch.npcId) {
      throw validationError("npcMemoryPatch.npcId es obligatorio.");
    }

    if (!patch.fact) {
      throw validationError("npcMemoryPatch.fact es obligatorio.");
    }

    const npcExists = await Npc.exists({ npcId: patch.npcId }).session(session);

    if (!npcExists) {
      throw validationError(`No se puede guardar memoria: no existe NPC persistente ${patch.npcId}`);
    }

    const [memory] = await NpcMemory.create([{
      memoryId: patch.memoryId || createId("memory"),
      npcId: patch.npcId,
      fact: patch.fact,
      summary: patch.summary || "",
      sourceType: patch.sourceType || "told_by_lucas",
      sourceId: patch.sourceId || "",
      certainty: patch.certainty || "confirmed",
      emotionalWeight: patch.emotionalWeight || "low",
      privacyLevel: patch.privacyLevel || "private",
      canShare: Boolean(patch.canShare),
      shareConditions: patch.shareConditions || [],
      createdDay: patch.createdDay || gameState.currentDay,
      createdTime: patch.createdTime || gameState.time,
      lastReferencedDay: patch.lastReferencedDay || gameState.currentDay,
      importance: patch.importance || "normal",
      decayType: patch.decayType || "none",
      relatedNpcIds: patch.relatedNpcIds || [],
      relatedLocationIds: patch.relatedLocationIds || [],
      tags: patch.tags || [],
    }], { session });

    results.push(toPlain(memory));
  }

  return results;
}

async function applyRumorPatches(gameState, patches, session = null) {
  const results = [];

  for (const patch of patches) {
    if (!patch.content) {
      throw validationError("rumorPatch.content es obligatorio.");
    }

    const rumorId = patch.rumorId || createId("rumor");

    const rumorPayload = {
      rumorId,
      content: patch.content,
      originalContent: patch.originalContent || patch.content,
      origin: patch.origin || "",
      sourceType: patch.sourceType || "anonymous",
      certainty: patch.certainty || "rumor",
      distortionLevel: patch.distortionLevel ?? 0,
      knownByNpcIds: patch.knownByNpcIds || [],
      knownByFactionIds: patch.knownByFactionIds || [],
      locationIds: patch.locationIds || [gameState.locationId],
      relatedEventIds: patch.relatedEventIds || [],
      createdDay: patch.createdDay || gameState.currentDay,
      createdTime: patch.createdTime || gameState.time,
      expiresDay: patch.expiresDay || null,
      status: patch.status || "active",
      tags: patch.tags || [],
    };

    const rumor = await Rumor.findOneAndUpdate(
      { rumorId },
      { $set: rumorPayload },
      { upsert: true, new: true, runValidators: true, session }
    ).lean();

    results.push(rumor);
  }

  return results;
}

async function applyWorldEventPatches(gameState, patches, session = null) {
  const results = [];

  for (const patch of patches) {
    if (!patch.title) {
      throw validationError("worldEventPatch.title es obligatorio.");
    }

    const eventId = patch.eventId || createId("event");

    const eventPayload = {
      eventId,
      title: patch.title,
      type: patch.type || "general",
      scope: patch.scope || "local",
      status: patch.status || "active",
      startDay: patch.startDay || gameState.currentDay,
      startTime: patch.startTime || gameState.time,
      endDay: patch.endDay ?? null,
      endTime: patch.endTime || "",
      affectedLocationIds: patch.affectedLocationIds || [gameState.locationId],
      affectedNpcIds: patch.affectedNpcIds || [],
      affectedFactionIds: patch.affectedFactionIds || [],
      effects: patch.effects || [],
      visibility: patch.visibility || "local",
      cause: patch.cause || "",
      severity: patch.severity || "minor",
      createdBy: patch.createdBy || "system",
      tags: patch.tags || [],
    };

    const worldEvent = await WorldEvent.findOneAndUpdate(
      { eventId },
      { $set: eventPayload },
      { upsert: true, new: true, runValidators: true, session }
    ).lean();

    results.push(worldEvent);
  }

  return results;
}

async function applyLocationPatches(patches, session = null) {
  const results = [];

  for (const patch of patches) {
    if (!patch.locationId) {
      throw validationError("locationPatch.locationId es obligatorio.");
    }

    const location = await Location.findOne({ locationId: patch.locationId }).session(session);

    if (!location) {
      throw validationError(`No existe ubicación con id: ${patch.locationId}`);
    }

    const before = toPlain(location);

    if (patch.currentStatus !== undefined) {
      location.currentStatus = patch.currentStatus;
    }

    if (patch.dangerLevel !== undefined) {
      location.dangerLevel = patch.dangerLevel;
    }

    if (patch.services !== undefined) {
      location.services = {
        ...(toPlain(location.services) || {}),
        ...patch.services,
      };
    }

    if (Array.isArray(patch.setVisibleNpcIds)) {
      location.visibleNpcIds = patch.setVisibleNpcIds;
    }

    if (Array.isArray(patch.setProbableNpcIds)) {
      location.probableNpcIds = patch.setProbableNpcIds;
    }

    if (Array.isArray(patch.addActiveEffects)) {
      for (const effect of patch.addActiveEffects) {
        location.activeEffects.push(effect);
      }
    }

    if (Array.isArray(patch.tags)) {
      location.tags = Array.from(new Set([...(location.tags || []), ...patch.tags]));
    }

    await location.save({ session });

    results.push({
      locationId: location.locationId,
      name: location.name,
      before: {
        currentStatus: before.currentStatus,
        dangerLevel: before.dangerLevel,
        services: before.services,
      },
      after: {
        currentStatus: location.currentStatus,
        dangerLevel: location.dangerLevel,
        services: toPlain(location.services),
      },
      reason: patch.reason || "",
    });
  }

  return results;
}

async function applyShopStockPatches(patches, session = null) {
  const results = [];

  for (const patch of patches) {
    if (!patch.shopId) {
      throw validationError("shopStockPatch.shopId es obligatorio.");
    }

    if (!patch.itemId) {
      throw validationError("shopStockPatch.itemId es obligatorio.");
    }

    if (!Number.isInteger(patch.deltaQuantity) || patch.deltaQuantity === 0) {
      throw validationError("shopStockPatch.deltaQuantity debe ser un entero distinto de cero.");
    }

    const stock = await ShopStock.findOne({
      shopId: patch.shopId,
      itemId: patch.itemId,
    }).session(session);

    if (!stock) {
      throw validationError("No existe stock para ese shopId/itemId.", {
        shopId: patch.shopId,
        itemId: patch.itemId,
      });
    }

    const before = toPlain(stock);
    const afterQuantity = stock.quantity + patch.deltaQuantity;

    if (afterQuantity < 0) {
      throw validationError("Stock insuficiente.", {
        shopId: patch.shopId,
        itemId: patch.itemId,
        currentQuantity: stock.quantity,
        attemptedDelta: patch.deltaQuantity,
      });
    }

    stock.quantity = afterQuantity;

    if (patch.currentPriceCopper !== undefined) {
      if (!Number.isInteger(patch.currentPriceCopper) || patch.currentPriceCopper < 0) {
        throw validationError("shopStockPatch.currentPriceCopper debe ser entero >= 0.");
      }

      stock.currentPriceCopper = patch.currentPriceCopper;
    }

    if (Array.isArray(patch.addScarcityFlags)) {
      stock.scarcityFlags = Array.from(
        new Set([...(stock.scarcityFlags || []), ...patch.addScarcityFlags])
      );
    }

    if (Array.isArray(patch.removeScarcityFlags)) {
      stock.scarcityFlags = (stock.scarcityFlags || []).filter(
        (flag) => !patch.removeScarcityFlags.includes(flag)
      );
    }

    await stock.save({ session });

    results.push({
      shopId: stock.shopId,
      itemId: stock.itemId,
      before: {
        quantity: before.quantity,
        currentPriceCopper: before.currentPriceCopper,
        scarcityFlags: before.scarcityFlags,
      },
      deltaQuantity: patch.deltaQuantity,
      after: {
        quantity: stock.quantity,
        currentPriceCopper: stock.currentPriceCopper,
        scarcityFlags: stock.scarcityFlags,
      },
      reason: patch.reason || "",
    });
  }

  return results;
}

function validateEventLogInputs(eventLogs) {
  if (!Array.isArray(eventLogs)) return;

  for (const log of eventLogs) {
    const source = log.source || "player_action";
    const visibility = log.visibility || "private";

    if (!VALID_EVENT_LOG_SOURCES.has(source)) {
      throw validationError("eventLogs.source invalido.", {
        source,
        allowedSources: Array.from(VALID_EVENT_LOG_SOURCES),
      });
    }

    if (!VALID_EVENT_LOG_VISIBILITIES.has(visibility)) {
      throw validationError("eventLogs.visibility invalida.", {
        visibility,
        allowedVisibilities: Array.from(VALID_EVENT_LOG_VISIBILITIES),
      });
    }
  }
}

async function validateEventLogsForInsert(logsToCreate, session = null) {
  const issues = [];
  const logIds = new Set();

  for (const log of logsToCreate) {
    if (logIds.has(log.logId)) {
      issues.push({
        logId: log.logId,
        message: "logId duplicado dentro del request.",
      });
      continue;
    }

    logIds.add(log.logId);

    const validation = new EventLog(log).validateSync();
    if (validation) {
      issues.push({
        logId: log.logId,
        message: validation.message,
      });
    }
  }

  if (issues.length > 0) {
    throw validationError("eventLogs no pasan validacion.", { issues });
  }

  if (logIds.size > 0) {
    const existing = await EventLog.find({ logId: { $in: Array.from(logIds) } })
      .select("logId")
      .session(session)
      .lean();

    if (existing.length > 0) {
      throw validationError("eventLogs.logId ya existe.", {
        existingLogIds: existing.map((log) => log.logId),
      });
    }
  }
}

function validateHourBoundaryCost({ timeAdvance, currentTime, body }) {
  if (!timeAdvance) return;

  const from = timeAdvance.from || currentTime;
  const to = timeAdvance.to;

  if (!isValidTime(from) || !isValidTime(to)) return;

  const minutes = timeToMinutes(to) - timeToMinutes(from);

  if (minutes > 0 && to.endsWith(":00")) {
    const hasActivityCost = Boolean(body.activityCost);
    const hasLucasPatch = Boolean(body.lucasPatch);
    const hasExemption = Boolean(String(body.biologicalCostExemptReason || "").trim());

    if (!hasActivityCost && !hasLucasPatch && !hasExemption) {
      throw validationError(
        "timeAdvance reaches hour boundary but no biological cost or exemption was provided.",
        { from, to, minutes }
      );
    }
  }
}

function applyActivityCost(gameState, activityCost) {
  if (!activityCost) return null;

  const cost = calculateActivityCost({
    category: activityCost.category,
    minutes: activityCost.minutes,
    currentEnergy: gameState.lucasStatus.energy.current,
    currentSatiety: gameState.lucasStatus.satiety.current,
  });

  return {
    category: cost.categoryId,
    label: cost.label,
    minutes: cost.minutes,
    reason: activityCost.reason || "",
    satiety: applyStatDelta(gameState.lucasStatus.satiety, cost.delta.satiety, "satiety"),
    energy: applyStatDelta(gameState.lucasStatus.energy, cost.delta.energy, "energy"),
    perHour: cost.perHour,
    fatigueMultiplier: cost.fatigueMultiplier,
  };
}

async function applyTurn(req, res) {
  let session = null;

  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        ok: false,
        error: "MongoDB no está conectado. Configurá MONGODB_URI.",
      });
    }

    const body = req.body || {};
    validateEventLogInputs(body.eventLogs);

    let responsePayload = null;
    session = await mongoose.startSession();

    await session.withTransaction(async () => {
      const gameId = body.gameId || "isekai_lucas_main";
      const gameState = await GameState.findOne({ gameId }).session(session);

      if (!gameState) {
        const error = new Error(`No existe GameState para gameId: ${gameId}`);
        error.statusCode = 404;
        throw error;
      }

      const changes = {};

      if (body.timeAdvance) {
        const { from, to } = body.timeAdvance;
        const effectiveFrom = from || gameState.time;

        if (from && from !== gameState.time) {
          throw validationError("timeAdvance.from no coincide con la hora actual del GameState.", {
            currentTime: gameState.time,
            receivedFrom: from,
          });
        }

        if (!isValidTime(to)) {
          throw validationError("timeAdvance.to debe tener formato HH:MM exacto.");
        }

        if (timeToMinutes(to) < timeToMinutes(effectiveFrom)) {
          throw validationError("timeAdvance.to no puede ser anterior a timeAdvance.from dentro del mismo dia.", {
            from: effectiveFrom,
            to,
          });
        }

        validateHourBoundaryCost({
          timeAdvance: { from: effectiveFrom, to },
          currentTime: gameState.time,
          body,
        });

        changes.time = {
          before: gameState.time,
          after: to,
          blockAfter: getBlockFromTime(to),
        };

        gameState.time = to;
        gameState.block = getBlockFromTime(to);
      }

      if (body.gameStatePatch?.locationId) {
        const location = await Location.findOne({ locationId: body.gameStatePatch.locationId })
          .select("locationId name")
          .session(session)
          .lean();

        if (!location) {
          throw validationError("gameStatePatch.locationId no existe.", {
            locationId: body.gameStatePatch.locationId,
          });
        }

        const before = gameState.locationId;
        gameState.locationId = body.gameStatePatch.locationId;
        changes.location = {
          before,
          after: gameState.locationId,
          locationName: location.name,
        };
      }

      if (body.moneyPatch) {
        const { deltaCopper, reason } = body.moneyPatch;

        if (!Number.isInteger(deltaCopper)) {
          throw validationError("moneyPatch.deltaCopper debe ser un número entero.");
        }

        const before = gameState.moneyCopper;
        const after = before + deltaCopper;

        if (after < 0) {
          throw validationError("El dinero no puede quedar negativo.", {
            currentMoneyCopper: before,
            attemptedDelta: deltaCopper,
          });
        }

        gameState.moneyCopper = after;

        changes.money = {
          before,
          delta: deltaCopper,
          after,
          reason: reason || "",
        };
      }

      if (body.lucasPatch) {
        const lucasChanges = {};

        const allowedStats = {
          lifeDelta: "life",
          satietyDelta: "satiety",
          energyDelta: "energy",
          mpDelta: "mp",
        };

        for (const [deltaKey, statKey] of Object.entries(allowedStats)) {
          if (body.lucasPatch[deltaKey] !== undefined) {
            const delta = body.lucasPatch[deltaKey];

            if (!Number.isInteger(delta)) {
              throw validationError(`${deltaKey} debe ser un número entero.`);
            }

            lucasChanges[statKey] = applyStatDelta(gameState.lucasStatus[statKey], delta, statKey);
          }
        }

        if (Array.isArray(body.lucasPatch.addInjuries)) {
          for (const injury of body.lucasPatch.addInjuries) {
            gameState.lucasStatus.injuries.push(injury);
          }

          lucasChanges.addInjuries = body.lucasPatch.addInjuries;
        }

        if (Array.isArray(body.lucasPatch.addConditions)) {
          for (const condition of body.lucasPatch.addConditions) {
            gameState.lucasStatus.conditions.push(condition);
          }

          lucasChanges.addConditions = body.lucasPatch.addConditions;
        }

        if (Object.keys(lucasChanges).length > 0) {
          changes.lucasStatus = lucasChanges;
        }
      }

      if (body.activityCost) {
        changes.activityCost = applyActivityCost(gameState, body.activityCost);
        changes.lucasStatus = {
          ...(changes.lucasStatus || {}),
          activityCost: {
            satiety: changes.activityCost.satiety,
            energy: changes.activityCost.energy,
          },
        };
      }

      if (Array.isArray(body.inventoryPatch)) {
        const inventoryChanges = [];

        for (const patch of body.inventoryPatch) {
          inventoryChanges.push(await applyInventoryPatch(gameState.inventory, patch, session));
        }

        if (inventoryChanges.length > 0) {
          changes.inventory = inventoryChanges;
        }
      }

      if (Array.isArray(body.skillPatch)) {
        const skillChanges = [];

        for (const patch of body.skillPatch) {
          const skill = gameState.skills.find((entry) => entry.skillId === patch.skillId);

          if (!skill) {
            throw validationError(`No existe la habilidad: ${patch.skillId}`);
          }

          skillChanges.push({
            skillId: patch.skillId,
            name: skill.name,
            reason: patch.reason || "",
            ...applySkillExp(skill, patch.expDelta),
          });
        }

        if (skillChanges.length > 0) {
          changes.skills = skillChanges;
        }
      }

      let updatedGameState = gameState.toObject();

      if (Array.isArray(body.npcRelationshipPatches)) {
        const relationshipChanges = await applyNpcRelationshipPatches(body.npcRelationshipPatches, session);
        if (relationshipChanges.length > 0) changes.npcRelationships = relationshipChanges;
      }

      if (Array.isArray(body.npcMemoryPatches)) {
        const memoryChanges = await applyNpcMemoryPatches(updatedGameState, body.npcMemoryPatches, session);
        if (memoryChanges.length > 0) changes.npcMemories = memoryChanges;
      }

      if (Array.isArray(body.rumorPatches)) {
        const rumorChanges = await applyRumorPatches(updatedGameState, body.rumorPatches, session);
        if (rumorChanges.length > 0) changes.rumors = rumorChanges;
      }

      if (Array.isArray(body.worldEventPatches)) {
        const worldEventChanges = await applyWorldEventPatches(updatedGameState, body.worldEventPatches, session);
        if (worldEventChanges.length > 0) changes.worldEvents = worldEventChanges;
      }

      if (Array.isArray(body.locationPatches)) {
        const locationChanges = await applyLocationPatches(body.locationPatches, session);
        if (locationChanges.length > 0) changes.locations = locationChanges;
      }

      if (Array.isArray(body.shopStockPatches)) {
        const shopStockChanges = await applyShopStockPatches(body.shopStockPatches, session);
        if (shopStockChanges.length > 0) changes.shopStocks = shopStockChanges;
      }

      const logsToCreate = [];

      if (Array.isArray(body.eventLogs)) {
        for (const log of body.eventLogs) {
          logsToCreate.push({
            logId: log.logId || createLogId(),
            day: updatedGameState.currentDay,
            timeStart: body.timeAdvance?.from || changes.time?.before || updatedGameState.time,
            timeEnd: body.timeAdvance?.to || updatedGameState.time,
            locationId: updatedGameState.locationId,
            type: log.type || "turn_update",
            summary: log.summary || body.actionSummary || "Turno actualizado.",
            involvedCharacterIds: log.involvedCharacterIds || ["char_lucas"],
            involvedNpcIds: log.involvedNpcIds || [],
            involvedFactionIds: log.involvedFactionIds || [],
            mechanicalChanges: log.mechanicalChanges || changes,
            visibility: log.visibility || "private",
            source: log.source || "player_action",
            tags: log.tags || [],
          });
        }
      } else if (body.actionSummary || Object.keys(changes).length > 0) {
        logsToCreate.push({
          logId: createLogId(),
          day: updatedGameState.currentDay,
          timeStart: changes.time?.before || updatedGameState.time,
          timeEnd: updatedGameState.time,
          locationId: updatedGameState.locationId,
          type: "turn_update",
          summary: body.actionSummary || "Turno actualizado.",
          involvedCharacterIds: ["char_lucas"],
          mechanicalChanges: changes,
          visibility: "private",
          source: "player_action",
        });
      }

      await validateEventLogsForInsert(logsToCreate, session);
      await gameState.save({ session });

      if (changes.time) {
        const routineSync = await syncNpcRoutines({
          day: gameState.currentDay,
          time: gameState.time,
          session,
        });

        if (routineSync.updatedCount > 0) {
          changes.routineSync = routineSync;
        }
      }

      if (logsToCreate.length > 0) {
        await EventLog.insertMany(logsToCreate, { session });
      }

      updatedGameState = gameState.toObject();

      responsePayload = {
      ok: true,
      message: "Turno aplicado correctamente.",
      changes,
      gameState: updatedGameState,
      eventLogsCreated: logsToCreate.length,
      };
    });

    return res.json(responsePayload);
  } catch (error) {
    const statusCode = error.statusCode || 500;

    return res.status(statusCode).json({
      ok: false,
      error: statusCode === 500 ? "Error aplicando turno." : error.message,
      details: error.details || error.message,
    });
  } finally {
    if (session) {
      await session.endSession();
    }
  }
}

module.exports = {
  applyTurn,
};
