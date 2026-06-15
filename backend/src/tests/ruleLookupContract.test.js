const assert = require("node:assert/strict");
const test = require("node:test");

const { buildRuleLookupContract } = require("../utils/responseShaping");

test("rule lookup contract exposes mandatory Mongo rule-card lookup before mutation", () => {
  const contract = buildRuleLookupContract({
    nearbyNpcs: [{ npcId: "npc_fern", name: "Fern" }],
    npcPresence: { visible: [{ npcId: "npc_fern", name: "Fern" }] },
    narrationContract: { npcContracts: [{ npcId: "npc_fern" }] },
    jobContract: { contractId: "job_grulla", includesMeals: true },
    activeMissions: [{ missionId: "mission_herbs", status: "accepted" }],
    carriedEvidence: [{ evidenceId: "evidence_gray_sample" }],
    pendingCommitments: [{ commitmentId: "commitment_ask_roberto" }],
    worldFriction: {
      economy: { hasPressure: true },
      travel: { hasPressure: true },
    },
    weather: { staleByCurrentTime: true },
    activeCombatEncounters: [{ encounterId: "combat_1" }],
    activeRumors: [{ rumorId: "rumor_1" }],
    guildState: { schemaVersion: "guild_state_v1" },
    pendingBiology: [{ accumulationId: "bio_1" }],
  });

  assert.equal(contract.schemaVersion, "rule_lookup_contract_v1");
  assert.equal(contract.contractStrength, "mandatory_before_preview_or_mutation");
  assert.match(contract.source, /WorldDocumentIndex/);
  assert.match(contract.policy, /before preview\/mutation/);
  assert.deepEqual(contract.alwaysReadRuleIds, [
    "authority.backend_state",
    "action.scene_flow",
    "format.response_hud_exact",
  ]);

  const activeRuleIds = new Set(contract.activeRuleLookups.map((entry) => entry.ruleId));
  for (const ruleId of [
    "format.dialogue_direct",
    "narration.dialogue_hud_boundary",
    "npc.knowledge_boundaries",
    "npc.scene_presence_agency",
    "social.relationship_logic",
    "missions.guild_rewards_registration",
    "events.evidence_progress",
    "inventory.evidence_boundary",
    "commitment.promises",
    "jobs.attendance_consequences",
    "job.contract_meals",
    "travel.world_friction_preview",
  ]) {
    assert.equal(activeRuleIds.has(ruleId), true, `${ruleId} should be active`);
  }

  assert.ok(
    contract.mustSearchBeforeMutationRuleIds.includes("authority.backend_state"),
    "core authority must be in the mutation lookup set"
  );
  assert.ok(
    contract.searchBatches.some((batch) => /\/api\/search\/docs\?ruleId=/.test(batch.path)),
    "contract should expose concrete searchDocs paths"
  );
  assert.ok(contract.preMutationOrder.includes("searchDocs matching ruleIds"));
});

test("rule lookup contract stays compact for calm scenes", () => {
  const contract = buildRuleLookupContract();

  assert.equal(contract.schemaVersion, "rule_lookup_contract_v1");
  assert.deepEqual(contract.activeRuleLookups, []);
  assert.deepEqual(contract.mustSearchBeforeMutationRuleIds, contract.alwaysReadRuleIds);
  assert.equal(contract.searchBatches.length, 1);
  assert.ok(Buffer.byteLength(JSON.stringify(contract), "utf8") < 1200);
});
