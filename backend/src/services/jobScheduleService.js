const JobContract = require("../models/JobContract");

function validationError(message, details = {}) {
  const error = new Error(message);
  error.statusCode = 400;
  error.details = details;
  return error;
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  return (Number(hours) || 0) * 60 + (Number(minutes) || 0);
}

function toPlain(value) {
  if (!value) return value;
  if (typeof value.toObject === "function") return value.toObject();
  return value;
}

function ensureFlags(contract) {
  if (!contract.flags || typeof contract.flags !== "object") contract.flags = {};
  if (!contract.flags.shiftSchedule || typeof contract.flags.shiftSchedule !== "object") {
    contract.flags.shiftSchedule = {};
  }
  if (!contract.flags.attendance || typeof contract.flags.attendance !== "object") {
    contract.flags.attendance = {};
  }
  if (!Array.isArray(contract.flags.statusHistory)) {
    contract.flags.statusHistory = [];
  }
  return contract.flags;
}

function getShiftScheduleOverride(contract, shiftId) {
  const flags = toPlain(contract)?.flags || {};
  return {
    ...(flags.shiftSchedule?.[shiftId] || {}),
    ...(flags.shiftOverrides?.[shiftId] || {}),
  };
}

function getEffectiveShiftSchedule(contract, shift) {
  const plainShift = toPlain(shift) || {};
  const override = getShiftScheduleOverride(contract, plainShift.shiftId);
  return {
    status: override.status || plainShift.status || "active",
    activeFromDay: override.activeFromDay ?? plainShift.activeFromDay ?? toPlain(contract)?.startDay ?? null,
    activeUntilDay: override.activeUntilDay ?? plainShift.activeUntilDay ?? null,
    inactiveFromDay: override.inactiveFromDay ?? plainShift.inactiveFromDay ?? null,
    inactiveReason: override.inactiveReason || override.reason || plainShift.inactiveReason || "",
    reason: override.reason || override.inactiveReason || plainShift.inactiveReason || "",
    decidedDay: override.decidedDay ?? null,
    decidedTime: override.decidedTime || "",
    employerNpcId: override.employerNpcId || toPlain(contract)?.employerNpcId || "",
    source: override.source || "",
    scheduleNotes: override.scheduleNotes || plainShift.scheduleNotes || [],
    lateGraceMinutes: override.lateGraceMinutes ?? plainShift.lateGraceMinutes ?? 0,
    absenceConsequences: override.absenceConsequences || plainShift.absenceConsequences || [],
  };
}

function getShiftScheduleStatus(contract, shift, currentDay) {
  const day = Number(currentDay) || 1;
  const schedule = getEffectiveShiftSchedule(contract, shift);

  if ((toPlain(contract)?.status || "active") !== "active") {
    return {
      active: false,
      status: "contract_not_active",
      reason: "El contrato laboral no esta activo.",
      schedule,
    };
  }

  if (["inactive", "ended"].includes(schedule.status)) {
    return {
      active: false,
      status: schedule.status === "ended" ? "ended" : "inactive",
      reason: schedule.reason || "El turno esta inactivo en este contrato.",
      schedule,
    };
  }

  if (schedule.activeFromDay && day < Number(schedule.activeFromDay)) {
    return {
      active: false,
      status: "not_started",
      reason: `El turno se activa desde el Dia ${schedule.activeFromDay}.`,
      schedule,
    };
  }

  if (schedule.activeUntilDay && day > Number(schedule.activeUntilDay)) {
    return {
      active: false,
      status: "ended_by_day",
      reason: schedule.reason || `El turno termino formalmente el Dia ${schedule.activeUntilDay}.`,
      schedule,
    };
  }

  if (schedule.inactiveFromDay && day >= Number(schedule.inactiveFromDay)) {
    return {
      active: false,
      status: "inactive_from_day",
      reason: schedule.reason || `El turno dejo de estar activo desde el Dia ${schedule.inactiveFromDay}.`,
      schedule,
    };
  }

  return {
    active: true,
    status: "active",
    reason: "Turno activo para este dia.",
    schedule,
  };
}

