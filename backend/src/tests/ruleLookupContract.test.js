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
  assert.equal(contract.contractStrength, "mandatory_for_final_response_and_blocking_before_mutation");
  assert.match(contract.source, /WorldDocumentIndex/);
  assert.match(contract.policy, /before final gameplay/);
  assert.deepEqual(contract.alwaysReadRuleIds, [
    "authority.backend_state",
    "context.bootloader_contract",
    "action.scene_flow",
    "format.response_hud_exact",
  ]);

  const activeRuleIds = new Set(contract.activeRuleLookups);
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
    contract.mustSearchBeforeFinalRuleIds.includes("context.bootloader_contract"),
    "bootloader card must be in the final response lookup set"
  );
  assert.ok(
    contract.searchBatches.some((batch) => /\/api\/search\/docs\?ruleId=/.test(batch.path)),
    "contract should expose concrete searchDocs paths"
  );
  assert.match(contract.preFinalResponseOrder, /searchDocs core\/active/);
  assert.match(contract.preMutationOrder, /searchDocs/);
});

test("rule lookup contract stays compact for calm scenes", () => {
  const contract = buildRuleLookupContract();

  assert.equal(contract.schemaVersion, "rule_lookup_contract_v1");
  assert.deepEqual(contract.activeRuleLookups, []);
  assert.deepEqual(contract.mustSearchBeforeMutationRuleIds, contract.alwaysReadRuleIds);
  assert.deepEqual(contract.mustSearchBeforeFinalRuleIds, contract.alwaysReadRuleIds);
  assert.equal(contract.searchBatches.length, 1);
  assert.ok(Buffer.byteLength(JSON.stringify(contract), "utf8") < 1700);
});
