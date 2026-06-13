const { after, before, describe, it } = require("node:test");

const CombatActionPreview = require("../models/CombatActionPreview");
const CombatEncounter = require("../models/CombatEncounter");
const CombatantState = require("../models/CombatantState");
const CombatLogEntry = require("../models/CombatLogEntry");
const Evidence = require("../models/Evidence");
const EventLog = require("../models/EventLog");
const EnemyTemplate = require("../models/EnemyTemplate");
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
const tempEnemyIds = [];

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
    EnemyTemplate.deleteMany({ enemyId: { $in: tempEnemyIds } }),
    EventLog.deleteMany({
      $or: [
        { gameId: tempGameId },
        { "mechanicalChanges.encounterId": { $in: encounterIds } },
      ],
    }),
    GameState.deleteMany({ gameId: tempGameId }),
  ]);
}

async function createTempEnemyTemplate(overrides = {}) {
  const enemyId = overrides.enemyId || `enemy_fixture_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  tempEnemyIds.push(enemyId);

  await EnemyTemplate.create({
    enemyId,
    name: overrides.name || "Fixture combat enemy",
    type: overrides.type || "beast",
    dangerLevel: overrides.dangerLevel || "low",
    dangerRank: overrides.dangerRank || overrides.dangerLevel || "low",
    rankHint: overrides.rankHint || "Porcelana",
    baseStats: {
      life: overrides.baseStats?.life ?? 12,
      hp: overrides.baseStats?.hp ?? overrides.baseStats?.life ?? 12,
      attack: overrides.baseStats?.attack ?? 2,
      defense: overrides.baseStats?.defense ?? 1,
      agility: overrides.baseStats?.agility ?? 0,
      perception: overrides.baseStats?.perception ?? 1,
      endurance: overrides.baseStats?.endurance ?? 1,
      morale: overrides.baseStats?.morale ?? 10,
      speed: overrides.baseStats?.speed ?? 0,
      awareness: overrides.baseStats?.awareness ?? 1,
      instinct: overrides.baseStats?.instinct ?? 1,
    },
    attacks: overrides.attacks || [
      {
        attackId: `${enemyId}_attack`,
        name: "Golpe de fixture",
        damageType: "blunt",
        baseDamage: 1,
        accuracyModifier: 0,
      },
    ],
    defenses: overrides.defenses || [],
    movement: overrides.movement || { speed: overrides.baseStats?.speed ?? 0 },
    moraleProfile: overrides.moraleProfile || { baseState: "cautious", breaksAt: 0, fleesAt: 0 },
    behaviorProfile: overrides.behaviorProfile || { archetype: "cowardly", preferredActions: ["flee"] },
    lootProfile: overrides.lootProfile || { mode: "proof_only" },
    evidenceProfile: overrides.evidenceProfile || {
      defaultProofStatus: "unverified",
      proofItems: [
        {
          key: `${enemyId}_trace`,
          name: "Rastro de fixture",
          type: "trace",
          summary: "Prueba fixture de combate.",
        },
      ],
    },
    retreatLogic: overrides.retreatLogic || "Fixture de pruebas.",
    rewardPolicy: overrides.rewardPolicy || "No hay recompensa automatica.",
    tags: ["fixture", ...(overrides.tags || [])],
  });

  return enemyId;
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
    assert.ok(actions.data.actions.some((action) => action.actionType === "block" && action.c4ApplySupported));
    assert.ok(actions.data.actions.some((action) => action.actionType === "dodge" && action.c4ApplySupported));
    assert.ok(actions.data.actions.some((action) => action.actionType === "use_item" && action.c4ApplySupported));
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

  it("blocks invalid previews from being applied", async () => {
    const enemyId = await createTempEnemyTemplate();
    const started = await post("/api/combat/advanced/encounters/start", {
      gameId: tempGameId,
      enemyId,
      reason: "Fixture: preview invalido.",
    });

    assert.equal(started.status, 200, JSON.stringify(started.data));
    const encounterId = started.data.encounter.encounterId;

    const invalidPreview = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/actions/preview`, {
      gameId: tempGameId,
      actionType: "attack",
      actorId: "combatant_intruso",
      targetIds: [],
    });

    assert.equal(invalidPreview.status, 200, JSON.stringify(invalidPreview.data));
    assert.equal(invalidPreview.data.preview.canAct, false);
    assert.equal(invalidPreview.data.preview.preview.status, "invalidated");

    const blockedApply = await post("/api/combat/advanced/actions/apply", {
      gameId: tempGameId,
      previewId: invalidPreview.data.preview.preview.previewId,
    });

    assert.equal(blockedApply.status, 400);

    await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/end`, {
      gameId: tempGameId,
      endStatus: "cancelled",
      reason: "Fixture cleanup.",
    });
  });

  it("applies block and dodge as real defensive actions", async () => {
    const enemyId = await createTempEnemyTemplate({
      baseStats: {
        life: 18,
        hp: 18,
        attack: 3,
        defense: 1,
        agility: 1,
        perception: 1,
        endurance: 1,
        morale: 12,
        speed: 1,
      },
    });
    const started = await post("/api/combat/advanced/encounters/start", {
      gameId: tempGameId,
      enemyId,
      reason: "Fixture: defensa real.",
      terrainTags: ["forest"],
    });

    assert.equal(started.status, 200, JSON.stringify(started.data));
    const encounterId = started.data.encounter.encounterId;
    const skillBefore = (await GameState.findOne({ gameId: tempGameId }).lean()).skills.find(
      (skill) => skill.skillId === "skill_bloqueo"
    );

    const blockPreview = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/actions/preview`, {
      gameId: tempGameId,
      actionType: "block",
    });

    assert.equal(blockPreview.status, 200, JSON.stringify(blockPreview.data));
    assert.equal(blockPreview.data.preview.canAct, true);

    const blockApplied = await post("/api/combat/advanced/actions/apply", {
      gameId: tempGameId,
      previewId: blockPreview.data.preview.preview.previewId,
    });

    assert.equal(blockApplied.status, 200, JSON.stringify(blockApplied.data));
    assert.equal(blockApplied.data.resolution.actionType, "block");
    assert.ok(blockApplied.data.resolution.modifiers.expectedDefenseBonus >= 4);
    assert.ok(
      blockApplied.data.resolution.skillProgression.some(
        (entry) => entry.skillId === "skill_bloqueo" && entry.validation.effectiveExpDelta > 0
      )
    );
    assert.equal(blockApplied.data.encounter.phase, "npc_turn");

    const skillAfter = (await GameState.findOne({ gameId: tempGameId }).lean()).skills.find(
      (skill) => skill.skillId === "skill_bloqueo"
    );
    assert.ok(skillAfter.exp > skillBefore.exp || skillAfter.level > skillBefore.level);

    const npcTurn = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/npc-turn/resolve`, {
      gameId: tempGameId,
    });

    assert.equal(npcTurn.status, 200, JSON.stringify(npcTurn.data));
    assert.equal(npcTurn.data.resolution.actionType, "attack");
    assert.ok(npcTurn.data.resolution.modifiers.targetDefensiveModifier >= 4);

    const dodgePreview = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/actions/preview`, {
      gameId: tempGameId,
      actionType: "dodge",
    });

    assert.equal(dodgePreview.status, 200, JSON.stringify(dodgePreview.data));
    assert.equal(dodgePreview.data.preview.canAct, true);

    const dodgeApplied = await post("/api/combat/advanced/actions/apply", {
      gameId: tempGameId,
      previewId: dodgePreview.data.preview.preview.previewId,
    });

    assert.equal(dodgeApplied.status, 200, JSON.stringify(dodgeApplied.data));
    assert.equal(dodgeApplied.data.resolution.actionType, "dodge");
    assert.ok(dodgeApplied.data.resolution.fatigueChanges[0].combatFatigue >= 4);

    await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/end`, {
      gameId: tempGameId,
      endStatus: "cancelled",
      reason: "Fixture cleanup.",
    });
  });

  it("lets Lucas retreat through backend resolution", async () => {
    const enemyId = await createTempEnemyTemplate({
      baseStats: {
        life: 10,
        hp: 10,
        attack: 1,
        defense: 0,
        agility: 0,
        perception: 1,
        endurance: 1,
        morale: 6,
        speed: 0,
      },
    });
    const started = await post("/api/combat/advanced/encounters/start", {
      gameId: tempGameId,
      enemyId,
      reason: "Fixture: retirada de Lucas.",
      terrainTags: ["road"],
    });

    assert.equal(started.status, 200, JSON.stringify(started.data));
    const encounterId = started.data.encounter.encounterId;
    const lucasId = started.data.encounter.participants.find((entry) => entry.side === "lucas").combatantId;
    const enemyCombatantId = started.data.encounter.participants.find((entry) => entry.side === "enemy").combatantId;

    const encounter = await CombatEncounter.findOne({ gameId: tempGameId, encounterId });
    encounter.distanceMap = {
      [lucasId]: { [enemyCombatantId]: "out_of_sight" },
      [enemyCombatantId]: { [lucasId]: "out_of_sight" },
    };
    encounter.escapeRoutes = [
      {
        routeId: "fixture_safe_exit",
        toLocationId: "loc_fixture_exit",
        label: "Salida fixture",
        riskLevel: "safe",
        blocked: false,
      },
    ];
    encounter.participants = encounter.participants.map((entry) => {
      if (entry.combatantId !== enemyCombatantId) return entry;
      const plainEntry = typeof entry.toObject === "function" ? entry.toObject() : entry;
      return { ...plainEntry, combatFatigue: 40 };
    });
    encounter.markModified("distanceMap");
    encounter.markModified("escapeRoutes");
    encounter.markModified("participants");
    await encounter.save();

    const fleePreview = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/actions/preview`, {
      gameId: tempGameId,
      actionType: "flee",
    });

    assert.equal(fleePreview.status, 200, JSON.stringify(fleePreview.data));
    assert.equal(fleePreview.data.preview.canAct, true);

    const fled = await post("/api/combat/advanced/actions/apply", {
      gameId: tempGameId,
      previewId: fleePreview.data.preview.preview.previewId,
    });

    assert.equal(fled.status, 200, JSON.stringify(fled.data));
    assert.equal(fled.data.resolution.actionType, "flee");
    assert.equal(fled.data.resolution.result.escaped, true);
    assert.equal(fled.data.encounter.status, "escaped");
  });

  it("resolves enemy morale break without GPT-decided outcome", async () => {
    const enemyId = await createTempEnemyTemplate({
      baseStats: {
        life: 10,
        hp: 10,
        attack: 1,
        defense: 0,
        agility: 0,
        perception: 1,
        endurance: 1,
        morale: 8,
        speed: 0,
      },
      moraleProfile: {
        baseState: "afraid",
        breaksAt: 8,
        fleesAt: 8,
        surrenderPossible: false,
      },
    });
    const started = await post("/api/combat/advanced/encounters/start", {
      gameId: tempGameId,
      enemyId,
      reason: "Fixture: huida por moral.",
    });

    assert.equal(started.status, 200, JSON.stringify(started.data));
    const encounterId = started.data.encounter.encounterId;

    const defendPreview = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/actions/preview`, {
      gameId: tempGameId,
      actionType: "defend",
    });
    assert.equal(defendPreview.status, 200, JSON.stringify(defendPreview.data));

    const defended = await post("/api/combat/advanced/actions/apply", {
      gameId: tempGameId,
      previewId: defendPreview.data.preview.preview.previewId,
    });
    assert.equal(defended.status, 200, JSON.stringify(defended.data));
    assert.equal(defended.data.encounter.phase, "npc_turn");

    const npcTurn = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/npc-turn/resolve`, {
      gameId: tempGameId,
    });

    assert.equal(npcTurn.status, 200, JSON.stringify(npcTurn.data));
    assert.equal(npcTurn.data.resolution.result.moraleBreak, true);
    assert.equal(npcTurn.data.encounter.status, "enemy_fled");
  });

  it("supports sparring mode without serious damage or injury records", async () => {
    const enemyId = await createTempEnemyTemplate({
      baseStats: {
        life: 5,
        hp: 5,
        attack: 1,
        defense: 0,
        agility: 0,
        perception: 1,
        endurance: 1,
        morale: 10,
        speed: 0,
      },
    });
    const started = await post("/api/combat/advanced/encounters/start", {
      gameId: tempGameId,
      enemyId,
      reason: "Fixture: sparring controlado.",
      combatMode: "sparring",
    });

    assert.equal(started.status, 200, JSON.stringify(started.data));
    const encounterId = started.data.encounter.encounterId;

    const attackPreview = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/actions/preview`, {
      gameId: tempGameId,
      actionType: "attack",
    });

    assert.equal(attackPreview.status, 200, JSON.stringify(attackPreview.data));
    assert.equal(attackPreview.data.preview.canAct, true);

    const attacked = await post("/api/combat/advanced/actions/apply", {
      gameId: tempGameId,
      previewId: attackPreview.data.preview.preview.previewId,
    });

    assert.equal(attacked.status, 200, JSON.stringify(attacked.data));
    assert.equal(attacked.data.resolution.modifiers.controlledCombat, true);
    assert.ok(attacked.data.resolution.damage.finalDamage <= 2);
    assert.equal(attacked.data.resolution.injuriesCreated.length, 0);
    assert.ok(attacked.data.encounter.participants.find((entry) => entry.side === "enemy").hp.current >= 1);

    if (attacked.data.encounter.status === "active") {
      await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/end`, {
        gameId: tempGameId,
        endStatus: "cancelled",
        reason: "Fixture cleanup.",
      });
    }
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

  it("uses a real inventory item in combat to treat a wound without restoring life", async () => {
    const injuryId = `injury_combat_c8_use_item_${Date.now()}`;
    const gameState = await GameState.findOne({ gameId: tempGameId });
    const lifeBefore = gameState.lucasStatus.life.current;

    gameState.inventory = [
      ...(gameState.inventory || []).filter((entry) => entry.itemId !== "item_vendaje_limpio"),
      {
        itemId: "item_vendaje_limpio",
        quantity: 2,
        condition: "normal",
        equipped: false,
        notes: "Fixture C8 use_item.",
      },
    ];
    gameState.lucasStatus.injuries.push({
      injuryId,
      location: "right_arm",
      severity: "leve",
      description: "Fixture C8 combat use_item wound.",
      effects: ["sangrado 1"],
      createdDay: gameState.currentDay,
      createdTime: gameState.time,
    });
    await gameState.save();

    await InjuryRecord.create({
      injuryId,
      gameId: tempGameId,
      encounterId: "",
      targetType: "character",
      targetId: "char_lucas",
      bodyPart: "right_arm",
      injuryType: "cut",
      severity: "minor",
      bleeding: 1,
      pain: 2,
      mobilityPenalty: 0,
      actionPenalty: -1,
      untreatedRisk: "low",
      requiresTreatment: true,
      createdDay: gameState.currentDay,
      createdTime: gameState.time,
      notes: "Fixture C8 combat use_item wound.",
    });

    const enemyId = await createTempEnemyTemplate({
      baseStats: {
        life: 12,
        hp: 12,
        attack: 1,
        defense: 0,
        agility: 0,
        perception: 1,
        endurance: 1,
        morale: 8,
        speed: 0,
      },
    });
    const started = await post("/api/combat/advanced/encounters/start", {
      gameId: tempGameId,
      enemyId,
      reason: "Fixture: use_item en combate.",
      terrainTags: ["road"],
    });

    assert.equal(started.status, 200, JSON.stringify(started.data));
    const encounterId = started.data.encounter.encounterId;

    const preview = await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/actions/preview`, {
      gameId: tempGameId,
      actionType: "use_item",
      params: {
        itemId: "item_vendaje_limpio",
        injuryId,
      },
    });

    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    assert.equal(preview.data.preview.canAct, true);
    assert.equal(preview.data.preview.mutation.willMutateGameState, true);

    const applied = await post("/api/combat/advanced/actions/apply", {
      gameId: tempGameId,
      previewId: preview.data.preview.preview.previewId,
    });

    assert.equal(applied.status, 200, JSON.stringify(applied.data));
    assert.equal(applied.data.resolution.actionType, "use_item");
    assert.equal(applied.data.resolution.modifiers.willRestoreLife, false);
    assert.equal(applied.data.resolution.inventoryChanges[0].itemId, "item_vendaje_limpio");
    assert.equal(applied.data.resolution.inventoryChanges[0].before, 2);
    assert.equal(applied.data.resolution.inventoryChanges[0].after, 1);
    assert.equal(applied.data.resolution.injuriesTreated[0].injuryId, injuryId);
    assert.equal(applied.data.logEntry.inventoryChanges[0].itemId, "item_vendaje_limpio");

    const afterState = await GameState.findOne({ gameId: tempGameId }).lean();
    assert.equal(afterState.lucasStatus.life.current, lifeBefore);
    assert.equal(afterState.inventory.find((entry) => entry.itemId === "item_vendaje_limpio").quantity, 1);
    const afterInjury = await InjuryRecord.findOne({ gameId: tempGameId, injuryId }).lean();
    assert.equal(afterInjury.bleeding, 0);
    assert.equal(afterInjury.status, "healing");

    await post(`/api/combat/advanced/encounters/${encodeURIComponent(encounterId)}/end`, {
      gameId: tempGameId,
      endStatus: "cancelled",
      reason: "Fixture cleanup.",
    });
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