function getShiftAvailability(shift, gameState, contract = null) {
  const scheduleStatus = contract
    ? getShiftScheduleStatus(contract, shift, gameState.currentDay)
    : { active: true, status: "active", reason: "Turno activo.", schedule: getEffectiveShiftSchedule({}, shift) };

  if (!scheduleStatus.active) {
    return {
      canStart: false,
      status: scheduleStatus.status,
      reason: scheduleStatus.reason,
      scheduleStatus,
    };
  }

  const currentMinutes = timeToMinutes(gameState.time);
  const startMinutes = timeToMinutes(shift.startTime);
  const endMinutes = timeToMinutes(shift.endTime);

  if (currentMinutes >= endMinutes) {
    return {
      canStart: false,
      status: "past",
      reason: "El turno ya termino para la hora actual.",
      scheduleStatus,
    };
  }

  if (currentMinutes > startMinutes && currentMinutes < endMinutes) {
    return {
      canStart: false,
      status: "in_progress_window",
      reason: "El turno ya empezo; requiere regla explicita para entrada tarde.",
      scheduleStatus,
    };
  }

  return {
    canStart: true,
    status: currentMinutes === startMinutes ? "now" : "upcoming",
    reason: "Turno disponible para preview o completar con validacion de contrato.",
    scheduleStatus,
  };
}

function summarizeContractSchedule(contract, gameState = null) {
  if (!contract) return null;
  const day = Number(gameState?.currentDay || 1);
  const shifts = (toPlain(contract).shifts || []).map((shift) => {
    const scheduleStatus = getShiftScheduleStatus(contract, shift, day);
    return {
      shiftId: shift.shiftId,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      active: scheduleStatus.active,
      status: scheduleStatus.status,
      reason: scheduleStatus.reason,
      activeFromDay: scheduleStatus.schedule.activeFromDay,
      activeUntilDay: scheduleStatus.schedule.activeUntilDay,
      inactiveFromDay: scheduleStatus.schedule.inactiveFromDay,
      inactiveReason: scheduleStatus.schedule.inactiveReason || scheduleStatus.schedule.reason || "",
    };
  });

  const activeShifts = shifts.filter((shift) => shift.active);
  const inactiveShifts = shifts.filter((shift) => !shift.active);
  const currentMinutes = gameState ? timeToMinutes(gameState.time) : 0;
  const nextShift =
    activeShifts
      .filter((shift) => !gameState || timeToMinutes(shift.endTime) > currentMinutes)
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))[0] || null;

  return {
    currentDay: day,
    activeShiftIds: activeShifts.map((shift) => shift.shiftId),
    inactiveShiftIds: inactiveShifts.map((shift) => shift.shiftId),
    shifts,
    nextShift,
    futureChanges: shifts.filter((shift) => shift.inactiveFromDay && shift.inactiveFromDay > day),
  };
}

function buildScheduleOverride(patch) {
  return {
    status: patch.status || "active",
    activeFromDay: patch.activeFromDay ?? null,
    activeUntilDay: patch.activeUntilDay ?? null,
    inactiveFromDay: patch.inactiveFromDay ?? null,
    inactiveReason: patch.inactiveReason || patch.reason || "",
    reason: patch.reason || patch.inactiveReason || "",
    decidedDay: patch.decidedDay ?? null,
    decidedTime: patch.decidedTime || "",
    employerNpcId: patch.employerNpcId || "",
    source: patch.source || "applyTurn.jobContractPatch",
    scheduleNotes: patch.scheduleNotes || [],
    lateGraceMinutes: patch.lateGraceMinutes ?? undefined,
    absenceConsequences: patch.absenceConsequences || [],
  };
}

function dayKey(day) {
  return `day_${Number(day) || 1}`;
}

function ensureAttendanceLedger(flags, day) {
  const key = dayKey(day);
  if (!flags.attendance[key] || typeof flags.attendance[key] !== "object") {
    flags.attendance[key] = {};
  }
  return flags.attendance[key];
}

function toShiftPayload(shift = {}) {
  if (!shift.shiftId || !shift.name || !shift.startTime || !shift.endTime || !shift.expectedMinutes) {
    throw validationError("jobContractPatch.shifts requiere shiftId, name, startTime, endTime y expectedMinutes.");
  }

  return {
    shiftId: shift.shiftId,
    name: shift.name,
    startTime: shift.startTime,
    endTime: shift.endTime,
    activityCategory: shift.activityCategory || "trabajo_normal",
    expectedMinutes: shift.expectedMinutes,
    payCopper: shift.payCopper || 0,
    status: shift.status || "active",
    activeFromDay: shift.activeFromDay,
    activeUntilDay: shift.activeUntilDay,
    inactiveFromDay: shift.inactiveFromDay,
    inactiveReason: shift.inactiveReason || "",
    lateGraceMinutes: shift.lateGraceMinutes || 0,
    absenceConsequences: shift.absenceConsequences || [],
    scheduleNotes: shift.scheduleNotes || [],
    includedMealIds: shift.includedMealIds || [],
    typicalTasks: shift.typicalTasks || [],
    rules: shift.rules || [],
  };
}

