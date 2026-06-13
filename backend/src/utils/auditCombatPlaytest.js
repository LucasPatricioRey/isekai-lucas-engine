try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional; MONGODB_URI can come from the host environment.
}

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const Checkpoint = require("../models/Checkpoint");
const CombatActionPreview = require("../models/CombatActionPreview");
const CombatEncounter = require("../models/CombatEncounter");
const CombatLogEntry = require("../models/CombatLogEntry");
const CombatantState = require("../models/CombatantState");
const EnemyTemplate = require("../models/EnemyTemplate");
const EventLog = require("../models/EventLog");
const Evidence = require("../models/Evidence");
const Faction = require("../models/Faction");
const GameState = require("../models/GameState");
const InjuryRecord = require("../models/InjuryRecord");
const Mission = require("../models/Mission");
const WorldEvent = require("../models/WorldEvent");
const {
  applyAdvancedAction,
  applyInjuryTreatment,
  claimCombatLoot,
  endEncounterAdvanced,
  previewAdvancedAction,
  previewCombatLoot,
  previewInjuryTreatment,
  resolveNextNpcTurn,
  startEncounterAdvanced,
} = require("../services/combatAdvancedService");

const SOURCE_GAME_ID = process.env.AUDIT_GAME_ID || "isekai_lucas_main";
const RUN_ID = process.env.AUDIT_COMBAT_PLAYTEST_RUN_ID || String(Date.now());
const GAME_ID = `combat_playtest_${RUN_ID}`;
const tempEnemyIds = [];
const tempMissionIds = [];
const tempFactionIds = [];
const tempEventIds = [];
const tempInjuryIds = [];
const scenarioResults = [];

function fail(message, evidence = {}) {
  const details = Object.keys(evidence).length ? ` ${JSON.stringify(evidence)}` : "";
  throw new Error(`${message}${details}`);
}

function assertTrue(condition, message, evidence = {}) {
  if (!condition) fail(message, evidence);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) fail(message, { actual, expected });
}

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function printScenario(label, details = {}) {
  scenarioResults.push({ label, details });
  console.log(`PASS ${label}: ${JSON.stringify(details)}`);
}

async function cloneGameState() {
  const source = await GameState.findOne({ gameId: SOURCE_GAME_ID }).lean();
  assertTrue(Boolean(source), "Live GameState is required as playtest source.", { sourceGameId: SOURCE_GAME_ID });

  await GameState.deleteMany({ gameId: GAME_ID });
  const clone = {
    ...source,
    _id: undefined,
    gameId: GAME_ID,
  };
  delete clone._id;

  await GameState.create(clone);
}

async function cleanupTempCombatState() {
  const encounters = await CombatEncounter.find({ gameId: GAME_ID }).select("encounterId").lean();
  const encounterIds = encounters.map((entry) => entry.encounterId);

  await Promise.all([
    CombatActionPreview.deleteMany({ gameId: GAME_ID }),
    CombatantState.deleteMany({ gameId: GAME_ID }),
    CombatLogEntry.deleteMany({ gameId: GAME_ID }),
    CombatEncounter.deleteMany({ gameId: GAME_ID }),
    Checkpoint.deleteMany({ gameId: GAME_ID }),
    Evidence.deleteMany({ gameId: GAME_ID }),
    InjuryRecord.deleteMany({ gameId: GAME_ID }),
    WorldEvent.deleteMany({ gameId: GAME_ID }),
    Mission.deleteMany({ missionId: { $in: tempMissionIds } }),
    Faction.deleteMany({ factionId: { $in: tempFactionIds } }),
    EnemyTemplate.deleteMany({
      $or: [
        { enemyId: { $in: tempEnemyIds } },
        { "flags.c10PlaytestRunId": RUN_ID },
      ],
    }),
    EventLog.deleteMany({
      $or: [
        { gameId: GAME_ID },
        { "mechanicalChanges.encounterId": { $in: encounterIds } },
        { "mechanicalChanges.source": "auditCombatPlaytest" },
      ],
    }),
    GameState.deleteMany({ gameId: GAME_ID }),
  ]);
}

