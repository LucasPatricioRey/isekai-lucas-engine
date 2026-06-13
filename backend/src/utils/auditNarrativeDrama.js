try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional; MONGODB_URI can come from the host environment.
}

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const Character = require("../models/Character");
const GameState = require("../models/GameState");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const responseShaping = require("./responseShaping");

function section(title) {
  console.log(`\n=== ${title} ===`);
}

function assertCondition(issues, label, condition, evidence = "") {
  console.log(`${condition ? "PASS" : "FAIL"} ${label}${evidence ? `: ${evidence}` : ""}`);
  if (!condition) issues.push(label);
}

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function isDebugNpc(npc = {}) {
  const id = String(npc.npcId || "");
  return (
    id.startsWith("npc_test_") ||
    id.includes("_test_") ||
    npc.flags?.testSuite === true ||
    npc.flags?.debugOnly === true
  );
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:narrative-drama.");
  }

  await connectDB();

  const issues = [];
  const warnings = [];
  const gameId = process.env.AUDIT_GAME_ID || "isekai_lucas_main";
  const gameState = await GameState.findOne({ gameId }).lean();
  const [lucas, currentLocation, allNpcs] = await Promise.all([
    gameState ? Character.findOne({ characterId: gameState.characterId || "char_lucas" }).lean() : null,
    gameState ? Location.findOne({ locationId: gameState.locationId }).lean() : null,
    Npc.find({}).sort({ npcId: 1 }).lean(),
  ]);

  const npcs = allNpcs.filter((npc) => !isDebugNpc(npc));
  const npcSummaries = npcs.map(responseShaping.summarizeNpc);
  const sameRoom = npcSummaries.filter((npc) => npc.currentLocationId === gameState?.locationId);
  const gameStateSummary = responseShaping.summarizeGameState(gameState);
  const lucasSummary = responseShaping.summarizeLucasState(gameState, lucas, []);
  const dramaticContext = responseShaping.buildDramaticContext({
    gameState: gameStateSummary,
    lucasSummary,
    currentLocation: responseShaping.summarizeLocation(currentLocation),
    nearbyNpcs: npcSummaries.slice(0, 8),
    npcPresence: {
      visible: sameRoom,
      sameRoom,
      sameBuilding: [],
    },
  });

  section("Narrative Drama Audit");
  console.log(`GameId: ${gameId}`);
  console.log(`NPCs checked: ${npcs.length}`);
  console.log(`Debug/test NPCs ignored: ${allNpcs.length - npcs.length}`);

  section("NPC Dialogue Profiles");
  assertCondition(issues, "NPC collection is available", npcs.length > 0, String(npcs.length));
  assertCondition(
    issues,
    "all NPC summaries expose dialogueProfile",
    npcSummaries.every((npc) => npc.dialogueProfile?.schemaVersion === "dialogue_profile_v1")
  );
  assertCondition(
    issues,
    "all dialogue profiles expose relationship register",
    npcSummaries.every((npc) => Boolean(npc.dialogueProfile?.relationshipRegister?.key))
  );
  assertCondition(
    issues,
    "all dialogue profiles expose emotional temperature",
    npcSummaries.every((npc) => Boolean(npc.dialogueProfile?.emotionalTemperature?.key))
  );
  assertCondition(
    issues,
    "all NPC summaries expose emotionalProfile schema",
    npcSummaries.every((npc) => npc.emotionalProfile?.schemaVersion === "emotional_profile_v1")
  );
  assertCondition(
    issues,
    "all dialogue profiles expose emotional subtext",
    npcSummaries.every((npc) => npc.dialogueProfile?.emotionalSubtext?.rule)
  );
  assertCondition(
    issues,
    "all dialogue profiles expose anti-HUD dialogue guardrail",
    npcSummaries.every((npc) =>
      (npc.dialogueProfile?.avoid || []).some((line) => /HUD|mecanicas/.test(line))
    )
  );

  const speechStyles = unique(npcSummaries.map((npc) => npc.dialogueProfile?.speechRhythm));
  const registers = unique(npcSummaries.map((npc) => npc.dialogueProfile?.relationshipRegister?.key));
  const dialogueMoves = unique(npcSummaries.flatMap((npc) => npc.dialogueProfile?.dialogueMoves || []));
  const maxProfileBytes = Math.max(
    0,
    ...npcSummaries.map((npc) => Buffer.byteLength(JSON.stringify(npc.dialogueProfile || {}), "utf8"))
  );
  const missingSpeechStyle = npcs.filter((npc) => !npc.speechStyle).map((npc) => npc.npcId);
  const missingPersonality = npcs.filter((npc) => (npc.personality || []).length === 0).map((npc) => npc.npcId);

  assertCondition(
    issues,
    "dialogue profiles stay compact",
    maxProfileBytes <= 2400,
    `${maxProfileBytes} bytes max`
  );
  assertCondition(
    issues,
    "speech rhythms have useful diversity",
    npcs.length < 5 || speechStyles.length >= 3,
    `${speechStyles.length} unique`
  );
  assertCondition(
    issues,
    "relationship registers are computable",
    registers.length >= 1,
    registers.join(", ")
  );
  assertCondition(
    issues,
    "dialogue move library is populated",
    dialogueMoves.length >= 3,
    `${dialogueMoves.length} unique`
  );

  if (missingSpeechStyle.length > 0) warnings.push(`NPCs without speechStyle: ${missingSpeechStyle.slice(0, 12).join(", ")}`);
  if (missingPersonality.length > 0) warnings.push(`NPCs without personality tags: ${missingPersonality.slice(0, 12).join(", ")}`);

  section("Dramatic Context");
  assertCondition(issues, "dramaticContext schema is exposed", dramaticContext.schemaVersion === "dramatic_context_v1");
  assertCondition(issues, "dramaticContext keeps narrative first", dramaticContext.outputContract?.narrativeFirst === true);
  assertCondition(issues, "dramaticContext requires HUD", dramaticContext.outputContract?.hudRequired === true);
  assertCondition(
    issues,
    "dramaticContext separates prose from mechanics",
    /no inventa/.test(dramaticContext.outputContract?.mechanicsBoundary || "")
  );
  assertCondition(
    issues,
    "dramaticContext points to dialogueProfile",
    (dramaticContext.dialogueDirectives || []).some((line) => /dialogueProfile/.test(line))
  );
  assertCondition(
    issues,
    "dramaticContext points to emotionalProfile",
    (dramaticContext.dialogueDirectives || []).some((line) => /emotionalProfile/.test(line))
  );
  assertCondition(
    issues,
    "dramaticContext has a dramatic question",
    Boolean(dramaticContext.sceneTension?.dramaticQuestion)
  );

  if (warnings.length > 0) {
    section("Warnings");
    for (const warning of warnings) console.log(`WARN ${warning}`);
  }

  await mongoose.disconnect();

  section("Audit Result");
  if (issues.length > 0) {
    console.error("Narrative drama audit FAILED:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log("Narrative drama audit OK. No state was mutated.");
}

main().catch(async (error) => {
  console.error("Narrative drama audit failed:", error.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
