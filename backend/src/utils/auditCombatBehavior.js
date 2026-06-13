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
const EventLog = require("../models/EventLog");
const Evidence = require("../models/Evidence");
const GameState = require("../models/GameState");
const InjuryRecord = require("../models/InjuryRecord");
const WorldEvent = require("../models/WorldEvent");
const {
  applyAdvancedAction,
  endEncounterAdvanced,
  previewAdvancedAction,
  resolveNextNpcTurn,
  startEncounterAdvanced,
} = require("../services/combatAdvancedService");

const SOURCE_GAME_ID = process.env.AUDIT_GAME_ID || "isekai_lucas_main";
const RUN_ID = process.env.AUDIT_COMBAT_BEHAVIOR_RUN_ID || String(Date.now());
const GAME_ID = `combat_behavior_${RUN_ID}`;

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

async function cleanupTempState() {
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
    EventLog.deleteMany({
      $or: [
        { gameId: GAME_ID },
        { "mechanicalChanges.encounterId": { $in: encounterIds } },
      ],
    }),
    GameState.deleteMany({ gameId: GAME_ID }),
  ]);
}

async function cloneGameState() {
  const source = await GameState.findOne({ gameId: SOURCE_GAME_ID }).lean();
  assertTrue(Boolean(source), "Live GameState is required as behavior audit source.", { sourceGameId: SOURCE_GAME_ID });

  await cleanupTempState();

  const clone = {
    ...source,
    gameId: GAME_ID,
  };
  delete clone._id;

  await GameState.create(clone);
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

  return applyAdvancedAction({
    gameId: GAME_ID,
    previewId: preview.preview.previewId,
  });
}

async function closeEncounterIfActive(encounterId) {
  const encounter = await CombatEncounter.findOne({ gameId: GAME_ID, encounterId }).lean();
  if (!encounter || encounter.status !== "active") return;
  await endEncounterAdvanced({
    gameId: GAME_ID,
    encounterId,
    endStatus: "cancelled",
    reason: "C12 behavior audit cleanup.",
  });
}

async function setDistance(encounterId, distanceBand) {
  const encounter = await CombatEncounter.findOne({ gameId: GAME_ID, encounterId }).lean();
  const lucas = (encounter.participants || []).find((entry) => entry.side === "lucas");
  const enemy = (encounter.participants || []).find((entry) => entry.side === "enemy");
  assertTrue(Boolean(lucas && enemy), "scenario must have Lucas and enemy participants.", { encounterId });

  await CombatEncounter.updateOne(
    { gameId: GAME_ID, encounterId },
    {
      $set: {
        distanceMap: {
          [lucas.combatantId]: { [enemy.combatantId]: distanceBand },
          [enemy.combatantId]: { [lucas.combatantId]: distanceBand },
        },
      },
    }
  );
}

async function setEnemyPressure(encounterId, { hpCurrent, moraleCurrent }) {
  const encounter = await CombatEncounter.findOne({ gameId: GAME_ID, encounterId }).lean();
  const enemy = (encounter.participants || []).find((entry) => entry.side === "enemy");
  assertTrue(Boolean(enemy), "scenario must have enemy participant.", { encounterId });

  await Promise.all([
    CombatEncounter.updateOne(
      { gameId: GAME_ID, encounterId, "participants.combatantId": enemy.combatantId },
      {
        $set: {
          "participants.$.hp.current": hpCurrent,
          "participants.$.morale.current": moraleCurrent,
        },
      }
    ),
    CombatantState.updateOne(
      { gameId: GAME_ID, combatantId: enemy.combatantId },
      {
        $set: {
          "hp.current": hpCurrent,
          "morale.current": moraleCurrent,
        },
      }
    ),
  ]);
}

