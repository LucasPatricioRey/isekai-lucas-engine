const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildAttendanceConsequencePlan,
  summarizeContractSchedule,
} = require("../services/jobScheduleService");

function testContract() {
  return {
    contractId: "contract_test_market",
    employerNpcId: "npc_irma",
    status: "active",
    startDay: 1,
    shifts: [
      {
        shiftId: "shift_test_market_0800_1000",
        name: "Turno temporal de mercado",
        startTime: "08:00",
        endTime: "10:00",
        expectedMinutes: 120,
        lateGraceMinutes: 10,
      },
    ],
    flags: {},
  };
}

test("infers labor attendance consequences without applying social changes", () => {
  const contract = testContract();
  const shift = contract.shifts[0];

  const excusedLate = buildAttendanceConsequencePlan({
    contract,
    shift,
    patch: { reason: "Lucas aviso y llego apenas tarde." },
    status: "late",
    minutesLate: 12,
    excused: true,
  });

  assert.equal(excusedLate.level, "none");
  assert.equal(excusedLate.requiresFollowUp, false);
  assert.equal(excusedLate.suggestedRelationshipPatch, null);

  const unexcusedAbsence = buildAttendanceConsequencePlan({
    contract,
    shift,
    patch: {
      reason: "Lucas falto sin avisar.",
      sourceCommitmentId: "commitment_test_market_shift",
    },
    status: "absent",
    minutesLate: 0,
    excused: false,
  });

  assert.equal(unexcusedAbsence.level, "moderate");
  assert.equal(unexcusedAbsence.requiresFollowUp, true);
  assert.equal(unexcusedAbsence.sourceCommitmentId, "commitment_test_market_shift");
  assert.deepEqual(unexcusedAbsence.suggestedRelationshipPatch, {
    npcId: "npc_irma",
    trustDelta: -2,
    respectDelta: -2,
    socialDebtDelta: -1,
    reason: "Consecuencia laboral por ausencia en Turno temporal de mercado: Lucas falto sin avisar.",
    notes: "Ausencia registrada para Turno temporal de mercado.",
    actionType: "job_absence",
  });
});

test("summarizes pending attendance follow-up in contract schedule", () => {
  const contract = {
    ...testContract(),
    flags: {
      attendance: {
        day_2: {
          shift_test_market_0800_1000: {
            shiftId: "shift_test_market_0800_1000",
            status: "absent",
            day: 2,
            time: "08:00",
            consequenceLevel: "moderate",
            requiresFollowUp: true,
            consequenceApplied: false,
            consequenceSummary: "Ausencia sin aviso.",
            reason: "Fixture de ausencia.",
          },
        },
      },
    },
  };

  const schedule = summarizeContractSchedule(contract, { currentDay: 2, time: "08:30" });

  assert.equal(schedule.attendance.today.length, 1);
  assert.equal(schedule.attendance.unresolved.length, 1);
  assert.equal(schedule.attendance.recent[0].shiftName, "Turno temporal de mercado");
  assert.equal(schedule.shifts[0].attendanceToday.consequenceLevel, "moderate");
});
