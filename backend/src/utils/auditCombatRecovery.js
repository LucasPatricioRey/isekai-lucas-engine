try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional; MONGODB_URI can come from the host environment.
}

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const Checkpoint = require("../models/Checkpoint");
const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");
const InjuryRecord = require("../models/InjuryRecord");
const {
  applyInjuryRecovery,
  applyInjuryTreatment,
  previewInjuryRecovery,
  previewInjuryTreatment,
} = require("../services/combatAdvancedService");

const SOURCE_GAME_ID = process.env.AUDIT_GAME_ID || "isekai_lucas_main";
const RUN_ID = process.env.AUDIT_COMBAT_RECOVERY_RUN_ID || String(Date.now());
const GAME_ID = `combat_recovery_${RUN_ID}`;

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

function printCheck(label, details = {}) {
  console.log(`PASS ${label}: ${JSON.stringify(details)}`);
}

async function cleanupTempState() {
  await Promise.all([
    Checkpoint.deleteMany({ gameId: GAME_ID }),
    EventLog.deleteMany({ gameId: GAME_ID }),
    InjuryRecord.deleteMany({ gameId: GAME_ID }),
    GameState.deleteMany({ gameId: GAME_ID }),
  ]);
}

async function cloneGameState() {
  const source = await GameState.findOne({ gameId: SOURCE_GAME_ID }).lean();
  assertTrue(Boolean(source), "Live GameState is required as recovery audit source.", { sourceGameId: SOURCE_GAME_ID });

  await cleanupTempState();

  const clone = {
    ...source,
    gameId: GAME_ID,
  };
  delete clone._id;

  await GameState.create(clone);
}

async function createFixtureInjuries() {
  const gameState = await GameState.findOne({ gameId: GAME_ID });
  assertTrue(Boolean(gameState), "Temporary GameState must exist before fixture injuries.");

  const bleedingInjuryId = `injury_c13_bleeding_${RUN_ID}`;
  const recoveryInjuryId = `injury_c13_recovery_${RUN_ID}`;
  const healedInjuryId = `injury_c13_healed_${RUN_ID}`;

  await InjuryRecord.create([
    {
      injuryId: bleedingInjuryId,
      gameId: GAME_ID,
      encounterId: "",
      targetType: "character",
      targetId: "char_lucas",
      bodyPart: "right_arm",
      injuryType: "cut",
      severity: "minor",
      bleeding: 1,
      pain: 2,
      untreatedRisk: "low",
      requiresTreatment: true,
      createdDay: gameState.currentDay,
      createdTime: gameState.time,
      notes: "C13 recovery audit bleeding injury.",
    },
    {
      injuryId: recoveryInjuryId,
      gameId: GAME_ID,
      encounterId: "",
      targetType: "character",
      targetId: "char_lucas",
      bodyPart: "left_leg",
      injuryType: "sprain",
      severity: "minor",
      bleeding: 0,
      pain: 2,
      untreatedRisk: "low",
      requiresTreatment: false,
      treated: true,
      treatmentQuality: "basic",
      expectedRecoveryDays: 0,
      healingProgress: 0,
      recoveryHoursRemaining: 18,
      status: "healing",
      createdDay: gameState.currentDay,
      createdTime: gameState.time,
      notes: "C13 recovery audit healing injury.",
    },
    {
      injuryId: healedInjuryId,
      gameId: GAME_ID,
      encounterId: "",
      targetType: "character",
      targetId: "char_lucas",
      bodyPart: "left_arm",
      injuryType: "cut",
      severity: "scratch",
      bleeding: 0,
      pain: 1,
      untreatedRisk: "low",
      requiresTreatment: false,
      treated: true,
      expectedRecoveryDays: 0,
      healingProgress: 0,
      recoveryHoursRemaining: 6,
      status: "healing",
      createdDay: gameState.currentDay,
      createdTime: gameState.time,
      notes: "C13 recovery audit closing injury.",
    },
  ]);

  gameState.lucasStatus.injuries.push(
    {
      injuryId: recoveryInjuryId,
      location: "left_leg",
      severity: "leve",
      description: "C13 recovery audit healing injury.",
      effects: ["dolor 2"],
      createdDay: gameState.currentDay,
      createdTime: gameState.time,
    },
    {
      injuryId: healedInjuryId,
      location: "left_arm",
      severity: "leve",
      description: "C13 recovery audit closing injury.",
      effects: ["dolor 1"],
      createdDay: gameState.currentDay,
      createdTime: gameState.time,
    }
  );
  await gameState.save();

  return {
    bleedingInjuryId,
    recoveryInjuryId,
    healedInjuryId,
    lifeBefore: gameState.lucasStatus.life.current,
  };
}

