try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional; MONGODB_URI can come from the host environment.
}

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const GameState = require("../models/GameState");
const Location = require("../models/Location");
const Npc = require("../models/Npc");
const NpcRelationship = require("../models/NpcRelationship");
const responseShaping = require("./responseShaping");

const CANON_NPC_IDS = [
  "npc_roberto_valen",
  "npc_fern",
  "npc_yara_mils",
  "npc_garrick_thorne",
  "npc_mara_vell",
  "npc_eddan_rusk",
  "npc_brann",
  "npc_pavo",
  "npc_borin",
  "npc_sella",
  "npc_liora",
  "npc_narek",
  "npc_kael",
  "npc_celia_dorn",
  "npc_irma",
  "npc_sael_nyra",
  "npc_oren",
  "npc_tessa",
  "npc_hilda_fen",
  "npc_rulan_veck",
  "npc_merek_sol",
  "npc_nia",
  "npc_doran",
  "npc_maelis",
  "npc_joren_pell",
];

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

function isMeaningfulProfile(profile = {}) {
  return (
    profile.schemaVersion === "emotional_profile_v1" &&
    Boolean(profile.defaultMood) &&
    (profile.coreDrives || []).length >= 2 &&
    (profile.coreFears || []).length >= 1 &&
    Boolean(profile.pride) &&
    (profile.visibleTells || []).length >= 2 &&
    Boolean(profile.copingStyle) &&
    Boolean(profile.contradiction) &&
    (profile.sceneHooks || []).length >= 1
  );
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for audit:npc-emotions.");
  }

  await connectDB();

  const issues = [];
  const warnings = [];
  const gameId = process.env.AUDIT_GAME_ID || "isekai_lucas_main";
  const [gameState, canonNpcs, seededRelationships] = await Promise.all([
    GameState.findOne({ gameId }).lean(),
    Npc.find({ npcId: { $in: CANON_NPC_IDS } }).sort({ npcId: 1 }).lean(),
    NpcRelationship.find({ tags: "c15" }).sort({ npcAId: 1, npcBId: 1 }).lean(),
  ]);

  const npcIds = canonNpcs.map((npc) => npc.npcId);
  const missingNpcIds = CANON_NPC_IDS.filter((npcId) => !npcIds.includes(npcId));
  const summaries = canonNpcs.map(responseShaping.summarizeNpc);
  const emotionalProfiles = summaries.map((npc) => npc.emotionalProfile);
  const dialogueProfiles = summaries.map((npc) => npc.dialogueProfile);
  const maxEmotionalProfileBytes = Math.max(
    0,
    ...emotionalProfiles.map((profile) => Buffer.byteLength(JSON.stringify(profile || {}), "utf8"))
  );
  const uniqueDefaultMoods = unique(emotionalProfiles.map((profile) => profile?.defaultMood));
  const uniqueVisibleTells = unique(emotionalProfiles.flatMap((profile) => profile?.visibleTells || []));

  section("NPC Emotional Profiles");
  console.log(`GameId: ${gameId}`);
  console.log(`Canon NPCs expected: ${CANON_NPC_IDS.length}`);
  console.log(`Canon NPCs found: ${canonNpcs.length}`);

  assertCondition(issues, "all expected canon NPCs exist", missingNpcIds.length === 0, missingNpcIds.join(", "));
  assertCondition(
    issues,
    "all canon NPCs expose emotional_profile_v1",
    emotionalProfiles.every((profile) => profile?.schemaVersion === "emotional_profile_v1")
  );
  assertCondition(
    issues,
    "all canon NPC profiles have usable emotional content",
    summaries.every((npc) => isMeaningfulProfile(npc.emotionalProfile))
  );
  assertCondition(
    issues,
    "emotional profiles stay compact",
    maxEmotionalProfileBytes <= 1300,
    `${maxEmotionalProfileBytes} bytes max`
  );
  assertCondition(
    issues,
    "NPC default moods are diverse",
    uniqueDefaultMoods.length >= 12,
    `${uniqueDefaultMoods.length} unique`
  );
  assertCondition(
    issues,
    "visible tells are diverse",
    uniqueVisibleTells.length >= 35,
    `${uniqueVisibleTells.length} unique`
  );

  section("Dialogue Subtext");
  assertCondition(
    issues,
    "dialogue profiles carry emotionalSubtext",
    dialogueProfiles.every((profile) => profile?.emotionalSubtext?.defaultMood !== undefined)
  );
  assertCondition(
    issues,
    "dialogue subtext includes guardrail against private interiority leak",
    dialogueProfiles.every((profile) => /No revelar interioridad privada/.test(profile?.emotionalSubtext?.rule || ""))
  );
  assertCondition(
    issues,
    "subtextSeed includes drives or fears",
    dialogueProfiles.every((profile) => /busca|teme/.test(profile?.subtextSeed || ""))
  );

  section("NPC-NPC Relationship Dynamics");
  assertCondition(issues, "seeded relationship hints exist", seededRelationships.length >= 12, String(seededRelationships.length));
  assertCondition(
    issues,
    "seeded relationships expose emotional tone",
    seededRelationships.every((relationship) => Boolean(relationship.emotionalTone))
  );
  assertCondition(
    issues,
    "seeded relationships expose interaction hints",
    seededRelationships.every((relationship) => (relationship.interactionHints || []).length >= 2)
  );
  assertCondition(
    issues,
    "seeded relationships expose boundaries",
    seededRelationships.every((relationship) => (relationship.boundaries || []).length >= 1)
  );

  const allRelationshipIds = seededRelationships.flatMap((relationship) => [relationship.npcAId, relationship.npcBId]);
  const involvedNpcs = summaries.filter((npc) => allRelationshipIds.includes(npc.npcId));
  const relationshipDynamics = responseShaping.buildSceneRelationshipDynamics({
    relationships: seededRelationships,
    nearbyNpcs: involvedNpcs,
    npcPresence: { visible: involvedNpcs, sameRoom: involvedNpcs, sameBuilding: [] },
  });

  assertCondition(
    issues,
    "scene relationship dynamics schema is exposed",
    relationshipDynamics.schemaVersion === "scene_relationship_dynamics_v1"
  );
  assertCondition(issues, "scene relationship dynamics summarizes pairs", relationshipDynamics.count >= 8, String(relationshipDynamics.count));
  assertCondition(
    issues,
    "relationship summaries preserve private-subtext guardrail",
    relationshipDynamics.pairs.every((pair) => /No revelar privateSubtext/.test(pair.rule || ""))
  );

  if (gameState?.locationId) {
    const currentLocation = await Location.findOne({ locationId: gameState.locationId }).lean();
    const sameRoom = summaries.filter((npc) => npc.currentLocationId === gameState.locationId);
    const liveSceneDynamics = responseShaping.buildSceneRelationshipDynamics({
      relationships: seededRelationships,
      nearbyNpcs: summaries,
      npcPresence: { visible: sameRoom, sameRoom, sameBuilding: [] },
    });
    console.log(`Live location: ${currentLocation?.name || gameState.locationId}`);
    console.log(`Live same-room relationship pairs: ${liveSceneDynamics.count}`);
  } else {
    warnings.push("No live GameState location was available for same-room relationship smoke check.");
  }

  if (warnings.length > 0) {
    section("Warnings");
    for (const warning of warnings) console.log(`WARN ${warning}`);
  }

  await mongoose.disconnect();

  section("Audit Result");
  if (issues.length > 0) {
    console.error("NPC emotions audit FAILED:");
    for (const issue of issues) console.error(`- ${issue}`);
    process.exit(1);
  }

  console.log("NPC emotions audit OK. No state was mutated.");
}

main().catch(async (error) => {
  console.error("NPC emotions audit failed:", error.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