function toMealPayload(meal = {}) {
  if (!meal.mealId || !meal.name) {
    throw validationError("jobContractPatch.mealBenefits requiere mealId y name.");
  }

  return {
    mealId: meal.mealId,
    name: meal.name,
    satietyBonus: meal.satietyBonus || 0,
    energyBonus: meal.energyBonus || 0,
    notes: meal.notes || "",
  };
}

async function createJobContractFromPatch(gameState, patch, session = null) {
  const characterId = patch.characterId || gameState.characterId || "char_lucas";
  const required = ["contractId", "jobId", "title", "employerNpcId", "locationId", "reason"];
  for (const field of required) {
    if (!patch[field] || !String(patch[field]).trim()) {
      throw validationError(`jobContractPatch.${field} es obligatorio para create_contract.`);
    }
  }

  const existing = await JobContract.findOne({ contractId: patch.contractId, characterId }).session(session);
  if (existing) {
    if (!patch.allowExisting) {
      throw validationError("El contrato laboral ya existe; usar allowExisting=true si se busca idempotencia.", {
        contractId: patch.contractId,
      });
    }

    return {
      op: "create_contract",
      contractId: existing.contractId,
      characterId,
      alreadyExists: true,
      status: existing.status,
      reason: patch.reason,
    };
  }

  const contract = await JobContract.create(
    [
      {
        contractId: patch.contractId,
        characterId,
        jobId: patch.jobId,
        title: patch.title,
        employerNpcId: patch.employerNpcId,
        locationId: patch.locationId,
        factionId: patch.factionId || "",
        status: patch.status || "active",
        startDay: patch.startDay || gameState.currentDay,
        pay: {
          dailyCopper: patch.pay?.dailyCopper || 0,
          notes: patch.pay?.notes || "",
        },
        includesMeals: Boolean(patch.includesMeals),
        mealBenefits: (patch.mealBenefits || []).map(toMealPayload),
        shifts: (patch.shifts || []).map(toShiftPayload),
        typicalTasks: patch.typicalTasks || [],
        absenceRules: patch.absenceRules || [],
        source: patch.source || "applyTurn.jobContractPatch",
        tags: patch.tags || [],
        flags: {
          createdByPatch: true,
          createdDay: gameState.currentDay,
          createdTime: gameState.time,
          creationReason: patch.reason,
          statusHistory: [
            {
              status: patch.status || "active",
              day: gameState.currentDay,
              time: gameState.time,
              reason: patch.reason,
            },
          ],
        },
      },
    ],
    { session }
  );

  return {
    op: "create_contract",
    contractId: contract[0].contractId,
    characterId,
    title: contract[0].title,
    status: contract[0].status,
    startDay: contract[0].startDay,
    shiftIds: (contract[0].shifts || []).map((shift) => shift.shiftId),
    reason: patch.reason,
    displayLines: [
      `Contrato laboral creado: ${contract[0].title}.`,
      `Inicio: Dia ${contract[0].startDay}.`,
    ],
  };
}

async function updateContractStatus(gameState, patch, session = null) {
  if (!patch.contractId) throw validationError("jobContractPatch.contractId es obligatorio.");
  if (!["active", "paused", "ended"].includes(patch.status)) {
    throw validationError("jobContractPatch.status debe ser active, paused o ended para update_contract_status.");
  }
  if (!patch.reason || !String(patch.reason).trim()) {
    throw validationError("jobContractPatch.reason es obligatorio.");
  }

  const contract = await JobContract.findOne({
    contractId: patch.contractId,
    characterId: patch.characterId || gameState.characterId || "char_lucas",
  }).session(session);
  if (!contract) throw validationError(`No existe contrato laboral: ${patch.contractId}`);

  const before = contract.status;
  const flags = ensureFlags(contract);
  contract.status = patch.status;
  flags.statusHistory.push({
    status: patch.status,
    before,
    day: gameState.currentDay,
    time: gameState.time,
    reason: patch.reason,
  });
  contract.markModified("flags");
  await contract.save({ session });

  return {
    op: "update_contract_status",
    contractId: contract.contractId,
    before,
    after: contract.status,
    reason: patch.reason,
    displayLines: [`Contrato ${contract.title}: ${before}->${contract.status}.`],
  };
}

