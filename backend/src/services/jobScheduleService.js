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

async function applyJobContractPatches(gameState, patches, session = null) {
  if (patches === undefined || patches === null) return [];
  const patchList = Array.isArray(patches) ? patches : [patches];
  const results = [];

  for (const patch of patchList) {
    const op = patch.op || "update_shift_schedule";
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
