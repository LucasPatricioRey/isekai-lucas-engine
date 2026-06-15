const JobContract = require("../models/JobContract");

const CONSEQUENCE_LEVELS = ["none", "minor", "moderate", "major", "critical"];

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
  if (!contract.flags.workLedger || typeof contract.flags.workLedger !== "object") {
    contract.flags.workLedger = {};
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

function normalizeConsequenceLevel(value) {
  return CONSEQUENCE_LEVELS.includes(value) ? value : "";
}

function inferAttendanceConsequenceLevel({ status, minutesLate = 0, excused = false, schedule = {} }) {
  if (status === "absent") {
    return excused ? "minor" : "moderate";
  }

  const graceMinutes = Number(schedule.lateGraceMinutes) || 0;
  const lateBeyondGrace = Math.max(0, Number(minutesLate) - graceMinutes);
  if (lateBeyondGrace <= 0) return "none";

  if (excused) {
    if (lateBeyondGrace <= 15) return "none";
    if (lateBeyondGrace <= 60) return "minor";
    return "moderate";
  }

  if (lateBeyondGrace <= 15) return "minor";
  if (lateBeyondGrace <= 60) return "moderate";
  return "major";
}

function relationshipDeltasForAttendance(level) {
  if (level === "minor") {
    return { trustDelta: -1, respectDelta: -1 };
  }
  if (level === "moderate") {
    return { trustDelta: -2, respectDelta: -2, socialDebtDelta: -1 };
  }
  if (level === "major") {
    return { trustDelta: -3, respectDelta: -3, socialDebtDelta: -2, suspicionDelta: 1 };
  }
  if (level === "critical") {
    return { trustDelta: -3, respectDelta: -3, socialDebtDelta: -3, suspicionDelta: 2 };
  }
  return {};
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value || {}).filter(([, entryValue]) => entryValue !== undefined && entryValue !== null && entryValue !== "")
  );
}

