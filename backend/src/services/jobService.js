const mongoose = require("mongoose");

const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");
const JobContract = require("../models/JobContract");
const {
  calculateActivityCost,
  getEnergyLabel,
  getSatietyLabel,
  previewBiologicalClockBlock,
} = require("./biologicalClockService");
const { expireAvailableMissionsForGameState } = require("./missionService");
const { createAutomaticCheckpoint } = require("./checkpointService");
const {
  ACTION_FAMILIES,
  attachNarrativeTrackingToLogDrafts,
  buildNarrativeHints,
} = require("./narrativeVariationService");

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getBlockFromTime(time) {
  const hour = Number(String(time || "00:00").split(":")[0]);

  if (hour >= 0 && hour < 6) return "Madrugada";
  if (hour >= 6 && hour < 12) return "Mañana";
  if (hour >= 12 && hour < 14) return "Mediodía";
  if (hour >= 14 && hour < 18) return "Tarde";
  return "Noche";
}

function getHourBlockForTime(time) {
  const blockStart = Math.floor(timeToMinutes(time) / 60) * 60;
  return `${minutesToTime(blockStart)}-${minutesToTime(blockStart + 60)}`;
}

function toAbsoluteMinutes(day, time) {
  return (Number(day || 1) - 1) * 1440 + timeToMinutes(time);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createLogId() {
  return `log_job_shift_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function dayKey(day) {
  return `day_${Number(day) || 1}`;
}

function findShift(contract, shiftId) {
  return (contract.shifts || []).find((shift) => shift.shiftId === shiftId);
}

function getContractFlags(contract) {
  if (!contract.flags || typeof contract.flags !== "object") contract.flags = {};
  if (!contract.flags.completedShifts || typeof contract.flags.completedShifts !== "object") {
    contract.flags.completedShifts = {};
  }
  if (!contract.flags.consumedMeals || typeof contract.flags.consumedMeals !== "object") {
    contract.flags.consumedMeals = {};
  }
  return contract.flags;
}

function getMealLedgerForDay(flags, currentDay) {
  const key = dayKey(currentDay);
  if (!flags.consumedMeals[key] || typeof flags.consumedMeals[key] !== "object") {
    flags.consumedMeals[key] = {};
  }
  return flags.consumedMeals[key];
}

function getShiftLedgerForDay(flags, currentDay) {
  const key = dayKey(currentDay);
  if (!flags.completedShifts[key] || typeof flags.completedShifts[key] !== "object") {
    flags.completedShifts[key] = {};
  }
  return flags.completedShifts[key];
}

function mealLogMatchesMeal(meal, log) {
  const mealId = normalizeText(meal.mealId);
  const mealName = normalizeText(meal.name);
  const tags = (log.tags || []).map(normalizeText);
  const summary = normalizeText(log.summary);
  const changes = normalizeText(JSON.stringify(log.mechanicalChanges || {}));
  const haystack = `${tags.join(" ")} ${summary} ${changes}`;

  if (mealId.includes("breakfast") || mealName.includes("desayuno")) {
    return (
      tags.includes("contract_breakfast") ||
      haystack.includes("contract breakfast") ||
      haystack.includes("desayuno de contrato") ||
      haystack.includes("desayuno")
    );
  }

  if (mealId.includes("main_meal") || mealName.includes("comida principal")) {
    return (
      tags.includes("contract_main_meal") ||
      tags.includes("contract_lunch") ||
      haystack.includes("comida principal") ||
      haystack.includes("almuerzo de contrato") ||
      haystack.includes("comida de contrato")
    );
  }

  const nameTokens = mealName.split(" ").filter((token) => token.length >= 4);
  return nameTokens.length > 0 && nameTokens.every((token) => haystack.includes(token));
}

async function inferConsumedContractMealsFromLogs({ gameId, currentDay, shift, meals, session = null }) {
  if (!Array.isArray(meals) || meals.length === 0) {
    return {
      mealIds: [],
      evidence: {},
    };
  }

  const logs = await EventLog.find({
    gameId,
    day: currentDay,
    timeStart: { $lte: shift.startTime },
    $or: [
      { type: "meal" },
      { tags: { $in: ["meal", "contract_breakfast", "contract_main_meal", "contract_lunch", "quick_meal"] } },
    ],
  })
    .sort({ timeStart: -1 })
    .limit(20)
    .session(session)
    .lean();

  const mealIds = [];
  const evidence = {};

  for (const meal of meals) {
    const match = logs.find((log) => mealLogMatchesMeal(meal, log));
    if (match) {
      mealIds.push(meal.mealId);
      evidence[meal.mealId] = {
        logId: match.logId,
        timeStart: match.timeStart,
        timeEnd: match.timeEnd || "",
        tags: match.tags || [],
        summary: match.summary || "",
      };
    }
  }

  return {
    mealIds,
    evidence,
  };
}

async function summarizeMealAvailability({ contract, shift, gameState }) {
  const flags = getContractFlags(contract);
  const mealLedger = getMealLedgerForDay(flags, gameState.currentDay);
  const includedMealIds = new Set(shift.includedMealIds || []);
  const includedMeals = (contract.mealBenefits || []).filter((meal) => includedMealIds.has(meal.mealId));
  const inferred = await inferConsumedContractMealsFromLogs({
    gameId: gameState.gameId,
    currentDay: gameState.currentDay,
    shift,
    meals: includedMeals,
  });
  const inferredMealIds = new Set(inferred.mealIds);
  const mealBenefits = includedMeals.map((meal) => {
    const ledgerEntry = mealLedger[meal.mealId] || null;
    const inferredEntry = inferred.evidence[meal.mealId] || null;
    return {
      ...meal,
      consumedToday: Boolean(ledgerEntry) || inferredMealIds.has(meal.mealId),
      consumedEntry: ledgerEntry,
      inferredConsumedEntry: inferredEntry,
    };
  });
  const availableMealBenefits = mealBenefits.filter((meal) => !meal.consumedToday);

  const grossMealDelta = mealBenefits.reduce(
    (total, meal) => ({
      satiety: total.satiety + (meal.satietyBonus || 0),
      energy: total.energy + (meal.energyBonus || 0),
    }),
    { satiety: 0, energy: 0 }
  );
  const directMealDelta = availableMealBenefits.reduce(
    (total, meal) => ({
      satiety: total.satiety + (meal.satietyBonus || 0),
      energy: total.energy + (meal.energyBonus || 0),
    }),
    { satiety: 0, energy: 0 }
  );

  return {
    mealBenefits,
    availableMealBenefits,
    grossMealDelta,
    directMealDelta,
    inferredConsumedMealIds: inferred.mealIds,
    inferredConsumedEvidence: inferred.evidence,
  };
}

function getShiftAvailability(shift, gameState) {
  const currentMinutes = timeToMinutes(gameState.time);
  const startMinutes = timeToMinutes(shift.startTime);
  const endMinutes = timeToMinutes(shift.endTime);

  if (currentMinutes > endMinutes) {
    return {
      canStart: false,
      status: "past",
      reason: "El turno ya termino para la hora actual.",
    };
  }

  if (currentMinutes > startMinutes && currentMinutes <= endMinutes) {
    return {
      canStart: false,
      status: "in_progress_window",
      reason: "El turno ya empezo; requiere regla explicita para entrada tarde.",
    };
  }

  return {
    canStart: true,
    status: currentMinutes === startMinutes ? "now" : "upcoming",
    reason: "Turno disponible para preview o completar con validacion de contrato.",
  };
}

async function getActiveJobContract({ characterId = "char_lucas", contractId = "" } = {}) {
  const query = contractId ? { contractId, characterId } : { characterId, status: "active" };
  const contract = await JobContract.findOne(query).lean();

  if (!contract) {
    const error = new Error(
      contractId
        ? `No existe contrato laboral ${contractId} para characterId: ${characterId}`
        : `No existe contrato laboral activo para characterId: ${characterId}`
    );
    error.statusCode = 404;
    throw error;
  }

  return contract;
}

async function getAvailableShifts({ gameId = "isekai_lucas_main", characterId = "char_lucas", contractId = "" } = {}) {
  const [gameState, contract] = await Promise.all([
    GameState.findOne({ gameId }).lean(),
    getActiveJobContract({ characterId, contractId }),
  ]);

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const shifts = (contract.shifts || []).map((shift) => ({
    ...shift,
    availability: getShiftAvailability(shift, gameState),
  }));

  return {
    gameState: {
      gameId: gameState.gameId,
      currentDay: gameState.currentDay,
      time: gameState.time,
      locationId: gameState.locationId,
    },
    contract,
    shifts,
  };
}

async function previewShift({
  shiftId,
  gameId = "isekai_lucas_main",
  characterId = "char_lucas",
  contractId = "",
} = {}) {
  const [gameState, contract] = await Promise.all([
    GameState.findOne({ gameId }).lean(),
    getActiveJobContract({ characterId, contractId }),
  ]);

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const shift = findShift(contract, shiftId);

  if (!shift) {
    const error = new Error(`No existe turno laboral con id: ${shiftId}`);
    error.statusCode = 404;
    throw error;
  }

  const biologicalPreview = previewBiologicalClockBlock({
    activities: [
      {
        category: shift.activityCategory,
        minutes: shift.expectedMinutes,
      },
    ],
    currentStatus: {
      satiety: gameState.lucasStatus?.satiety?.current,
      energy: gameState.lucasStatus?.energy?.current,
    },
  });

  const mealAvailability = await summarizeMealAvailability({ contract, shift, gameState });

  return {
    dryRun: true,
    gameState: {
      gameId: gameState.gameId,
      currentDay: gameState.currentDay,
      time: gameState.time,
      locationId: gameState.locationId,
      moneyCopper: gameState.moneyCopper,
    },
    contractId: contract.contractId,
    shift,
    availability: getShiftAvailability(shift, gameState),
    payPreview: {
      moneyCopper: shift.payCopper || 0,
      dailyContractPayCopper: contract.pay?.dailyCopper || 0,
      notes: contract.pay?.notes || "",
    },
    mealBenefits: mealAvailability.mealBenefits,
    availableMealBenefits: mealAvailability.availableMealBenefits,
    grossMealDelta: mealAvailability.grossMealDelta,
    directMealDelta: mealAvailability.directMealDelta,
    inferredConsumedMealIds: mealAvailability.inferredConsumedMealIds,
    inferredConsumedEvidence: mealAvailability.inferredConsumedEvidence,
    biologicalPreview,
    mutation: {
      willMutateGameState: false,
      reason: "Preview sin mutacion. Usar completeJobShift para cerrar un turno real validado.",
    },
  };
}

function applyMealBenefit(gameState, meal) {
  const before = {
    satiety: gameState.lucasStatus.satiety.current,
    energy: gameState.lucasStatus.energy.current,
  };

  const satietyAfter = clamp(before.satiety + (meal.satietyBonus || 0), 0, gameState.lucasStatus.satiety.max);
  const energyAfter = clamp(before.energy + (meal.energyBonus || 0), 0, gameState.lucasStatus.energy.max);

  gameState.lucasStatus.satiety.current = satietyAfter;
  gameState.lucasStatus.satiety.label = getSatietyLabel(satietyAfter);
  gameState.lucasStatus.energy.current = energyAfter;
  gameState.lucasStatus.energy.label = getEnergyLabel(energyAfter);

  return {
    mealId: meal.mealId,
    name: meal.name,
    satiety: {
      before: before.satiety,
      delta: satietyAfter - before.satiety,
      after: satietyAfter,
      labelAfter: gameState.lucasStatus.satiety.label,
    },
    energy: {
      before: before.energy,
      delta: energyAfter - before.energy,
      after: energyAfter,
      labelAfter: gameState.lucasStatus.energy.label,
    },
  };
}

function applyShiftActivityCost(gameState, shift) {
  const before = {
    satiety: gameState.lucasStatus.satiety.current,
    energy: gameState.lucasStatus.energy.current,
  };
  const cost = calculateActivityCost({
    category: shift.activityCategory,
    minutes: shift.expectedMinutes,
    currentEnergy: before.energy,
    currentSatiety: before.satiety,
  });
  const satietyAfter = clamp(before.satiety + cost.delta.satiety, 0, gameState.lucasStatus.satiety.max);
  const energyAfter = clamp(before.energy + cost.delta.energy, 0, gameState.lucasStatus.energy.max);

  gameState.lucasStatus.satiety.current = satietyAfter;
  gameState.lucasStatus.satiety.label = getSatietyLabel(satietyAfter);
  gameState.lucasStatus.energy.current = energyAfter;
  gameState.lucasStatus.energy.label = getEnergyLabel(energyAfter);

  if (!gameState.biologicalClock) gameState.biologicalClock = {};
  if (!Array.isArray(gameState.biologicalClock.pendingAccumulations)) {
    gameState.biologicalClock.pendingAccumulations = [];
  }
  gameState.biologicalClock.lastProcessedTime = shift.endTime;
  gameState.biologicalClock.currentHourBlock = getHourBlockForTime(shift.endTime);

  return {
    category: cost.categoryId,
    label: cost.label,
    minutes: shift.expectedMinutes,
    satiety: {
      before: before.satiety,
      delta: satietyAfter - before.satiety,
      after: satietyAfter,
      labelAfter: gameState.lucasStatus.satiety.label,
    },
    energy: {
      before: before.energy,
      delta: energyAfter - before.energy,
      after: energyAfter,
      labelAfter: gameState.lucasStatus.energy.label,
    },
    rawPreview: cost,
  };
}

function isPendingAccumulation(entry) {
  return entry && entry.status !== "processed" && !entry.processedAt;
}

function normalizePendingAccumulationIdentities(gameState) {
  const pending = gameState.biologicalClock?.pendingAccumulations || [];
  let changed = false;

  for (const entry of pending) {
    if (!entry) continue;
    if (!entry.gameId) {
      entry.gameId = gameState.gameId || "isekai_lucas_main";
      changed = true;
    }
    if (!entry.characterId) {
      entry.characterId = gameState.characterId || "char_lucas";
      changed = true;
    }
  }

  return changed;
}

function markPendingAccumulationsCoveredByShift(gameState, shift) {
  if (!gameState.biologicalClock) gameState.biologicalClock = {};
  if (!Array.isArray(gameState.biologicalClock.pendingAccumulations)) {
    gameState.biologicalClock.pendingAccumulations = [];
  }
  const normalizedLegacyIdentities = normalizePendingAccumulationIdentities(gameState);

  const currentDay = gameState.currentDay;
  const shiftStartAbs = toAbsoluteMinutes(currentDay, shift.startTime);
  const shiftEndAbs = toAbsoluteMinutes(currentDay, shift.endTime);
  const covered = [];

  for (const entry of gameState.biologicalClock.pendingAccumulations) {
    if (!isPendingAccumulation(entry)) continue;
    if (entry.day !== currentDay) continue;

    const blockStartAbs = toAbsoluteMinutes(entry.day, entry.blockStart);
    const blockEndAbs = toAbsoluteMinutes(entry.day, entry.blockEnd);
    const overlapsShift = blockStartAbs < shiftEndAbs && blockEndAbs > shiftStartAbs;

    if (!overlapsShift) continue;

    entry.status = "processed";
    entry.processedAt = new Date();
    entry.processedDay = currentDay;
    entry.processedTime = shift.endTime;
    entry.processedMode = "covered_by_complete_job_shift";
    entry.processedReason = `Cubierto por completeJobShift ${shift.shiftId}; el coste del turno ya fue aplicado de forma agregada.`;

    covered.push({
      accumulationId: entry.accumulationId,
      day: entry.day,
      blockStart: entry.blockStart,
      blockEnd: entry.blockEnd,
      category: entry.category,
      minutes: entry.minutes,
      processedMode: entry.processedMode,
    });
  }

  if (normalizedLegacyIdentities && covered.length === 0) {
    gameState.markModified("biologicalClock");
  }

  return covered;
}

async function completeShift({
  shiftId,
  gameId = "isekai_lucas_main",
  characterId = "char_lucas",
  contractId = "",
  alreadyConsumedMealIds = [],
  skipMealIds = [],
  completionSummary = "",
  allowLateCompletion = false,
} = {}) {
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const gameState = await GameState.findOne({ gameId }).session(session);
      if (!gameState) {
        const error = new Error(`No existe GameState para gameId: ${gameId}`);
        error.statusCode = 404;
        throw error;
      }

      const contractQuery = contractId
        ? { contractId, characterId }
        : { characterId, status: "active" };
      const contract = await JobContract.findOne(contractQuery).session(session);
      if (!contract) {
        const error = new Error(
          contractId
            ? `No existe contrato laboral ${contractId} para characterId: ${characterId}`
            : `No existe contrato laboral activo para characterId: ${characterId}`
        );
        error.statusCode = 404;
        throw error;
      }

      const shift = findShift(contract, shiftId);
      if (!shift) {
        const error = new Error(`No existe turno laboral con id: ${shiftId}`);
        error.statusCode = 404;
        throw error;
      }

      const currentMinutes = timeToMinutes(gameState.time);
      const startMinutes = timeToMinutes(shift.startTime);
      const endMinutes = timeToMinutes(shift.endTime);
      const flags = getContractFlags(contract);
      const shiftLedger = getShiftLedgerForDay(flags, gameState.currentDay);
      const mealLedger = getMealLedgerForDay(flags, gameState.currentDay);
      const before = {
        day: gameState.currentDay,
        time: gameState.time,
        block: gameState.block,
        moneyCopper: gameState.moneyCopper,
        satiety: gameState.lucasStatus.satiety.current,
        energy: gameState.lucasStatus.energy.current,
      };

      if (shiftLedger[shift.shiftId]) {
        result = {
          alreadyCompleted: true,
          gameId,
          contractId: contract.contractId,
          shiftId: shift.shiftId,
          shift,
          previousCompletion: shiftLedger[shift.shiftId],
          before,
          after: before,
          changes: {
            pay: { applied: false, reason: "shift_already_completed" },
            meals: [],
            activityCost: null,
          },
        };
        return;
      }

      if (endMinutes <= startMinutes) {
        const error = new Error("completeJobShift no soporta turnos que cruzan medianoche.");
        error.statusCode = 400;
        throw error;
      }
      if (currentMinutes < startMinutes) {
        const error = new Error("El turno todavia no comenzo; no se puede completarlo antes de su hora de inicio.");
        error.statusCode = 400;
        error.details = { currentTime: gameState.time, shiftStartTime: shift.startTime };
        throw error;
      }
      if (currentMinutes > endMinutes) {
        const error = new Error("El turno ya termino para la hora actual.");
        error.statusCode = 400;
        error.details = { currentTime: gameState.time, shiftEndTime: shift.endTime };
        throw error;
      }
      if (currentMinutes > startMinutes && !allowLateCompletion) {
        const error = new Error("El turno ya empezo; se requiere allowLateCompletion para cierre tardio controlado.");
        error.statusCode = 400;
        error.details = { currentTime: gameState.time, shiftStartTime: shift.startTime, shiftEndTime: shift.endTime };
        throw error;
      }

      const includedMealIds = new Set(shift.includedMealIds || []);
      const skipMeals = new Set(unique(skipMealIds));
      const markConsumedOnly = new Set(unique(alreadyConsumedMealIds));
      const includedMeals = (contract.mealBenefits || []).filter((meal) => includedMealIds.has(meal.mealId));
      const inferredConsumed = await inferConsumedContractMealsFromLogs({
        gameId,
        currentDay: gameState.currentDay,
        shift,
        meals: includedMeals,
        session,
      });
      for (const mealId of inferredConsumed.mealIds) {
        markConsumedOnly.add(mealId);
      }
      const mealChanges = [];
      const mealAppliedIds = [];
      const mealMarkedConsumedIds = [];
      const mealInferredConsumedIds = [];
      const mealSkippedIds = [];

      for (const meal of includedMeals) {
        if (mealLedger[meal.mealId]) {
          mealSkippedIds.push(meal.mealId);
          continue;
        }

        if (skipMeals.has(meal.mealId)) {
          mealSkippedIds.push(meal.mealId);
          continue;
        }

        if (markConsumedOnly.has(meal.mealId)) {
          const inferredEvidence = inferredConsumed.evidence[meal.mealId] || null;
          mealLedger[meal.mealId] = {
            mealId: meal.mealId,
            day: gameState.currentDay,
            time: gameState.time,
            sourceShiftId: shift.shiftId,
            status: inferredEvidence
              ? "inferred_consumed_before_shift_completion"
              : "already_consumed_before_shift_completion",
            inferredFromEventLogId: inferredEvidence?.logId || "",
            inferredFromTags: inferredEvidence?.tags || [],
          };
          mealMarkedConsumedIds.push(meal.mealId);
          if (inferredEvidence) mealInferredConsumedIds.push(meal.mealId);
          continue;
        }

        const mealChange = applyMealBenefit(gameState, meal);
        mealLedger[meal.mealId] = {
          mealId: meal.mealId,
          day: gameState.currentDay,
          time: gameState.time,
          sourceShiftId: shift.shiftId,
          status: "applied_by_complete_shift",
          satietyDelta: mealChange.satiety.delta,
          energyDelta: mealChange.energy.delta,
        };
        mealAppliedIds.push(meal.mealId);
        mealChanges.push(mealChange);
      }

      const activityCost = applyShiftActivityCost(gameState, shift);
      const coveredPendingAccumulations = markPendingAccumulationsCoveredByShift(gameState, shift);
      const beforeMoney = gameState.moneyCopper;
      const payCopper = shift.payCopper || 0;
      gameState.moneyCopper += payCopper;
      gameState.time = shift.endTime;
      gameState.block = getBlockFromTime(shift.endTime);
      const missionExpiry = await expireAvailableMissionsForGameState(gameState, {
        session,
        reason: "expired_during_complete_job_shift",
      });

      shiftLedger[shift.shiftId] = {
        shiftId: shift.shiftId,
        day: gameState.currentDay,
        startedAt: shift.startTime,
        completedAt: shift.endTime,
        processedAt: new Date(),
        payCopper,
        mealAppliedIds,
        mealMarkedConsumedIds,
        mealInferredConsumedIds,
        mealSkippedIds,
        activityCategory: shift.activityCategory,
        expectedMinutes: shift.expectedMinutes,
        completionSummary,
      };

      gameState.markModified("biologicalClock");
      contract.markModified("flags");
      await gameState.save({ session });
      await contract.save({ session });

      const after = {
        day: gameState.currentDay,
        time: gameState.time,
        block: gameState.block,
        moneyCopper: gameState.moneyCopper,
        satiety: gameState.lucasStatus.satiety.current,
        energy: gameState.lucasStatus.energy.current,
      };
      const baseChanges = {
        time: {
          before: before.time,
          after: after.time,
          elapsedMinutes: endMinutes - startMinutes,
        },
        pay: {
          before: beforeMoney,
          delta: payCopper,
          after: gameState.moneyCopper,
        },
        meals: {
          applied: mealAppliedIds,
          markedConsumed: mealMarkedConsumedIds,
          inferredConsumed: mealInferredConsumedIds,
          skipped: mealSkippedIds,
          details: mealChanges,
        },
        activityCost,
        biologicalClock: {
          coveredPendingAccumulations,
        },
        missionExpiry,
        ledger: shiftLedger[shift.shiftId],
      };
      const logDraft = {
        logId: createLogId(),
        gameId,
        day: before.day,
        timeStart: before.time,
        timeEnd: after.time,
        locationId: contract.locationId,
        type: "job_shift_completed",
        summary: completionSummary || `Turno laboral completado: ${shift.name}.`,
        involvedCharacterIds: [characterId],
        involvedNpcIds: unique([contract.employerNpcId]),
        mechanicalChanges: {
          contractId: contract.contractId,
          shiftId: shift.shiftId,
          before,
          after,
          pay: baseChanges.pay,
          meals: baseChanges.meals,
          activityCost,
          biologicalClock: baseChanges.biologicalClock,
          missionExpiry,
        },
        visibility: "hidden",
        source: "backend_validation",
        tags: ["job_shift", "complete_shift"],
      };
      const narrativeHints = await buildNarrativeHints({
        gameId,
        gameState: gameState.toObject(),
        actionSummary: logDraft.summary,
        changes: baseChanges,
        logDrafts: [logDraft],
        actionFamily: ACTION_FAMILIES.JOB_SHIFT,
        involvedNpcIds: logDraft.involvedNpcIds,
        session,
        seed: shift.shiftId,
      });
      attachNarrativeTrackingToLogDrafts([logDraft], narrativeHints);

      const log = await EventLog.create(
        [
          {
            ...logDraft,
          },
        ],
        { session }
      );

      const autoCheckpoint = await createAutomaticCheckpoint({
        gameId,
        title: `Auto checkpoint - turno laboral ${shift.name}`,
        reason: `Checkpoint automático tras completar turno laboral: ${shift.name}.`,
        triggerKey: `complete_job_shift:${shift.shiftId}`,
        metadata: {
          source: "completeJobShift",
          contractId: contract.contractId,
          shiftId: shift.shiftId,
          elapsedMinutes: endMinutes - startMinutes,
          payCopper,
        },
        session,
      });

      result = {
        alreadyCompleted: false,
        gameId,
        contractId: contract.contractId,
        shiftId: shift.shiftId,
        shift,
        before,
        after,
        changes: {
          ...baseChanges,
          eventLogId: log[0].logId,
          autoCheckpoint,
          narrativeHints,
        },
        skillProgressionSuggestions: [
          {
            skillId: "skill_resistencia",
            category: shift.activityCategory,
            reason: "Turno laboral completado; resolver EXP con previewSkillProgression/applyTurn si corresponde.",
            mutates: false,
          },
        ],
      };
    });
  } finally {
    await session.endSession();
  }

  return result;
}

async function completeShiftDryRun({
  shiftId,
  gameId = "isekai_lucas_main",
  characterId = "char_lucas",
  contractId = "",
} = {}) {
  return previewShift({ shiftId, gameId, characterId, contractId });
}

module.exports = {
  completeShift,
  completeShiftDryRun,
  getActiveJobContract,
  getAvailableShifts,
  previewShift,
};
