const { after, before, describe, it } = require("node:test");

const CombatActionPreview = require("../models/CombatActionPreview");
const CombatEncounter = require("../models/CombatEncounter");
const CombatantState = require("../models/CombatantState");
const CombatLogEntry = require("../models/CombatLogEntry");
const Evidence = require("../models/Evidence");
const EventLog = require("../models/EventLog");
const Faction = require("../models/Faction");
const GameState = require("../models/GameState");
const InjuryRecord = require("../models/InjuryRecord");
const Mission = require("../models/Mission");
const Checkpoint = require("../models/Checkpoint");
const WorldEvent = require("../models/WorldEvent");
const {
  assert,
  get,
  post,
  startApi,
  stopApi,
} = require("./apiTestClient");

let tempGameId = "";
let tempEventId = "";
let tempMissionId = "";
let tempFactionId = "";
let tempInjuryId = "";

async function createTempGameState() {
  tempGameId = `test_combat_advanced_${Date.now()}`;
  const source = await GameState.findOne({ gameId: "isekai_lucas_main" }).lean();
  assert.ok(source, "live game state is required as fixture source");

  const clone = {
    ...source,
    gameId: tempGameId,
  };
  delete clone._id;

  await GameState.create(clone);
}

async function cleanupTempCombatState() {
  if (!tempGameId) return;

  const encounters = await CombatEncounter.find({ gameId: tempGameId }).select("encounterId").lean();
  const encounterIds = encounters.map((entry) => entry.encounterId);

  await Promise.all([
    CombatActionPreview.deleteMany({ gameId: tempGameId }),
    CombatantState.deleteMany({ gameId: tempGameId }),
    CombatLogEntry.deleteMany({ gameId: tempGameId }),
    CombatEncounter.deleteMany({ gameId: tempGameId }),
    Checkpoint.deleteMany({ gameId: tempGameId }),
    Evidence.deleteMany({ gameId: tempGameId }),
    InjuryRecord.deleteMany({ gameId: tempGameId }),
    WorldEvent.deleteMany({ gameId: tempGameId }),
    Mission.deleteMany({ missionId: { $in: [tempMissionId].filter(Boolean) } }),
    Faction.deleteMany({ factionId: { $in: [tempFactionId].filter(Boolean) } }),
    EventLog.deleteMany({
      $or: [
        { gameId: tempGameId },
        { "mechanicalChanges.encounterId": { $in: encounterIds } },
      ],
    }),
    GameState.deleteMany({ gameId: tempGameId }),
  ]);
}

