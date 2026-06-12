const assert = require("node:assert/strict");
const test = require("node:test");

const {
  missionActionState,
  summarizeMission,
} = require("../utils/responseShaping");

test("summarizes mission action state for submitted, verified and rejected reports", () => {
  const baseMission = {
    missionId: "mission_test",
    title: "Informe de prueba",
    status: "accepted",
    rank: "Cobre",
    riskLevel: "low",
    reward: { moneyCopper: 100, items: [], other: "" },
    proofRequired: "Reporte formal.",
    postedDay: 1,
    postedTime: "06:00",
    expiresDay: 2,
    expiresTime: "18:00",
  };

  assert.equal(
    missionActionState({ ...baseMission, proofStatus: "submitted" }, 2, "12:00").key,
    "awaiting_verification"
  );
  assert.equal(
    missionActionState({ ...baseMission, proofStatus: "verified" }, 2, "12:00").key,
    "ready_to_complete"
  );
  assert.equal(
    missionActionState({ ...baseMission, proofStatus: "rejected" }, 2, "12:00").key,
    "proof_rejected"
  );
});

test("marks expiring available missions and accepted expired missions", () => {
  const available = summarizeMission(
    {
      missionId: "mission_expiring",
      title: "Revisar borde del bosque",
      status: "available",
      rank: "Cobre",
      riskLevel: "low",
      reward: { moneyCopper: 100, items: [], other: "" },
      proofStatus: "pending",
      postedDay: 2,
      postedTime: "06:00",
      expiresDay: 2,
      expiresTime: "14:30",
    },
    2,
    "12:00"
  );

  assert.equal(available.actionState.key, "available_expiring_soon");
  assert.equal(available.actionState.expiration.minutesUntil, 150);

  const acceptedExpired = summarizeMission(
    {
      missionId: "mission_late",
      title: "Reporte tardio",
      status: "accepted",
      rank: "Cobre",
      riskLevel: "low",
      reward: { moneyCopper: 100, items: [], other: "" },
      proofStatus: "pending",
      postedDay: 2,
      postedTime: "06:00",
      expiresDay: 2,
      expiresTime: "11:00",
    },
    2,
    "12:00"
  );

  assert.equal(acceptedExpired.actionState.key, "accepted_expired");
  assert.equal(acceptedExpired.actionState.requiresFormalClosure, true);
});
