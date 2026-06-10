const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  applyRelationshipDeltas,
  evaluateSocialRelationshipState,
  socialAccessScore,
} = require("../services/socialRelationshipStateService");

describe("social relationship state evaluator", () => {
  it("unlocks private information and risky help only for stable high trust", () => {
    const state = evaluateSocialRelationshipState({
      trust: 78,
      familiarity: 45,
      respect: 62,
      affection: 20,
      suspicion: 5,
      fear: 0,
      jealousy: 0,
      socialDebt: 12,
    });

    assert.equal(state.schemaVersion, "social_state_v1");
    assert.equal(state.stance.key, "trusted");
    assert.equal(state.access.privateInfo, true);
    assert.equal(state.access.riskyHelp, true);
    assert.equal(state.access.debtFavorAvailable, true);
    assert.equal(state.access.romanceLocked, true);
    assert.ok(state.accessScore >= 70);
  });

  it("blocks closeness when suspicion or fear is high even with positive axes", () => {
    const state = evaluateSocialRelationshipState({
      trust: 72,
      familiarity: 50,
      respect: 60,
      affection: 20,
      suspicion: 74,
      fear: 10,
      jealousy: 0,
      socialDebt: 0,
    });

    assert.equal(state.stance.key, "closed_suspicious");
    assert.equal(state.access.privateInfo, false);
    assert.equal(state.access.riskyHelp, false);
    assert.equal(state.access.needsRepairBeforeCloseness, true);
    assert.ok(state.risks.some((risk) => risk.type === "high_suspicion"));
  });

  it("projects deltas without mutating the original relationship object", () => {
    const relationship = {
      trust: 24,
      familiarity: 9,
      respect: 10,
      suspicion: 0,
      fear: 0,
      socialDebt: 0,
    };

    const projected = applyRelationshipDeltas(relationship, {
      trust: 2,
      familiarity: 1,
      respect: 1,
      socialDebt: 1,
    });
    const state = evaluateSocialRelationshipState(projected);

    assert.equal(relationship.trust, 24);
    assert.equal(projected.trust, 26);
    assert.equal(projected.familiarity, 10);
    assert.equal(state.access.minorFavor, true);
    assert.ok(socialAccessScore(projected) > socialAccessScore(relationship));
  });
});