describe("combat advanced API", () => {
  before(async () => {
    await startApi();
    await createTempGameState();
  });

  after(async () => {
    await cleanupTempCombatState();
    await stopApi();
  });

  it("exposes advanced actions and serves the combat OpenAPI document", async () => {
    const actions = await get("/api/combat/advanced/actions");
    assert.equal(actions.status, 200);
    assert.equal(actions.data.ok, true);
    assert.ok(actions.data.actions.some((action) => action.actionType === "attack"));
    assert.ok(actions.data.actions.some((action) => action.actionType === "flee"));

    const schema = await get("/docs/openapi-gpt-action-combat.json");
    assert.equal(schema.status, 200);
    assert.equal(schema.data["x-action-role"], "combat-advanced");
    assert.ok(schema.data.paths["/api/combat/advanced/encounters/start"]);
  });

  it("runs the C4 encounter lifecycle with backend resolution", async () => {
    const previewStart = await post("/api/combat/advanced/encounters/start/preview", {
      gameId: tempGameId,
      enemyId: "enemy_lobo_borde",
      reason: "Fixture C4: iniciar combate avanzado.",
      terrainTags: ["forest", "mud"],
    });

    assert.equal(previewStart.status, 200, JSON.stringify(previewStart.data));
    assert.equal(previewStart.data.ok, true);
    assert.equal(previewStart.data.preview.canStart, true);
    assert.equal(previewStart.data.preview.mutation.willCreateEncounter, true);

    const started = await post("/api/combat/advanced/encounters/start", {
      gameId: tempGameId,
      enemyId: "enemy_lobo_borde",
      reason: "Fixture C4: combate avanzado temporal.",
      terrainTags: ["forest", "mud"],
      visibility: "clear",
      noiseLevel: "quiet",
      surpriseState: "none",
    });

    assert.equal(started.status, 200, JSON.stringify(started.data));
    assert.equal(started.data.ok, true);
    assert.equal(started.data.encounter.status, "active");
    assert.equal(started.data.encounter.phase, "player_turn");
    assert.equal(started.data.encounter.participants.length, 2);
    assert.equal(started.data.combatants.length, 2);
    assert.equal(started.data.encounter.autoCheckpoint.created, true);

    const encounterId = started.data.encounter.encounterId;
    const combatantCount = await CombatantState.countDocuments({ gameId: tempGameId, encounterId });
    assert.equal(combatantCount, 2);

    const active = await get(`/api/combat/advanced/encounters/active?gameId=${encodeURIComponent(tempGameId)}`);
    assert.equal(active.status, 200);
    assert.equal(active.data.encounters.length, 1);
    assert.equal(active.data.encounters[0].encounterId, encounterId);

    const fetched = await get(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.data.encounter.combatants.length, 2);

    const availableActions = await get(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/actions`);
    assert.equal(availableActions.status, 200);
    assert.ok(availableActions.data.actions.some((action) => action.actionType === "attack" && action.canPreview));

    const previewAction = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/actions/preview`, {
      gameId: tempGameId,
      actionType: "attack",
    });

    assert.equal(previewAction.status, 200, JSON.stringify(previewAction.data));
    assert.equal(previewAction.data.ok, true);
    assert.equal(previewAction.data.preview.canAct, true);
    assert.match(previewAction.data.preview.preview.previewId, /^combat_preview_/);
    assert.equal(previewAction.data.preview.mutation.willResolveCombat, true);

    const previewId = previewAction.data.preview.preview.previewId;
    const pendingPreview = await CombatActionPreview.findOne({ previewId }).lean();
    assert.equal(pendingPreview.status, "pending");

    const applyResolved = await post("/api/combat/advanced/actions/apply", {
      gameId: tempGameId,
      previewId,
    });

    assert.equal(applyResolved.status, 200, JSON.stringify(applyResolved.data));
    assert.equal(applyResolved.data.ok, true);
    assert.equal(applyResolved.data.resolution.actionType, "attack");
    assert.ok(applyResolved.data.logEntry.logId);
    assert.equal(applyResolved.data.autoCheckpoint.created, true);

    const appliedPreview = await CombatActionPreview.findOne({ previewId }).lean();
    assert.equal(appliedPreview.status, "applied");

    const logCountAfterPlayer = await CombatLogEntry.countDocuments({ gameId: tempGameId, encounterId });
    assert.equal(logCountAfterPlayer, 1);

    const afterPlayer = await get(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}`);
    assert.equal(afterPlayer.status, 200);

    if (afterPlayer.data.encounter.status === "active") {
      assert.equal(afterPlayer.data.encounter.phase, "npc_turn");

      const npcTurn = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/npc-turn/resolve`, {
        gameId: tempGameId,
      });

      assert.equal(npcTurn.status, 200, JSON.stringify(npcTurn.data));
      assert.equal(npcTurn.data.ok, true);
      assert.ok(["attack", "flee"].includes(npcTurn.data.resolution.actionType));
      assert.ok(npcTurn.data.logEntry.logId);
    }

    const beforeEnd = await get(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}`);
    assert.equal(beforeEnd.status, 200);

    if (beforeEnd.data.encounter.status !== "active") {
      const activeAfterResolution = await get(`/api/combat/advanced/encounters/active?gameId=${encodeURIComponent(tempGameId)}`);
      assert.equal(activeAfterResolution.status, 200);
      assert.equal(activeAfterResolution.data.encounters.length, 0);
      return;
    }

    const previewEnd = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/end/preview`, {
      gameId: tempGameId,
      endStatus: "cancelled",
      reason: "Fixture C4: cierre seguro sin resolver combate.",
    });

    assert.equal(previewEnd.status, 200);
    assert.equal(previewEnd.data.preview.canEnd, true);

    const ended = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/end`, {
      gameId: tempGameId,
      endStatus: "cancelled",
      reason: "Fixture C4: cierre seguro sin resolver combate.",
    });

    assert.equal(ended.status, 200, JSON.stringify(ended.data));
    assert.equal(ended.data.ok, true);
    assert.equal(ended.data.encounter.status, "cancelled");
    assert.equal(ended.data.encounter.phase, "ending");
    assert.equal(ended.data.encounter.autoCheckpoint.created, true);

    const activeAfter = await get(`/api/combat/advanced/encounters/active?gameId=${encodeURIComponent(tempGameId)}`);
    assert.equal(activeAfter.status, 200);
    assert.equal(activeAfter.data.encounters.length, 0);
  });

  it("claims C5 post-combat evidence without creating inventory loot", async () => {
    const timestamp = Date.now();
    tempEventId = `event_combat_c5_${timestamp}`;
    tempMissionId = `mission_combat_c5_${timestamp}`;
    tempFactionId = `faction_combat_c5_${timestamp}`;

    await Faction.create({
      factionId: tempFactionId,
      name: "Fixture Guild C5",
      type: "guild",
      scope: "local",
    });

    await Mission.create({
      missionId: tempMissionId,
      title: "Fixture combat proof mission",
      description: "Mission fixture for combat evidence linkage.",
      sourceFactionId: tempFactionId,
      postedDay: 1,
      postedTime: "06:00",
      proofRequired: "combat evidence",
      proofStatus: "pending",
      status: "accepted",
    });

    await WorldEvent.create({
      eventId: tempEventId,
      gameId: tempGameId,
      title: "Fixture combat evidence event",
      type: "combat_fixture",
      status: "active",
      eventLayer: "main_event",
      countsAsMainEvent: true,
      blocksMainEventGeneration: true,
      startDay: 1,
      startTime: "06:00",
    });

    const started = await post("/api/combat/advanced/encounters/start", {
      gameId: tempGameId,
      enemyId: "enemy_lobo_borde",
      reason: "Fixture C5: combate con evidencia post-combate.",
      sourceEventId: tempEventId,
      sourceMissionId: tempMissionId,
      terrainTags: ["forest"],
      visibility: "clear",
      noiseLevel: "quiet",
      surpriseState: "none",
    });

    assert.equal(started.status, 200, JSON.stringify(started.data));
    const encounterId = started.data.encounter.encounterId;

    await CombatEncounter.updateOne(
      { gameId: tempGameId, encounterId },
      {
        $set: {
          status: "won",
          phase: "ending",
          endedDay: 1,
          endedTime: "06:10",
          "enemyStatus.life.current": 0,
          currentActorId: "",
        },
      }
    );

    const previewLoot = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/loot/preview`, {
      gameId: tempGameId,
    });

    assert.equal(previewLoot.status, 200, JSON.stringify(previewLoot.data));
    assert.equal(previewLoot.data.preview.canClaim, true);
    assert.equal(previewLoot.data.preview.mutation.willCreateEvidence, true);
    assert.equal(previewLoot.data.preview.mutation.willCreateInventoryItems, false);

    const claimed = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/loot/claim`, {
      gameId: tempGameId,
    });

    assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
    assert.equal(claimed.data.ok, true);
    assert.ok(claimed.data.evidence.length >= 1);
    assert.equal(claimed.data.loot.inventoryItemsCreated, false);
    assert.equal(claimed.data.encounter.lootState.status, "claimed");
    assert.equal(claimed.data.worldEvent.stage, "combat_evidence_collected");
    assert.equal(claimed.data.mission.proofStatus.after, "submitted");
    assert.equal(claimed.data.faction.institutionalCredit.delta, 1);

    const evidenceCount = await Evidence.countDocuments({ gameId: tempGameId, sourceEventId: tempEventId });
    assert.ok(evidenceCount >= 1);

    const event = await WorldEvent.findOne({ gameId: tempGameId, eventId: tempEventId }).lean();
    assert.equal(event.progress.stage, "combat_evidence_collected");
    assert.ok(event.progress.evidenceIds.length >= 1);

    const secondClaim = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/loot/claim`, {
      gameId: tempGameId,
    });
    assert.equal(secondClaim.status, 400);
  });

  it("previews and applies C5 injury treatment without restoring life", async () => {
    tempInjuryId = `injury_combat_c5_${Date.now()}`;
    const gameState = await GameState.findOne({ gameId: tempGameId });
    const lifeBefore = gameState.lucasStatus.life.current;

    await InjuryRecord.create({
      injuryId: tempInjuryId,
      gameId: tempGameId,
      encounterId: "",
      targetType: "character",
      targetId: "char_lucas",
      bodyPart: "left_arm",
      injuryType: "cut",
      severity: "moderate",
      bleeding: 2,
      pain: 3,
      mobilityPenalty: 0,
      actionPenalty: -2,
      untreatedRisk: "medium",
      requiresTreatment: true,
      createdDay: gameState.currentDay,
      createdTime: gameState.time,
      notes: "Fixture treatment injury.",
    });

    gameState.lucasStatus.injuries.push({
      injuryId: tempInjuryId,
      location: "left_arm",
      severity: "moderada",
      description: "Fixture treatment injury.",
      effects: ["accion -2"],
      createdDay: gameState.currentDay,
      createdTime: gameState.time,
    });
    await gameState.save();

    const previewTreatment = await post(`/api/combat/advanced/injuries/${encodeURIComponent(tempInjuryId)}/treatment/preview`, {
      gameId: tempGameId,
      treatmentType: "field_dressing",
      quality: "good",
    });

    assert.equal(previewTreatment.status, 200, JSON.stringify(previewTreatment.data));
    assert.equal(previewTreatment.data.preview.canTreat, true);
    assert.equal(previewTreatment.data.preview.treatment.bleeding.after, 0);
    assert.equal(previewTreatment.data.preview.mutation.willRestoreLife, false);

    const appliedTreatment = await post(`/api/combat/advanced/injuries/${encodeURIComponent(tempInjuryId)}/treatment/apply`, {
      gameId: tempGameId,
      treatmentType: "field_dressing",
      quality: "good",
    });

    assert.equal(appliedTreatment.status, 200, JSON.stringify(appliedTreatment.data));
    assert.equal(appliedTreatment.data.ok, true);
    assert.equal(appliedTreatment.data.injury.status, "healing");
    assert.equal(appliedTreatment.data.injury.bleeding, 0);
    assert.equal(appliedTreatment.data.treatment.policy.includes("no cura instantaneamente"), true);
    assert.equal(appliedTreatment.data.autoCheckpoint.created, true);

    const afterState = await GameState.findOne({ gameId: tempGameId }).lean();
    assert.equal(afterState.lucasStatus.life.current, lifeBefore);
    const legacy = afterState.lucasStatus.injuries.find((entry) => entry.injuryId === tempInjuryId);
    assert.ok(legacy.effects.includes("tratada:good"));
  });
});