async function createTempEnemyTemplate(overrides = {}) {
  const enemyId =
    overrides.enemyId ||
    `enemy_c10_${RUN_ID}_${tempEnemyIds.length + 1}_${Math.random().toString(36).slice(2, 6)}`;
  tempEnemyIds.push(enemyId);

  await EnemyTemplate.create({
    enemyId,
    name: overrides.name || "C10 playtest enemy",
    species: overrides.species || "fixture",
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
        name: "Golpe de playtest",
        damageType: "blunt",
        baseDamage: 1,
        accuracyModifier: 0,
        fatigueCost: 0,
      },
    ],
    defenses: overrides.defenses || [],
    movement: overrides.movement || { speed: overrides.baseStats?.speed ?? 0 },
    senses: overrides.senses || { vision: "normal", hearing: "normal", smell: "normal" },
    moraleProfile: overrides.moraleProfile || { baseState: "cautious", breaksAt: 0, fleesAt: 0 },
    behaviorProfile: overrides.behaviorProfile || { archetype: "cowardly", preferredActions: ["flee"] },
    lootProfile: overrides.lootProfile || { mode: "proof_only" },
    evidenceProfile: overrides.evidenceProfile || {
      defaultProofStatus: "unverified",
      proofItems: [
        {
          key: `${enemyId}_trace`,
          name: "Rastro C10 de combate",
          type: "trace",
          summary: "Prueba temporal generada por audit:combat-playtest.",
          tags: ["c10_playtest"],
        },
      ],
    },
    habitatTags: ["fixture", "c10_playtest"],
    behavior: ["fixture"],
    zones: ["loc_hoshimori_guild_patio"],
    signals: ["fixture"],
    retreatLogic: overrides.retreatLogic || "Retirada controlada de playtest.",
    rewardPolicy: overrides.rewardPolicy || "No hay recompensa automatica.",
    tags: ["fixture", "c10_playtest", ...(overrides.tags || [])],
    flags: {
      ...(overrides.flags || {}),
      testSuite: true,
      environment: "test",
      c10Playtest: true,
      c10PlaytestRunId: RUN_ID,
    },
  });

  return enemyId;
}

async function closeEncounterIfActive(encounterId, reason = "C10 playtest cleanup.") {
  const encounter = await CombatEncounter.findOne({ gameId: GAME_ID, encounterId }).lean();
  if (!encounter || encounter.status !== "active") return;
  await endEncounterAdvanced({
    gameId: GAME_ID,
    encounterId,
    endStatus: "cancelled",
    reason,
  });
}

async function startEncounter(enemyId, params = {}) {
  const started = await startEncounterAdvanced({
    gameId: GAME_ID,
    enemyId,
    reason: params.reason || "C10 playtest encounter.",
    sourceEventId: params.sourceEventId || "",
    sourceMissionId: params.sourceMissionId || "",
    sourceCommitmentId: params.sourceCommitmentId || "",
    terrainTags: params.terrainTags || ["road"],
    visibility: params.visibility || "clear",
    noiseLevel: params.noiseLevel || "quiet",
    surpriseState: params.surpriseState || "none",
    combatMode: params.combatMode || "real",
  });
  const encounterId = started.encounter?.encounterId;
  assertTrue(Boolean(encounterId), "startEncounterAdvanced did not return encounterId.", { enemyId });
  return started;
}

async function previewAndApply(encounterId, actionType, options = {}) {
  const preview = await previewAdvancedAction({
    gameId: GAME_ID,
    encounterId,
    actionType,
    actorId: options.actorId || "",
    targetIds: options.targetIds || null,
    params: options.params || {},
  });
  assertEqual(preview.canAct, true, `${actionType} preview must be actionable`);
  assertTrue(Boolean(preview.preview?.previewId), `${actionType} preview must create previewId.`);

  const applied = await applyAdvancedAction({
    gameId: GAME_ID,
    previewId: preview.preview.previewId,
  });
  assertEqual(applied.resolution?.actionType, actionType, `${actionType} apply must resolve same action`);

  return { preview, applied };
}