async function runNpcDecisionScenario({
  label,
  enemyId,
  encounterType,
  playerAction = "prepare",
  setup,
  expectedAction,
  expectedPolicyType,
}) {
  await cloneGameState();
  const started = await startEncounterAdvanced({
    gameId: GAME_ID,
    enemyId,
    reason: `C12 behavior audit: ${label}.`,
    encounterType,
    terrainTags: ["road"],
    visibility: "clear",
    noiseLevel: "normal",
    surpriseState: "none",
  });

  const encounterId = started.encounter.encounterId;
  assertEqual(started.encounter.encounterType, expectedPolicyType, `${label} policy type`);
  assertTrue(Boolean(started.encounter.encounterPolicy?.gptBoundary), `${label} policy exposes GPT boundary`);

  if (setup) await setup(encounterId);

  await previewAndApply(encounterId, playerAction);
  const afterPlayer = await CombatEncounter.findOne({ gameId: GAME_ID, encounterId }).lean();
  assertEqual(afterPlayer.phase, "npc_turn", `${label} reaches npc_turn`);

  if (setup?.afterPlayer) await setup.afterPlayer(encounterId);

  const npcTurn = await resolveNextNpcTurn({ gameId: GAME_ID, encounterId });
  const decision = npcTurn.resolution.modifiers?.npcDecision || {};
  const summary = {
    label,
    actionType: npcTurn.resolution.actionType,
    selectedAction: decision.selectedAction,
    encounterType: decision.policy?.encounterType,
    reason: decision.reason,
    status: npcTurn.encounter.status,
  };

  await closeEncounterIfActive(encounterId);

  assertEqual(npcTurn.resolution.actionType, expectedAction, `${label} resolved action`);
  assertEqual(decision.policy?.encounterType, expectedPolicyType, `${label} decision policy`);
  assertEqual(npcTurn.encounter.latestNpcDecision?.selectedAction, expectedAction, `${label} persisted latest decision`);

  console.log(`PASS ${label}: ${JSON.stringify(summary)}`);
}

async function main() {
  console.log("Combat advanced C12 behavior audit");
  console.log(`Source gameId: ${SOURCE_GAME_ID}`);
  console.log(`Temp gameId: ${GAME_ID}`);
  console.log("Mode: mutates only a temporary GameState and deletes it after each scenario.");

  await connectDB();

  await runNpcDecisionScenario({
    label: "bandit_intimidates_before_attack",
    enemyId: "enemy_bandido_menor",
    encounterType: "bandit_robbery",
    playerAction: "prepare",
    expectedAction: "intimidate",
    expectedPolicyType: "bandit_robbery",
  });

  await runNpcDecisionScenario({
    label: "territorial_creature_moves_from_bad_distance",
    enemyId: "enemy_jabali_gris",
    encounterType: "territorial_creature",
    playerAction: "defend",
    setup: async (encounterId) => setDistance(encounterId, "medium"),
    expectedAction: "move",
    expectedPolicyType: "territorial_creature",
  });

  const predatorSetup = async () => {};
  predatorSetup.afterPlayer = async (encounterId) => setEnemyPressure(encounterId, { hpCurrent: 8, moraleCurrent: 14 });
  await runNpcDecisionScenario({
    label: "wounded_predator_retreats",
    enemyId: "enemy_lobo_borde",
    encounterType: "predatory_hunt",
    playerAction: "defend",
    setup: predatorSetup,
    expectedAction: "flee",
    expectedPolicyType: "predatory_hunt",
  });

  await cloneGameState();
  const sparring = await startEncounterAdvanced({
    gameId: GAME_ID,
    enemyId: "enemy_rata_gigante",
    reason: "C12 behavior audit: sparring policy.",
    combatMode: "sparring",
  });
  assertEqual(sparring.encounter.encounterType, "sparring", "sparring type comes from combatMode");
  assertEqual(sparring.encounter.encounterPolicy.stakes, "controlled", "sparring stakes");
  await closeEncounterIfActive(sparring.encounter.encounterId);
  console.log("PASS sparring_policy_is_controlled");

  await cleanupTempState();
  const remaining = await Promise.all([
    GameState.countDocuments({ gameId: GAME_ID }),
    CombatEncounter.countDocuments({ gameId: GAME_ID }),
    CombatantState.countDocuments({ gameId: GAME_ID }),
  ]);
  assertTrue(remaining.every((count) => count === 0), "temporary C12 behavior docs must be cleaned", { remaining });

  await mongoose.disconnect();
  console.log("Combat advanced C12 behavior audit OK.");
}

main().catch(async (error) => {
  console.error("\nCombat C12 behavior audit failed:");
  console.error(error.message);
  await cleanupTempState().catch(() => {});
  await mongoose.disconnect();
  process.exit(1);
});