async function runRecoveryScenario() {
  const { bleedingInjuryId, recoveryInjuryId, healedInjuryId, lifeBefore } = await createFixtureInjuries();

  const blockedRecovery = await previewInjuryRecovery({
    gameId: GAME_ID,
    injuryId: bleedingInjuryId,
    hours: 8,
    restQuality: "good",
    careLevel: "self",
    activityLevel: "rest",
  });
  assertEqual(blockedRecovery.canRecover, false, "bleeding injury recovery must be blocked before treatment");
  assertTrue(blockedRecovery.blockedReason.includes("sangrado estabilizado"), "blocked preview must explain active bleeding.");
  printCheck("active bleeding blocks recovery", { injuryId: bleedingInjuryId });

  const treatmentPreview = await previewInjuryTreatment({
    gameId: GAME_ID,
    injuryId: bleedingInjuryId,
    treatmentType: "field_dressing",
    quality: "good",
  });
  assertEqual(treatmentPreview.canTreat, true, "bleeding injury treatment must be actionable");
  assertEqual(treatmentPreview.mutation?.willRestoreLife, false, "treatment preview must not restore life");

  const treatment = await applyInjuryTreatment({
    gameId: GAME_ID,
    injuryId: bleedingInjuryId,
    treatmentType: "field_dressing",
    quality: "good",
  });
  assertEqual(treatment.injury?.bleeding, 0, "field dressing must stabilize bleeding");
  assertEqual(treatment.injury?.status, "healing", "treated bleeding injury must enter healing status");
  printCheck("treatment stabilizes without life", { injuryId: bleedingInjuryId, status: treatment.injury?.status });

  const recoveryPreview = await previewInjuryRecovery({
    gameId: GAME_ID,
    injuryId: recoveryInjuryId,
    hours: 8,
    restQuality: "good",
    careLevel: "trained",
    activityLevel: "rest",
  });
  assertEqual(recoveryPreview.canRecover, true, "treated injury recovery preview must be actionable");
  assertEqual(recoveryPreview.mutation?.willRestoreLife, false, "recovery preview must not restore life");
  assertEqual(recoveryPreview.mutation?.willAdvanceClock, false, "recovery preview must not advance clock");

  const recovery = await applyInjuryRecovery({
    gameId: GAME_ID,
    injuryId: recoveryInjuryId,
    hours: 8,
    restQuality: "good",
    careLevel: "trained",
    activityLevel: "rest",
  });
  assertTrue(recovery.injury?.healingProgress > 0, "recovery apply must increase healingProgress");
  assertTrue(recovery.injury?.recoveryHoursRemaining < 18, "recovery apply must reduce remaining hours");
  assertEqual(recovery.recovery?.status?.after, "healing", "partial recovery must remain healing");
  printCheck("partial recovery applies", {
    injuryId: recoveryInjuryId,
    healingProgress: recovery.injury?.healingProgress,
    remaining: recovery.injury?.recoveryHoursRemaining,
  });

  let duplicateBlocked = false;
  try {
    await applyInjuryRecovery({
      gameId: GAME_ID,
      injuryId: recoveryInjuryId,
      hours: 8,
      restQuality: "basic",
      careLevel: "self",
      activityLevel: "rest",
    });
  } catch (error) {
    duplicateBlocked = /timestamp actual/.test(error.message);
  }
  assertEqual(duplicateBlocked, true, "same timestamp recovery must be blocked");
  printCheck("same timestamp recovery blocked", { injuryId: recoveryInjuryId });

  const healed = await applyInjuryRecovery({
    gameId: GAME_ID,
    injuryId: healedInjuryId,
    hours: 8,
    restQuality: "excellent",
    careLevel: "healer",
    activityLevel: "rest",
  });
  assertEqual(healed.injury?.status, "healed", "sufficient recovery must mark healed");
  assertEqual(healed.injury?.recoveryHoursRemaining, 0, "healed injury must have no remaining hours");
  assertEqual(healed.injury?.pain, 0, "healed fixture must clear pain");
  printCheck("full recovery closes injury", { injuryId: healedInjuryId });

  const afterState = await GameState.findOne({ gameId: GAME_ID }).lean();
  assertEqual(afterState.lucasStatus.life.current, lifeBefore, "C13 recovery must not restore life");
  const legacy = afterState.lucasStatus.injuries.find((entry) => entry.injuryId === healedInjuryId);
  assertEqual(legacy?.status, "healed", "legacy Lucas injury summary must show healed status");
  assertTrue(legacy?.effects?.includes("curada"), "legacy Lucas injury summary must include cured marker");
  printCheck("life and legacy sync verified", { life: afterState.lucasStatus.life.current, legacyStatus: legacy?.status });
}

async function main() {
  console.log("Combat advanced C13 recovery audit");
  console.log(`Source gameId: ${SOURCE_GAME_ID}`);
  console.log(`Temp gameId: ${GAME_ID}`);

  await connectDB();

  try {
    await cleanupTempState();
    await cloneGameState();
    await runRecoveryScenario();
  } finally {
    await cleanupTempState();
  }

  const leftovers = await Promise.all([
    GameState.countDocuments({ gameId: GAME_ID }),
    InjuryRecord.countDocuments({ gameId: GAME_ID }),
    Checkpoint.countDocuments({ gameId: GAME_ID }),
    EventLog.countDocuments({ gameId: GAME_ID }),
  ]);
  assertTrue(leftovers.every((count) => count === 0), "temporary C13 recovery docs must be cleaned", { leftovers });

  await mongoose.disconnect();
  console.log("Combat advanced C13 recovery audit OK.");
}

main().catch(async (error) => {
  console.error("\nCombat C13 recovery audit failed:");
  console.error(error);
  await cleanupTempState().catch(() => {});
  await mongoose.disconnect();
  process.exit(1);
});
