const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const CombatActionPreview = require("../models/CombatActionPreview");
const CombatEncounter = require("../models/CombatEncounter");
const CombatantState = require("../models/CombatantState");
const CombatLogEntry = require("../models/CombatLogEntry");
const EnemyTemplate = require("../models/EnemyTemplate");
const InjuryRecord = require("../models/InjuryRecord");
const WeaponProfile = require("../models/WeaponProfile");

describe("advanced combat models", () => {
  it("keeps legacy CombatEncounter documents valid while adding advanced defaults", () => {
    const encounter = new CombatEncounter({
      encounterId: "combat_model_legacy_1",
      gameId: "test_game",
      status: "active",
      locationId: "loc_test",
      enemyId: "enemy_test",
      enemyName: "Enemy Test",
      enemyStatus: {
        life: { current: 10, max: 10 },
        morale: { current: 8, max: 8 },
        conditions: [],
      },
      currentRound: 1,
      startedDay: 1,
      startedTime: "08:00",
    });

    const error = encounter.validateSync();

    assert.equal(error, undefined);
    assert.equal(encounter.phase, "player_turn");
    assert.equal(encounter.round, 1);
    assert.equal(encounter.roundDurationSeconds, 6);
    assert.equal(encounter.encounterVersion, 1);
    assert.equal(encounter.lootState.status, "none");
    assert.equal(encounter.evidenceState.proofStatus, "none");
  });

  it("supports advanced CombatEncounter participant and evidence/loot state", () => {
    const encounter = new CombatEncounter({
      encounterId: "combat_model_advanced_1",
      gameId: "test_game",
      status: "active",
      phase: "npc_turn",
      locationId: "loc_forest_edge",
      sourceEventId: "event_tracks",
      startedDay: 16,
      startedTime: "08:40",
      participants: [
        {
          combatantId: "combatant_lucas",
          side: "lucas",
          characterId: "char_lucas",
          name: "Lucas",
          type: "character",
          hp: { current: 100, max: 100 },
          mp: { current: 200, max: 200 },
        },
        {
          combatantId: "combatant_enemy_lobo_1",
          side: "enemy",
          enemyTemplateId: "enemy_lobo_borde",
          enemyInstanceId: "enemy_lobo_borde_instance_1",
          name: "Lobo de borde",
          type: "enemy",
          hp: { current: 35, max: 35 },
          morale: { current: 35, max: 35 },
        },
      ],
      turnOrder: ["combatant_lucas", "combatant_enemy_lobo_1"],
      currentActorId: "combatant_enemy_lobo_1",
      distanceMap: {
        combatant_lucas: {
          combatant_enemy_lobo_1: "near",
        },
      },
      lootState: {
        status: "unavailable",
        reason: "El enemigo sigue activo.",
      },
      evidenceState: {
        proofStatus: "unverified",
        candidateEvidence: [{ type: "hair_sample" }],
      },
    });

    const error = encounter.validateSync();

    assert.equal(error, undefined);
    assert.equal(encounter.participants.length, 2);
    assert.equal(encounter.turnOrder[0], "combatant_lucas");
    assert.equal(encounter.evidenceState.candidateEvidence[0].type, "hair_sample");
  });

  it("keeps legacy EnemyTemplate seeds valid while exposing advanced fields", () => {
    const enemy = new EnemyTemplate({
      enemyId: "enemy_model_lobo",
      name: "Lobo de borde",
      type: "animal",
      dangerLevel: "low",
      rankHint: "Porcelana",
      baseStats: {
        life: 35,
        attack: 8,
        defense: 3,
        agility: 12,
        perception: 10,
        morale: 35,
      },
      behavior: ["evita grupos grandes"],
      zones: ["Bosque de los Susurros"],
      signals: ["huellas frescas"],
      retreatLogic: "Se retira si pierde mucha vida.",
      rewardPolicy: "No hay recompensa automatica.",
    });

    const error = enemy.validateSync();

    assert.equal(error, undefined);
    assert.equal(enemy.dangerRank, "low");
    assert.equal(enemy.baseStats.life, 35);
    assert.equal(enemy.lootProfile.mode, "logical_search");
    assert.equal(enemy.evidenceProfile.defaultProofStatus, "unverified");
  });

  it("validates separated combat state models", () => {
    const combatant = new CombatantState({
      combatantId: "combatant_model_lucas",
      encounterId: "combat_model_advanced_1",
      gameId: "test_game",
      side: "lucas",
      characterId: "char_lucas",
      name: "Lucas",
      type: "character",
      hp: { current: 100, max: 100 },
      mp: { current: 200, max: 200 },
    });

    const preview = new CombatActionPreview({
      previewId: "combat_preview_model_1",
      gameId: "test_game",
      encounterId: "combat_model_advanced_1",
      encounterVersion: 1,
      stateHash: "hash_1",
      round: 1,
      phase: "player_turn",
      actorId: "combatant_lucas",
      actionType: "attack",
      targetIds: ["combatant_enemy_lobo_1"],
      expiresAt: new Date(Date.now() + 60000),
    });

    const log = new CombatLogEntry({
      logId: "combat_log_model_1",
      encounterId: "combat_model_advanced_1",
      gameId: "test_game",
      round: 1,
      phase: "player_turn",
      actorId: "combatant_lucas",
      actorName: "Lucas",
      actionType: "attack",
      targetIds: ["combatant_enemy_lobo_1"],
      result: { outcome: "miss" },
      narrativeSummary: "Lucas ataca, pero el enemigo retrocede.",
      createdDay: 16,
      createdTime: "08:41",
      elapsedSeconds: 6,
    });

    const weapon = new WeaponProfile({
      weaponProfileId: "weapon_profile_model_dagger",
      itemId: "item_daga_simple",
      name: "Daga simple",
      weaponType: "dagger",
      rangeBand: "engaged",
      damageType: "pierce",
      baseDamage: 4,
      accuracyModifier: 1,
      requiredSkillId: "skill_daga",
      traits: ["light", "concealable"],
    });

    assert.equal(combatant.validateSync(), undefined);
    assert.equal(preview.validateSync(), undefined);
    assert.equal(log.validateSync(), undefined);
    assert.equal(weapon.validateSync(), undefined);
  });

  it("validates InjuryRecord severity and recovery fields", () => {
    const injury = new InjuryRecord({
      injuryId: "injury_model_1",
      gameId: "test_game",
      encounterId: "combat_model_advanced_1",
      targetType: "character",
      targetId: "char_lucas",
      bodyPart: "left_arm",
      injuryType: "cut",
      severity: "minor",
      bleeding: 1,
      pain: 2,
      requiresTreatment: true,
      createdDay: 16,
      createdTime: "08:42",
      expectedRecoveryDays: 2,
      healingProgress: 4,
      recoveryHoursRemaining: 44,
      lastRecoveryDay: 16,
      lastRecoveryTime: "20:00",
    });

    const invalid = new InjuryRecord({
      injuryId: "injury_model_invalid",
      targetType: "character",
      targetId: "char_lucas",
      severity: "leve",
      createdDay: 16,
      createdTime: "08:42",
    });

    assert.equal(injury.validateSync(), undefined);
    assert.equal(injury.healingProgress, 4);
    assert.equal(injury.recoveryHoursRemaining, 44);
    assert.match(invalid.validateSync().message, /`leve` is not a valid enum value/);
  });

  it("exposes helpers for converting current simple combat data", () => {
    const enemy = {
      enemyId: "enemy_lobo_borde",
      name: "Lobo de borde",
      baseStats: {
        life: 35,
        morale: 35,
      },
    };

    const enemyStatus = CombatEncounter.buildLegacyEnemyStatus(enemy);
    const participants = CombatEncounter.buildInitialParticipantsFromLegacy({
      gameState: {
        lucasStatus: {
          life: { current: 100, max: 100 },
          mp: { current: 200, max: 200 },
        },
        inventory: [{ itemId: "item_daga_simple", equipped: true }],
      },
      enemy,
    });

    assert.equal(enemyStatus.life.current, 35);
    assert.equal(enemyStatus.morale.max, 35);
    assert.equal(participants.length, 2);
    assert.equal(participants[0].equippedWeaponIds[0], "item_daga_simple");
    assert.equal(participants[1].enemyTemplateId, "enemy_lobo_borde");
  });
});
