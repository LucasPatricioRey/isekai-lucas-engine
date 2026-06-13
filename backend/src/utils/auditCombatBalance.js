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
const RUN_ID = process.env.AUDIT_COMBAT_BALANCE_RUN_ID || String(Date.now());
const GAME_ID = `combat_balance_${RUN_ID}`;
const results = [];

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

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

function average(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function summarizeMetric(values) {
  return {
    count: values.length,
    avg: Number(average(values).toFixed(2)),
    max: values.length ? Math.max(...values) : 0,
    min: values.length ? Math.min(...values) : 0,
  };
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

async function cloneGameState(equipment = {}) {
  const source = await GameState.findOne({ gameId: SOURCE_GAME_ID }).lean();
  assertTrue(Boolean(source), "Live GameState is required as balance source.", { sourceGameId: SOURCE_GAME_ID });

  await cleanupTempState();

  const inventory = (source.inventory || []).map((entry) => ({
    ...entry,
    equipped: false,
  }));
  for (const itemId of [...(equipment.weapons || []), ...(equipment.armor || [])]) {
    const existing = inventory.find((entry) => entry.itemId === itemId);
    if (existing) {
      existing.equipped = true;
      existing.quantity = Math.max(1, numberOr(existing.quantity, 1));
    } else {
      inventory.push({
        itemId,
        quantity: 1,
        condition: "normal",
        equipped: true,
        notes: "C11 balance audit equipment.",
      });
    }
  }

  const clone = {
    ...source,
    _id: undefined,
    gameId: GAME_ID,
    inventory,
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
    reason: "C11 balance audit cleanup.",
  });
}

function collectResolution(metrics, resolution, lucasCombatantId) {
  if (!resolution) return;
  const finalDamage = numberOr(resolution.damage?.finalDamage, 0);
  const isLucasActor = resolution.actorId === lucasCombatantId;
  if (resolution.actionType === "attack") {
    if (isLucasActor) {
      metrics.playerDamage.push(finalDamage);
      if (resolution.modifiers?.weapon) metrics.playerWeapons.push(resolution.modifiers.weapon);
    } else {
      metrics.npcDamage.push(finalDamage);
    }
    if (resolution.result?.resultBand) metrics.resultBands.push(resolution.result.resultBand);
    if (resolution.result?.resultBand === "critical_hit") metrics.criticalHits += 1;
    if (numberOr(resolution.modifiers?.targetArmorReduction, 0) > 0) {
      metrics.armorReductions.push(numberOr(resolution.modifiers.targetArmorReduction, 0));
    }
  }
  metrics.injuriesCreated += (resolution.injuriesCreated || []).length;
}

async function runScenario({
  label,
  enemyId,
  equipment = {},
  actions = ["attack"],
  maxNpcTurns = 3,
  terrainTags = ["road"],
  setupRetreat = false,
  combatMode = "real",
  thresholds = {},
}) {
  await cloneGameState(equipment);
  const started = await startEncounterAdvanced({
    gameId: GAME_ID,
    enemyId,
    reason: `C11 balance audit: ${label}.`,
    terrainTags,
    visibility: "clear",
    noiseLevel: "quiet",
    surpriseState: "none",
    combatMode,
  });

  const encounterId = started.encounter.encounterId;
  const lucasCombatantId = started.encounter.participants.find((entry) => entry.side === "lucas")?.combatantId;
  const enemyCombatantId = started.encounter.participants.find((entry) => entry.side === "enemy")?.combatantId;
  assertTrue(Boolean(lucasCombatantId && enemyCombatantId), "scenario must have Lucas and enemy combatants.", { label });

  if (setupRetreat) {
    await CombatEncounter.updateOne(
      { gameId: GAME_ID, encounterId },
      {
        $set: {
          distanceMap: {
            [lucasCombatantId]: { [enemyCombatantId]: "out_of_sight" },
            [enemyCombatantId]: { [lucasCombatantId]: "out_of_sight" },
          },
          escapeRoutes: [
            {
              routeId: "c11_safe_retreat",
              toLocationId: "loc_hoshimori_guild_patio",
              label: "Ruta segura C11",
              riskLevel: "safe",
              blocked: false,
            },
          ],
        },
      }
    );
    await CombatantState.updateOne(
      { gameId: GAME_ID, combatantId: enemyCombatantId },
      { $set: { combatFatigue: 35 } }
    );
    await CombatEncounter.updateOne(
      { gameId: GAME_ID, encounterId, "participants.combatantId": enemyCombatantId },
      { $set: { "participants.$.combatFatigue": 35 } }
    );
  }

  const metrics = {
    label,
    playerDamage: [],
    npcDamage: [],
    armorReductions: [],
    resultBands: [],
    playerWeapons: [],
    criticalHits: 0,
    injuriesCreated: 0,
    npcTurns: 0,
    finalStatus: "active",
    lucasLifeAfter: null,
  };

  for (const actionType of actions) {
    const current = await CombatEncounter.findOne({ gameId: GAME_ID, encounterId }).lean();
    if (!current || current.status !== "active") {
      metrics.finalStatus = current?.status || metrics.finalStatus;
      break;
    }
    if (current.phase !== "player_turn") break;

    const applied = await previewAndApply(encounterId, actionType);
    collectResolution(metrics, applied.resolution, lucasCombatantId);
    metrics.finalStatus = applied.encounter.status;
    if (applied.encounter.status !== "active") break;

    const afterPlayer = await CombatEncounter.findOne({ gameId: GAME_ID, encounterId }).lean();
    if (afterPlayer?.phase === "npc_turn" && metrics.npcTurns < maxNpcTurns) {
      const npcTurn = await resolveNextNpcTurn({ gameId: GAME_ID, encounterId });
      metrics.npcTurns += 1;
      collectResolution(metrics, npcTurn.resolution, lucasCombatantId);
      metrics.finalStatus = npcTurn.encounter.status;
      if (npcTurn.encounter.status !== "active") break;
    }
  }

  const finalState = await GameState.findOne({ gameId: GAME_ID }).lean();
  metrics.lucasLifeAfter = finalState?.lucasStatus?.life?.current ?? null;
  await closeEncounterIfActive(encounterId);

  const summary = {
    label,
    status: metrics.finalStatus,
    playerDamage: summarizeMetric(metrics.playerDamage),
    npcDamage: summarizeMetric(metrics.npcDamage),
    armorReduction: summarizeMetric(metrics.armorReductions),
    criticalHits: metrics.criticalHits,
    injuriesCreated: metrics.injuriesCreated,
    lucasLifeAfter: metrics.lucasLifeAfter,
    playerWeapons: Array.from(new Set(metrics.playerWeapons)),
    resultBands: metrics.resultBands,
  };

  if (thresholds.allowedStatuses) {
    assertTrue(thresholds.allowedStatuses.includes(metrics.finalStatus), `${label} ended with unexpected status.`, summary);
  }
  if (thresholds.maxPlayerHit !== undefined) {
    assertTrue(summary.playerDamage.max <= thresholds.maxPlayerHit, `${label} player hit exceeded balance cap.`, summary);
  }
  if (thresholds.maxNpcHit !== undefined) {
    assertTrue(summary.npcDamage.max <= thresholds.maxNpcHit, `${label} NPC hit exceeded balance cap.`, summary);
  }
  if (thresholds.minLucasLifeAfter !== undefined) {
    assertTrue(metrics.lucasLifeAfter >= thresholds.minLucasLifeAfter, `${label} left Lucas too damaged.`, summary);
  }
  if (thresholds.requiresArmorReduction) {
    assertTrue(summary.armorReduction.max >= thresholds.requiresArmorReduction, `${label} did not apply expected armor reduction.`, summary);
  }
  if (thresholds.mustEscape) {
    assertEqual(metrics.finalStatus, "escaped", `${label} must resolve Lucas retreat`);
  }
  if (thresholds.maxInjuries !== undefined) {
    assertTrue(metrics.injuriesCreated <= thresholds.maxInjuries, `${label} created too many injuries.`, summary);
  }
  if (thresholds.expectedPlayerWeapon) {
    assertTrue(
      summary.playerWeapons.includes(thresholds.expectedPlayerWeapon),
      `${label} did not use expected player weapon.`,
      summary
    );
  }

  results.push(summary);
  console.log(`PASS ${label}: ${JSON.stringify(summary)}`);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:combat-balance.");
  }

  console.log("Combat advanced C11 balance audit");
  console.log(`Source gameId: ${SOURCE_GAME_ID}`);
  console.log(`Temp gameId: ${GAME_ID}`);
  console.log("Mode: mutates only a temporary GameState and deletes it after each scenario.");

  await connectDB();

  try {
    await runScenario({
      label: "rat_unarmed_opening",
      enemyId: "enemy_rata_gigante",
      actions: ["attack", "attack"],
      thresholds: {
        allowedStatuses: ["active", "won", "enemy_fled"],
        maxPlayerHit: 18,
        maxNpcHit: 14,
        minLucasLifeAfter: 80,
        maxInjuries: 2,
      },
    });

    await runScenario({
      label: "rat_dagger_pressure",
      enemyId: "enemy_rata_gigante",
      equipment: { weapons: ["item_daga_simple"] },
      actions: ["attack", "attack"],
      thresholds: {
        allowedStatuses: ["active", "won", "enemy_fled"],
        maxPlayerHit: 22,
        maxNpcHit: 14,
        minLucasLifeAfter: 80,
        maxInjuries: 2,
      },
    });

    await runScenario({
      label: "wolf_block_then_attack",
      enemyId: "enemy_lobo_borde",
      actions: ["block", "attack", "dodge"],
      terrainTags: ["forest", "roots"],
      thresholds: {
        allowedStatuses: ["active", "won", "enemy_fled"],
        maxPlayerHit: 20,
        maxNpcHit: 18,
        minLucasLifeAfter: 68,
        maxInjuries: 3,
      },
    });

    await runScenario({
      label: "bandit_dagger_shield_leather",
      enemyId: "enemy_bandido_menor",
      equipment: {
        weapons: ["item_escudo_madera_simple", "item_daga_simple"],
        armor: ["item_chaleco_cuero_ligero"],
      },
      actions: ["attack", "block", "attack"],
      terrainTags: ["road"],
      thresholds: {
        allowedStatuses: ["active", "won", "enemy_fled"],
        maxPlayerHit: 24,
        maxNpcHit: 20,
        minLucasLifeAfter: 65,
        requiresArmorReduction: 2,
        expectedPlayerWeapon: "Daga simple",
        maxInjuries: 3,
      },
    });

    await runScenario({
      label: "boar_retreat_under_pressure",
      enemyId: "enemy_jabali_gris",
      actions: ["flee"],
      setupRetreat: true,
      terrainTags: ["forest"],
      thresholds: {
        allowedStatuses: ["active", "escaped"],
        maxNpcHit: 22,
        minLucasLifeAfter: 70,
      },
    });

    await runScenario({
      label: "sparring_damage_cap",
      enemyId: "enemy_lobo_borde",
      actions: ["attack", "attack"],
      combatMode: "sparring",
      terrainTags: ["guild_patio"],
      thresholds: {
        allowedStatuses: ["active", "won", "enemy_fled"],
        maxPlayerHit: 2,
        maxNpcHit: 2,
        minLucasLifeAfter: 94,
        maxInjuries: 0,
      },
    });
  } finally {
    await cleanupTempState();
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
  ]);
  assertEqual(
    leftovers.reduce((total, count) => total + count, 0),
    0,
    "combat balance cleanup must leave no temporary documents"
  );

  console.log(`Combat balance scenarios: ${results.length}`);
  console.log("Combat advanced C11 balance audit OK.");
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error("Combat advanced C11 balance audit FAILED:", error.message);
  try {
    await cleanupTempState();
  } catch (cleanupError) {
    console.error("Cleanup after failed balance audit also failed:", cleanupError.message);
  }
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