async function scenarioSparringNoSeriousDamage() {
  const enemyId = await createTempEnemyTemplate({
    name: "C10 sparring dummy",
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
  const started = await startEncounter(enemyId, {
    reason: "C10: sparring sin dano serio.",
    combatMode: "sparring",
    terrainTags: ["guild_patio"],
  });
  const encounterId = started.encounter.encounterId;
  const { applied } = await previewAndApply(encounterId, "attack");

  assertEqual(applied.resolution.modifiers?.controlledCombat, true, "sparring attack must be controlled");
  assertTrue(numberOr(applied.resolution.damage?.finalDamage) <= 2, "sparring damage must stay capped", {
    finalDamage: applied.resolution.damage?.finalDamage,
  });
  assertEqual((applied.resolution.injuriesCreated || []).length, 0, "sparring must not create injuries");

  const lucasInjuries = await InjuryRecord.countDocuments({ gameId: GAME_ID, targetId: "char_lucas" });
  assertEqual(lucasInjuries, 0, "sparring must not create Lucas injury records");

  await closeEncounterIfActive(encounterId);
  printScenario("sparring_no_serious_damage", {
    finalDamage: applied.resolution.damage?.finalDamage,
    controlledCombat: applied.resolution.modifiers?.controlledCombat,
  });
}

async function scenarioMinorThreatBackendResolution() {
  const enemyId = await createTempEnemyTemplate({
    name: "C10 amenaza menor",
    baseStats: {
      life: 14,
      hp: 14,
      attack: 2,
      defense: 1,
      agility: 0,
      perception: 1,
      endurance: 1,
      morale: 12,
      speed: 0,
    },
  });
  const started = await startEncounter(enemyId, {
    reason: "C10: amenaza menor con resolucion backend.",
    terrainTags: ["road"],
  });
  const encounterId = started.encounter.encounterId;
  const { applied } = await previewAndApply(encounterId, "attack");

  const rolls = applied.resolution.rolls || {};
  assertTrue(Number.isInteger(rolls.attackRoll), "attack must include backend attackRoll.", rolls);
  assertTrue(Number.isInteger(rolls.defenseRoll), "attack must include backend defenseRoll.", rolls);
  assertTrue(Number.isInteger(rolls.damageRoll), "attack must include backend damageRoll.", rolls);
  assertTrue(Boolean(applied.logEntry?.logId), "attack must create combat log entry.");
  assertTrue((applied.resolution.fatigueChanges || []).length > 0, "attack must apply combat fatigue.");
  assertTrue(Boolean(applied.resolution.result?.resultBand), "attack must expose backend resultBand.");
  assertEqual(applied.resolution.modifiers?.controlledCombat, false, "minor real threat must not use sparring cap");

  await closeEncounterIfActive(encounterId);
  printScenario("minor_threat_backend_resolution", {
    resultBand: applied.resolution.result?.resultBand,
    finalDamage: applied.resolution.damage?.finalDamage,
    fatigueChanges: applied.resolution.fatigueChanges?.length || 0,
  });
}

async function scenarioBlockAndDodgeDefenses() {
  const enemyId = await createTempEnemyTemplate({
    name: "C10 defensa enemiga simple",
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
  const started = await startEncounter(enemyId, {
    reason: "C10: bloqueo y esquiva reales.",
    terrainTags: ["forest"],
  });
  const encounterId = started.encounter.encounterId;

  const block = await previewAndApply(encounterId, "block");
  assertTrue(
    numberOr(block.applied.resolution.modifiers?.expectedDefenseBonus) >= 4,
    "block must create a meaningful defense bonus.",
    block.applied.resolution.modifiers || {}
  );
  assertTrue(
    (block.applied.resolution.skillProgression || []).some(
      (entry) => entry.skillId === "skill_bloqueo" && numberOr(entry.validation?.effectiveExpDelta) > 0
    ),
    "block must award bloqueo progression."
  );
  assertEqual(block.applied.encounter?.phase, "npc_turn", "block must pass turn to NPC");

  const npcTurn = await resolveNextNpcTurn({ gameId: GAME_ID, encounterId });
  assertEqual(npcTurn.resolution?.actionType, "attack", "NPC turn after block must be backend attack");
  assertTrue(
    numberOr(npcTurn.resolution.modifiers?.targetDefensiveModifier) >= 4,
    "NPC attack must consume Lucas defensive modifier from block.",
    npcTurn.resolution.modifiers || {}
  );

  const dodge = await previewAndApply(encounterId, "dodge");
  assertTrue(
    numberOr(dodge.applied.resolution.fatigueChanges?.[0]?.combatFatigue) >= 4,
    "dodge must add visible combat fatigue.",
    dodge.applied.resolution.fatigueChanges?.[0] || {}
  );
  assertTrue(
    (dodge.applied.resolution.skillProgression || []).some(
      (entry) => entry.skillId === "skill_esquiva" && numberOr(entry.validation?.effectiveExpDelta) > 0
    ),
    "dodge must award esquiva progression."
  );

  await closeEncounterIfActive(encounterId);
  printScenario("block_and_dodge_defenses", {
    blockBonus: block.applied.resolution.modifiers?.expectedDefenseBonus,
    npcTargetDefense: npcTurn.resolution.modifiers?.targetDefensiveModifier,
    dodgeFatigue: dodge.applied.resolution.fatigueChanges?.[0]?.combatFatigue,
  });
}

async function scenarioEnemyMoraleFlee() {
  const enemyId = await createTempEnemyTemplate({
    name: "C10 enemigo con moral rota",
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
  const started = await startEncounter(enemyId, {
    reason: "C10: enemigo huye por moral.",
    terrainTags: ["road"],
  });
  const encounterId = started.encounter.encounterId;
  const defended = await previewAndApply(encounterId, "defend");
  assertEqual(defended.applied.encounter.phase, "npc_turn", "defend should pass turn to NPC");

  const npcTurn = await resolveNextNpcTurn({ gameId: GAME_ID, encounterId });
  assertEqual(npcTurn.resolution?.result?.moraleBreak, true, "NPC turn must resolve morale break");
  assertEqual(npcTurn.encounter?.status, "enemy_fled", "morale break must end as enemy_fled");
  assertTrue(Boolean(npcTurn.logEntry?.logId), "NPC morale break must create combat log.");

  printScenario("enemy_morale_flee", {
    status: npcTurn.encounter?.status,
    resultBand: npcTurn.resolution?.result?.resultBand,
  });
}

async function scenarioLucasRetreat() {
  const enemyId = await createTempEnemyTemplate({
    name: "C10 perseguidor lento",
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
  const started = await startEncounter(enemyId, {
    reason: "C10: Lucas se retira.",
    terrainTags: ["road"],
  });
  const encounterId = started.encounter.encounterId;
  const lucasId = started.encounter.participants.find((entry) => entry.side === "lucas")?.combatantId;
  const enemyCombatantId = started.encounter.participants.find((entry) => entry.side === "enemy")?.combatantId;
  assertTrue(Boolean(lucasId && enemyCombatantId), "retreat scenario needs Lucas and enemy combatants.");

  await CombatEncounter.updateOne(
    { gameId: GAME_ID, encounterId },
    {
      $set: {
        distanceMap: {
          [lucasId]: { [enemyCombatantId]: "out_of_sight" },
          [enemyCombatantId]: { [lucasId]: "out_of_sight" },
        },
        escapeRoutes: [
          {
            routeId: "c10_safe_exit",
            toLocationId: "loc_hoshimori_guild_patio",
            label: "Salida C10 segura",
            riskLevel: "safe",
            blocked: false,
          },
        ],
      },
    }
  );

  const enemyFatigue = 40;
  await CombatantState.updateOne({ gameId: GAME_ID, combatantId: enemyCombatantId }, { $set: { combatFatigue: enemyFatigue } });
  await CombatEncounter.updateOne(
    { gameId: GAME_ID, encounterId, "participants.combatantId": enemyCombatantId },
    { $set: { "participants.$.combatFatigue": enemyFatigue } }
  );

  const { applied } = await previewAndApply(encounterId, "flee");
  assertEqual(applied.resolution.result?.escaped, true, "Lucas flee action must resolve escape");
  assertEqual(applied.encounter?.status, "escaped", "Lucas flee must set encounter escaped");
  assertTrue(Number.isInteger(applied.resolution.rolls?.fleeRoll), "flee must include backend roll.");

  printScenario("lucas_retreat", {
    status: applied.encounter?.status,
    resultBand: applied.resolution.result?.resultBand,
    fleeRoll: applied.resolution.rolls?.fleeRoll,
  });
}

async function scenarioLucasLightInjuryAndTreatment() {
  const gameState = await GameState.findOne({ gameId: GAME_ID });
  assertTrue(Boolean(gameState), "temp GameState must exist before injury treatment.");
  const lifeBefore = gameState.lucasStatus.life.current;
  const injuryId = `injury_c10_${RUN_ID}`;
  tempInjuryIds.push(injuryId);

  await InjuryRecord.create({
    injuryId,
    gameId: GAME_ID,
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
    notes: "C10 playtest light injury.",
    flags: { c10Playtest: true, c10PlaytestRunId: RUN_ID },
  });

  gameState.lucasStatus.injuries.push({
    injuryId,
    location: "right_arm",
    severity: "leve",
    description: "C10 playtest light injury.",
    effects: ["sangrado 1"],
    createdDay: gameState.currentDay,
    createdTime: gameState.time,
  });
  await gameState.save();

  const preview = await previewInjuryTreatment({
    gameId: GAME_ID,
    injuryId,
    treatmentType: "field_dressing",
    quality: "good",
  });
  assertEqual(preview.canTreat, true, "light injury treatment preview must be actionable");
  assertEqual(preview.mutation?.willRestoreLife, false, "treatment preview must not restore life");

  const applied = await applyInjuryTreatment({
    gameId: GAME_ID,
    injuryId,
    treatmentType: "field_dressing",
    quality: "good",
  });
  assertEqual(applied.injury?.status, "healing", "treated injury must enter healing status");
  assertEqual(applied.injury?.bleeding, 0, "field dressing must stabilize bleeding");
  assertTrue(applied.treatment?.policy?.includes("no cura instantaneamente"), "treatment policy must forbid instant healing.");

  const afterState = await GameState.findOne({ gameId: GAME_ID }).lean();
  assertEqual(afterState.lucasStatus.life.current, lifeBefore, "injury treatment must not restore life");
  printScenario("lucas_light_injury_and_treatment", {
    injuryStatus: applied.injury?.status,
    bleeding: applied.injury?.bleeding,
    lifeBefore,
    lifeAfter: afterState.lucasStatus.life.current,
  });
}

async function scenarioPostCombatEvidenceNoInventoryLoot() {
  const suffix = `${RUN_ID}_${Date.now()}`;
  const eventId = `event_c10_combat_${suffix}`;
  const missionId = `mission_c10_combat_${suffix}`;
  const factionId = `faction_c10_combat_${suffix}`;
  tempEventIds.push(eventId);
  tempMissionIds.push(missionId);
  tempFactionIds.push(factionId);

  await Faction.create({
    factionId,
    name: "C10 playtest guild",
    type: "guild",
    scope: "local",
    relationshipWithLucas: {
      institutionalCredit: 0,
      merit: 0,
    },
    flags: { c10Playtest: true, c10PlaytestRunId: RUN_ID },
  });

  await Mission.create({
    missionId,
    title: "C10 combat proof mission",
    description: "Temporary mission for post-combat evidence playtest.",
    sourceFactionId: factionId,
    postedDay: 1,
    postedTime: "06:00",
    proofRequired: "combat evidence",
    proofStatus: "pending",
    status: "accepted",
    flags: { c10Playtest: true, c10PlaytestRunId: RUN_ID },
  });

  await WorldEvent.create({
    eventId,
    gameId: GAME_ID,
    title: "C10 combat evidence event",
    type: "combat_playtest",
    status: "active",
    eventLayer: "main_event",
    countsAsMainEvent: true,
    blocksMainEventGeneration: true,
    startDay: 1,
    startTime: "06:00",
    tags: ["c10_playtest"],
    progress: {
      stage: "combat_started",
      statusLabel: "Combate C10 iniciado",
      summary: "Evento temporal para auditar evidencia post-combate.",
      confidence: "partial",
    },
  });

  const enemyId = await createTempEnemyTemplate({
    name: "C10 enemigo con evidencia",
    lootProfile: {
      mode: "proof_only",
      candidateItems: [
        {
          itemId: "item_fake_coin_forbidden",
          quantity: 99,
          reason: "Debe quedar bloqueado y no entrar al inventario.",
        },
      ],
    },
    evidenceProfile: {
      defaultProofStatus: "partial",
      proofItems: [
        {
          key: "c10_gray_trace",
          name: "Rastro fisico C10",
          type: "trace",
          summary: "Evidencia temporal vinculada a combate C10.",
          proofStatus: "partial",
          tags: ["c10_playtest"],
        },
      ],
    },
  });

  const started = await startEncounter(enemyId, {
    reason: "C10: evidencia post-combate sin loot inventado.",
    sourceEventId: eventId,
    sourceMissionId: missionId,
    terrainTags: ["forest"],
  });
  const encounterId = started.encounter.encounterId;

  await CombatEncounter.updateOne(
    { gameId: GAME_ID, encounterId },
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

  const preview = await previewCombatLoot({ gameId: GAME_ID, encounterId });
  assertEqual(preview.canClaim, true, "post-combat evidence preview must be claimable");
  assertEqual(preview.mutation?.willCreateEvidence, true, "post-combat preview must create evidence");
  assertEqual(preview.mutation?.willCreateInventoryItems, false, "post-combat preview must not create inventory items");

  const claimed = await claimCombatLoot({ gameId: GAME_ID, encounterId });
  assertTrue((claimed.evidence || []).length >= 1, "post-combat claim must create evidence.");
  assertEqual(claimed.loot?.inventoryItemsCreated, false, "post-combat claim must not create inventory items");
  assertEqual(claimed.encounter?.lootState?.status, "claimed", "post-combat claim must mark loot claimed");
  assertEqual(claimed.worldEvent?.stage, "combat_evidence_collected", "post-combat claim must patch event progress");
  assertEqual(claimed.mission?.proofStatus?.after, "submitted", "post-combat claim must submit mission proof");
  assertEqual(claimed.faction?.institutionalCredit?.delta, 1, "post-combat claim must grant institutional credit only");

  const tempState = await GameState.findOne({ gameId: GAME_ID }).lean();
  const fakeInventory = (tempState.inventory || []).find((entry) => entry.itemId === "item_fake_coin_forbidden");
  assertEqual(Boolean(fakeInventory), false, "blocked candidate loot must not enter inventory");

  printScenario("post_combat_evidence_no_inventory_loot", {
    evidenceCreated: claimed.evidence.length,
    inventoryItemsCreated: claimed.loot?.inventoryItemsCreated,
    missionProof: claimed.mission?.proofStatus?.after,
  });
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:combat-playtest.");
  }

  console.log("Combat advanced C10 playtest audit");
  console.log(`Source gameId: ${SOURCE_GAME_ID}`);
  console.log(`Temp gameId: ${GAME_ID}`);
  console.log("Mode: mutates only temporary GameState/enemies/events/missions, then cleans them up.");

  await connectDB();

  try {
    await cleanupTempCombatState();
    await cloneGameState();
    await scenarioSparringNoSeriousDamage();
    await scenarioMinorThreatBackendResolution();
    await scenarioBlockAndDodgeDefenses();
    await scenarioEnemyMoraleFlee();
    await scenarioLucasRetreat();
    await scenarioLucasLightInjuryAndTreatment();
    await scenarioPostCombatEvidenceNoInventoryLoot();
  } finally {
    await cleanupTempCombatState();
  }

  const leftovers = await Promise.all([
    GameState.countDocuments({ gameId: GAME_ID }),
    CombatEncounter.countDocuments({ gameId: GAME_ID }),
    CombatActionPreview.countDocuments({ gameId: GAME_ID }),
    CombatantState.countDocuments({ gameId: GAME_ID }),
    CombatLogEntry.countDocuments({ gameId: GAME_ID }),
    InjuryRecord.countDocuments({ gameId: GAME_ID }),
    Evidence.countDocuments({ gameId: GAME_ID }),
    WorldEvent.countDocuments({ gameId: GAME_ID }),
    Mission.countDocuments({ missionId: { $in: tempMissionIds } }),
    Faction.countDocuments({ factionId: { $in: tempFactionIds } }),
    EnemyTemplate.countDocuments({ enemyId: { $in: tempEnemyIds } }),
  ]);
  assertEqual(
    leftovers.reduce((total, value) => total + value, 0),
    0,
    "combat playtest cleanup must leave no temp documents"
  );

  console.log(`Combat playtest scenarios: ${scenarioResults.length}`);
  console.log("Combat advanced C10 playtest audit OK.");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Combat advanced C10 playtest audit FAILED:", error.message);
  try {
    await cleanupTempCombatState();
  } catch (cleanupError) {
    console.error("Cleanup after failed playtest also failed:", cleanupError.message);
  }
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
