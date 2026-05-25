const GameState = require("../models/GameState");
const JobContract = require("../models/JobContract");
const { previewBiologicalClockBlock } = require("./biologicalClockService");

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return hours * 60 + minutes;
}

function findShift(contract, shiftId) {
  return (contract.shifts || []).find((shift) => shift.shiftId === shiftId);
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
    reason: "Turno disponible como preview; completarlo aun no muta estado en G8.",
  };
}

async function getActiveJobContract({ characterId = "char_lucas" } = {}) {
  const contract = await JobContract.findOne({ characterId, status: "active" }).lean();

  if (!contract) {
    const error = new Error(`No existe contrato laboral activo para characterId: ${characterId}`);
    error.statusCode = 404;
    throw error;
  }

  return contract;
}

async function getAvailableShifts({ gameId = "isekai_lucas_main", characterId = "char_lucas" } = {}) {
  const [gameState, contract] = await Promise.all([
    GameState.findOne({ gameId }).lean(),
    getActiveJobContract({ characterId }),
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

async function previewShift({ shiftId, gameId = "isekai_lucas_main", characterId = "char_lucas" } = {}) {
  const [gameState, contract] = await Promise.all([
    GameState.findOne({ gameId }).lean(),
    getActiveJobContract({ characterId }),
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

  const mealBenefits = (contract.mealBenefits || []).filter((meal) =>
    (shift.includedMealIds || []).includes(meal.mealId)
  );
  const directMealDelta = mealBenefits.reduce(
    (total, meal) => ({
      satiety: total.satiety + (meal.satietyBonus || 0),
      energy: total.energy + (meal.energyBonus || 0),
    }),
    { satiety: 0, energy: 0 }
  );

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
    mealBenefits,
    directMealDelta,
    biologicalPreview,
    mutation: {
      willMutateGameState: false,
      reason: "G8 solo expone preview/dryRun; completar turnos reales queda pendiente.",
    },
  };
}

async function completeShiftDryRun({ shiftId, gameId = "isekai_lucas_main", characterId = "char_lucas" } = {}) {
  return previewShift({ shiftId, gameId, characterId });
}

module.exports = {
  completeShiftDryRun,
  getActiveJobContract,
  getAvailableShifts,
  previewShift,
};