function buildAttendanceConsequencePlan({ contract, shift, patch, status, minutesLate, excused }) {
  const schedule = getEffectiveShiftSchedule(contract, shift);
  const level =
    normalizeConsequenceLevel(patch.consequenceLevel) ||
    inferAttendanceConsequenceLevel({ status, minutesLate, excused, schedule });
  const consequenceApplied = Boolean(patch.consequenceApplied);
  const requiresFollowUp = level !== "none" && !consequenceApplied;
  const actionType = status === "late" ? "job_late" : "job_absence";
  const summary =
    patch.consequenceSummary ||
    (level === "none"
      ? "Sin consecuencia laboral pendiente."
      : status === "late"
        ? `Llegada tarde registrada para ${shift.name}.`
        : `Ausencia registrada para ${shift.name}.`);
  const employerNpcId = schedule.employerNpcId || toPlain(contract)?.employerNpcId || "";
  const deltas = relationshipDeltasForAttendance(level);
  const suggestedRelationshipPatch =
    requiresFollowUp && employerNpcId
      ? compactObject({
          npcId: employerNpcId,
          ...deltas,
          reason:
            status === "late"
              ? `Consecuencia laboral por llegada tarde a ${shift.name}: ${patch.reason}`
              : `Consecuencia laboral por ausencia en ${shift.name}: ${patch.reason}`,
          notes: summary,
          actionType,
        })
      : null;

  return {
    level,
    requiresFollowUp,
    consequenceApplied,
    summary,
    recommendedAction: requiresFollowUp
      ? "Cerrar el seguimiento con npcRelationshipPatches, commitmentPatches o una decision narrativa explicita."
      : "",
    suggestedRelationshipPatch,
    sourceCommitmentId: patch.sourceCommitmentId || "",
    followUpCommitmentId: patch.followUpCommitmentId || "",
    displayLines: [
      level === "none"
        ? "Asistencia laboral: sin consecuencia pendiente."
        : `Consecuencia laboral pendiente (${level}): ${summary}`,
    ],
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
  const attendanceEntries = summarizeAttendanceEntries(contract);
  const workEntries = summarizeWorkLedgerEntries(contract);
  const todayAttendance = attendanceEntries.filter((entry) => entry.day === day);
  const todayWork = workEntries.filter((entry) => entry.day === day);
  const attendanceByShiftToday = new Map(todayAttendance.map((entry) => [entry.shiftId, entry]));
  const workByShiftToday = new Map(todayWork.map((entry) => [entry.shiftId, entry]));
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
      attendanceToday: attendanceByShiftToday.get(shift.shiftId) || null,
      workToday: workByShiftToday.get(shift.shiftId) || null,
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
    attendance: {
      today: todayAttendance,
      recent: attendanceEntries.slice(0, 6),
      unresolved: attendanceEntries.filter((entry) => entry.requiresFollowUp && !entry.consequenceApplied),
    },
    workLedger: {
      today: todayWork,
      recent: workEntries.slice(0, 6),
    },
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

function ensureWorkLedger(flags, day) {
  const key = dayKey(day);
  if (!flags.workLedger[key] || typeof flags.workLedger[key] !== "object") {
    flags.workLedger[key] = {};
  }
  return flags.workLedger[key];
}

function summarizeWorkLedgerEntries(contract) {
  const plainContract = toPlain(contract) || {};
  const flags = plainContract.flags || {};
  const workLedger = flags.workLedger || {};
  const shiftById = new Map((plainContract.shifts || []).map((shift) => [shift.shiftId, shift]));
  const entries = [];

  for (const [rawDayKey, dayEntries] of Object.entries(workLedger)) {
    if (!dayEntries || typeof dayEntries !== "object") continue;
    const ledgerDay = Number(String(rawDayKey).replace(/^day_/, "")) || null;

    for (const [shiftId, entry] of Object.entries(dayEntries)) {
      if (!entry || typeof entry !== "object") continue;
      const shift = shiftById.get(entry.shiftId || shiftId) || {};
      entries.push({
        shiftId: entry.shiftId || shiftId,
        shiftName: shift.name || entry.shiftName || entry.shiftId || shiftId,
        day: Number(entry.day || ledgerDay || 1),
        totalMinutes: Number(entry.totalMinutes) || 0,
        category: entry.category || shift.activityCategory || "trabajo_normal",
        intensity: entry.intensity || "normal",
        segmentCount: Array.isArray(entry.segments) ? entry.segments.length : 0,
        lastStartTime: entry.lastStartTime || "",
        lastEndTime: entry.lastEndTime || "",
        reason: entry.reason || "",
      });
    }
  }

  return entries.sort((a, b) => {
    const dayDiff = b.day - a.day;
    if (dayDiff !== 0) return dayDiff;
    return timeToMinutes(b.lastEndTime) - timeToMinutes(a.lastEndTime);
  });
}

function summarizeAttendanceEntries(contract) {
  const plainContract = toPlain(contract) || {};
  const flags = plainContract.flags || {};
  const attendanceLedger = flags.attendance || {};
  const shiftById = new Map((plainContract.shifts || []).map((shift) => [shift.shiftId, shift]));
  const entries = [];

  for (const [rawDayKey, dayEntries] of Object.entries(attendanceLedger)) {
    if (!dayEntries || typeof dayEntries !== "object") continue;
    const ledgerDay = Number(String(rawDayKey).replace(/^day_/, "")) || null;

    for (const [shiftId, entry] of Object.entries(dayEntries)) {
      if (!entry || typeof entry !== "object") continue;
      const shift = shiftById.get(entry.shiftId || shiftId) || {};
      entries.push({
        shiftId: entry.shiftId || shiftId,
        shiftName: shift.name || entry.shiftName || entry.shiftId || shiftId,
        status: entry.status || "",
        day: Number(entry.day || ledgerDay || 1),
        time: entry.time || "",
        minutesLate: Number(entry.minutesLate) || 0,
        excused: Boolean(entry.excused),
        consequenceLevel: entry.consequenceLevel || "none",
        requiresFollowUp: Boolean(entry.requiresFollowUp),
        consequenceApplied: Boolean(entry.consequenceApplied),
        consequenceSummary: entry.consequenceSummary || "",
        recommendedAction: entry.recommendedAction || "",
        suggestedRelationshipPatch: entry.suggestedRelationshipPatch || null,
        sourceCommitmentId: entry.sourceCommitmentId || "",
        followUpCommitmentId: entry.followUpCommitmentId || "",
        reason: entry.reason || "",
      });
    }
  }

  return entries.sort((a, b) => {
    const dayDiff = b.day - a.day;
    if (dayDiff !== 0) return dayDiff;
    return timeToMinutes(b.time) - timeToMinutes(a.time);
  });
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
  const minutesLate = op === "record_shift_late" ? Math.max(0, Number(patch.minutesLate) || 0) : 0;
  const excused = Boolean(patch.excused);
  const consequencePlan = buildAttendanceConsequencePlan({
    contract,
    shift,
    patch,
    status,
    minutesLate,
    excused,
  });
  attendance[patch.shiftId] = {
    shiftId: patch.shiftId,
    shiftName: shift.name,
    status,
    day: patch.day || gameState.currentDay,
    time: patch.time || gameState.time,
    minutesLate,
    excused,
    consequenceLevel: consequencePlan.level,
    requiresFollowUp: consequencePlan.requiresFollowUp,
    consequenceApplied: consequencePlan.consequenceApplied,
    consequenceSummary: consequencePlan.summary,
    recommendedAction: consequencePlan.recommendedAction,
    suggestedRelationshipPatch: consequencePlan.suggestedRelationshipPatch,
    sourceCommitmentId: consequencePlan.sourceCommitmentId,
    followUpCommitmentId: consequencePlan.followUpCommitmentId,
    reason: patch.reason,
  };
  contract.markModified("flags");
  await contract.save({ session });

  return {
    op,
    contractId: contract.contractId,
    shiftId: patch.shiftId,
    attendance: attendance[patch.shiftId],
    consequencePlan,
    reason: patch.reason,
    displayLines: [
      status === "late"
        ? `Asistencia laboral: llegada tarde registrada para ${shift.name}.`
        : `Asistencia laboral: ausencia registrada para ${shift.name}.`,
      ...consequencePlan.displayLines,
    ],
  };
}

async function recordWorkSegment(gameState, patch, session = null) {
  if (!patch.contractId) throw validationError("jobContractPatch.contractId es obligatorio.");
  if (!patch.shiftId) throw validationError("jobContractPatch.shiftId es obligatorio.");
  if (!patch.reason || !String(patch.reason).trim()) {
    throw validationError("jobContractPatch.reason es obligatorio.");
  }
  if (!Number.isInteger(patch.minutes) || patch.minutes <= 0) {
    throw validationError("jobContractPatch.minutes debe ser entero mayor a cero para record_work_segment.");
  }

  const contract = await JobContract.findOne({
    contractId: patch.contractId,
    characterId: patch.characterId || gameState.characterId || "char_lucas",
  }).session(session);
  if (!contract) throw validationError(`No existe contrato laboral: ${patch.contractId}`);
  const shift = (contract.shifts || []).find((entry) => entry.shiftId === patch.shiftId);
  if (!shift) throw validationError(`No existe turno laboral con id: ${patch.shiftId}`);

  const flags = ensureFlags(contract);
  const workLedger = ensureWorkLedger(flags, patch.day || gameState.currentDay);
  const existing = workLedger[patch.shiftId] || {
    shiftId: patch.shiftId,
    shiftName: shift.name,
    day: patch.day || gameState.currentDay,
    totalMinutes: 0,
    category: patch.category || shift.activityCategory || "trabajo_normal",
    intensity: patch.intensity || "normal",
    segments: [],
  };
  const segment = {
    startTime: patch.startTime || "",
    endTime: patch.endTime || "",
    minutes: patch.minutes,
    category: patch.category || shift.activityCategory || "trabajo_normal",
    intensity: patch.intensity || "normal",
    sourceEventLogId: patch.sourceEventLogId || "",
    reason: patch.reason,
    createdAt: new Date(),
  };

  existing.shiftName = shift.name;
  existing.day = patch.day || gameState.currentDay;
  existing.totalMinutes = Math.max(0, Number(existing.totalMinutes) || 0) + patch.minutes;
  existing.category = segment.category;
  existing.intensity = segment.intensity;
  existing.lastStartTime = segment.startTime;
  existing.lastEndTime = segment.endTime;
  existing.reason = patch.reason;
  existing.segments = Array.isArray(existing.segments) ? existing.segments : [];
  existing.segments.push(segment);
  workLedger[patch.shiftId] = existing;

  contract.markModified("flags");
  await contract.save({ session });

  return {
    op: "record_work_segment",
    contractId: contract.contractId,
    shiftId: patch.shiftId,
    work: {
      shiftId: patch.shiftId,
      shiftName: shift.name,
      day: existing.day,
      totalMinutes: existing.totalMinutes,
      segment,
    },
    reason: patch.reason,
    displayLines: [`Trabajo parcial: ${patch.minutes} min registrados para ${shift.name}.`],
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
    if (op === "record_work_segment") {
      results.push(await recordWorkSegment(gameState, patch, session));
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
  buildAttendanceConsequencePlan,
  getEffectiveShiftSchedule,
  getShiftAvailability,
  getShiftScheduleStatus,
  summarizeContractSchedule,
  summarizeAttendanceEntries,
  summarizeWorkLedgerEntries,
};
