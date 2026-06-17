const { describe, it } = require("node:test");

const { assert } = require("./apiTestClient");
const {
  parseTurnClauses,
  targetTimeFromRelativeText,
} = require("../services/turnClauseParserService");

describe("turn clause parser", () => {
  it("splits and classifies compound work plus safe mana practice", () => {
    const plan = parseTurnClauses(
      "Lucas trabaja el resto del turno y despues practica respiracion de mana."
    );

    assert.equal(plan.isCompound, true);
    assert.equal(plan.hasWorkCompletion, true);
    assert.equal(plan.hasSafeMagicPractice, true);
    assert.deepEqual(
      plan.clauses.map((clause) => clause.operationClasses[0]),
      ["work_completion", "safe_magic_practice"]
    );
  });

  it("classifies inn help until afternoon as timed work", () => {
    const plan = parseTurnClauses("Lucas se queda hasta la tarde ayudando en la posada.");

    assert.equal(plan.hasWorkSegment, true);
    assert.equal(plan.clauses[0].targetTime, "14:00");
    assert.ok(plan.domains.includes("work"));
    assert.ok(plan.domains.includes("time_activity"));
  });

  it("maps broad relative time words to canonical target times", () => {
    assert.equal(targetTimeFromRelativeText("espera hasta la tarde"), "14:00");
    assert.equal(targetTimeFromRelativeText("duerme hasta la manana"), "07:00");
    assert.equal(targetTimeFromRelativeText("descansa hasta la noche"), "20:00");
  });

  it("splits finally-linked timed clauses in order", () => {
    const plan = parseTurnClauses(
      "Lucas practica meditacion 30 minutos, despues mira su cuarto 10 minutos y finalmente se queda dormido 3 horas."
    );

    assert.equal(plan.clauseCount, 3);
    assert.equal(plan.isCompound, true);
    assert.deepEqual(
      plan.clauses.map((clause) => clause.text),
      [
        "lucas practica meditacion 30 minutos",
        "mira su cuarto 10 minutos",
        "se queda dormido 3 horas.",
      ]
    );
  });
});