async function recordShiftAttendance(gameState, patch, session = null) {
  const op = patch.op;
  if (!patch.contractId) throw validationError("jobContractPatch.contractId es obligatorio.");
  if (!patch.shiftId) throw validationError("jobContractPatch.shiftId es obligatorio.");
  if (!patch.reason || !String(patch.reason).trim()) {
    throw validationError("jobContractPatch.reason es obligatorio.");
  }

  const contract = await JobContract.findOne({
    contractId: patch.contractId,
    characterId: patch.characterId || gameState.characterId || "char_lucas",
  }).session(session);
  if (!contract) throw validationError(`No existe contrato laboral: ${patch.contractId}`);
  const shift = (contract.shifts || []).find((entry) => entry.shiftId === patch.shiftId);
  if (!shift) throw validationError(`No existe turno laboral con id: ${patch.shiftId}`);

  const flags = ensureFlags(contract);
  const attendance = ensureAttendanceLedger(flags, patch.day || gameState.currentDay);
  const status = op === "record_shift_late" ? "late" : "absent";
  attendance[patch.shiftId] = {
    shiftId: patch.shiftId,
    status,
    day: patch.day || gameState.currentDay,
    time: patch.time || gameState.time,
    minutesLate: op === "record_shift_late" ? Math.max(0, Number(patch.minutesLate) || 0) : 0,
    excused: Boolean(patch.excused),
    consequenceApplied: Boolean(patch.consequenceApplied),
    consequenceSummary: patch.consequenceSummary || "",
    reason: patch.reason,
  };
  contract.markModified("flags");
  await contract.save({ session });

  return {
    op,
    contractId: contract.contractId,
    shiftId: patch.shiftId,
    attendance: attendance[patch.shiftId],
    reason: patch.reason,
    displayLines: [
      status === "late"
        ? `Asistencia laboral: llegada tarde registrada para ${shift.name}.`
        : `Asistencia laboral: ausencia registrada para ${shift.name}.`,
    ],
  };
}

async function applyJobContractPatches(gameState, patches, session = null) {
  if (patches === undefined || patches === null) return [];
  const patchList = Array.isArray(patches) ? patches : [patches];
  const results = [];

  for (const patch of patchList) {
    const op = patch.op || "update_shift_schedule";
    if (op === "create_contract") {
      results.push(await createJobContractFromPatch(gameState, patch, session));
      continue;
    }
    if (op === "update_contract_status") {
      results.push(await updateContractStatus(gameState, patch, session));
      continue;
    }
    if (op === "record_shift_absence" || op === "record_shift_late") {
      results.push(await recordShiftAttendance(gameState, patch, session));
      continue;
    }
    if (op !== "update_shift_schedule") {
      throw validationError("jobContractPatch.op no soportado.", { op });
    }
    if (!patch.contractId) throw validationError("jobContractPatch.contractId es obligatorio.");
    if (!patch.shiftId) throw validationError("jobContractPatch.shiftId es obligatorio.");
    if (!patch.reason || !String(patch.reason).trim()) {
      throw validationError("jobContractPatch.reason es obligatorio.");
    }

    const contract = await JobContract.findOne({
      contractId: patch.contractId,
      characterId: gameState.characterId || "char_lucas",
    }).session(session);
    if (!contract) throw validationError(`No existe contrato laboral: ${patch.contractId}`);

    const shift = (contract.shifts || []).find((entry) => entry.shiftId === patch.shiftId);
    if (!shift) throw validationError(`No existe turno laboral con id: ${patch.shiftId}`);

    const before = getShiftScheduleStatus(contract, shift, gameState.currentDay);
    const flags = ensureFlags(contract);
    flags.shiftSchedule[patch.shiftId] = {
      ...buildScheduleOverride({
        decidedDay: gameState.currentDay,
        decidedTime: gameState.time,
        employerNpcId: contract.employerNpcId,
        ...patch,
      }),
      updatedAt: new Date(),
    };
    contract.markModified("flags");
    await contract.save({ session });

    const after = getShiftScheduleStatus(contract, shift, gameState.currentDay);
    results.push({
      op,
      contractId: contract.contractId,
      shiftId: shift.shiftId,
      name: shift.name,
      before,
      after,
      override: flags.shiftSchedule[patch.shiftId],
      reason: patch.reason,
    });
  }

  return results;
}

module.exports = {
  applyJobContractPatches,
  getEffectiveShiftSchedule,
  getShiftAvailability,
  getShiftScheduleStatus,
  summarizeContractSchedule,
};
