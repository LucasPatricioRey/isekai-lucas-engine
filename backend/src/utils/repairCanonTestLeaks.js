try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional; MONGODB_URI can come from the host environment.
}

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const BiologicalAccumulationArchive = require("../models/BiologicalAccumulationArchive");
const Checkpoint = require("../models/Checkpoint");
const CombatEncounter = require("../models/CombatEncounter");
const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");
const JobContract = require("../models/JobContract");
const KnowledgeRecord = require("../models/KnowledgeRecord");
const Location = require("../models/Location");
const Mission = require("../models/Mission");
const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const TurnTrace = require("../models/TurnTrace");
const WeatherState = require("../models/WeatherState");
const WorldEvent = require("../models/WorldEvent");
const { buildStateAudit } = require("../services/stateAuditService");

const CANON_GAME_ID = "isekai_lucas_main";
const REPAIR_SOURCE = "canon_test_leak_repair_2026_06_16";
const TEST_GAME_ID = /^test_/;

function wantsApply() {
  return process.argv.includes("--apply") || process.argv.includes("--write");
}

function summarizeDocs(docs = [], idField = "_id", limit = 20) {
  return docs.slice(0, limit).map((doc) => String(doc[idField] || doc._id || ""));
}

async function closeTestMissions({ apply = false } = {}) {
  const query = {
    $or: [
      { missionId: /^mission_test_/ },
      { "flags.testSuite": true },
    ],
    status: { $in: ["available", "accepted", "blocked"] },
  };
  const docs = await Mission.find(query).sort({ missionId: 1 }).lean();
  if (apply && docs.length) {
    await Mission.updateMany(query, {
      $set: {
        status: "withdrawn",
        "flags.canonHidden": true,
        "flags.hiddenFromCanonReason": "test_suite_fixture",
        "flags.repairSource": REPAIR_SOURCE,
      },
    });
  }
  return {
    collection: "missions",
    action: "withdraw_open_test_missions",
    count: docs.length,
    ids: summarizeDocs(docs, "missionId"),
  };
}

async function closeTestJobContracts({ apply = false } = {}) {
  const query = {
    $or: [
      { contractId: /^contract_test_/ },
      { contractId: /^job_contract_test_/ },
      { "flags.testSuite": true },
      { tags: "testSuite" },
    ],
    status: "active",
  };
  const docs = await JobContract.find(query).sort({ contractId: 1 }).lean();
  if (apply && docs.length) {
    for (const contract of await JobContract.find(query).exec()) {
      contract.status = "ended";
      contract.shifts = (contract.shifts || []).map((shift) => ({
        ...(typeof shift.toObject === "function" ? shift.toObject() : shift),
        status: shift.status === "active" ? "ended" : shift.status,
      }));
      contract.flags = {
        ...(contract.flags || {}),
        canonHidden: true,
        hiddenFromCanonReason: "test_suite_fixture",
        repairSource: REPAIR_SOURCE,
      };
      contract.tags = Array.isArray(contract.tags) ? contract.tags : [];
      if (!contract.tags.includes(REPAIR_SOURCE)) contract.tags.push(REPAIR_SOURCE);
      contract.markModified("shifts");
      contract.markModified("flags");
      await contract.save();
    }
  }
  return {
    collection: "jobcontracts",
    action: "end_active_test_contracts",
    count: docs.length,
    ids: summarizeDocs(docs, "contractId"),
  };
}

async function cancelTestWorldEvents({ apply = false } = {}) {
  const query = {
    $or: [
      { eventId: /^event_test_/ },
      { gameId: TEST_GAME_ID },
      { tags: "testSuite" },
      { tags: "test_suite" },
    ],
    status: { $in: ["scheduled", "active"] },
  };
  const docs = await WorldEvent.find(query).sort({ gameId: 1, eventId: 1 }).lean();
  if (apply && docs.length) {
    await WorldEvent.updateMany(query, {
      $set: {
        status: "cancelled",
        "resolution.cancelledBy": REPAIR_SOURCE,
        "resolution.reason": "test fixture outside playable canon",
      },
      $addToSet: {
        tags: REPAIR_SOURCE,
      },
    });
  }
  return {
    collection: "worldevents",
    action: "cancel_open_test_events",
    count: docs.length,
    ids: summarizeDocs(docs, "eventId"),
  };
}

async function cancelTestCombatEncounters({ apply = false } = {}) {
  const query = {
    gameId: TEST_GAME_ID,
    status: "active",
  };
  const docs = await CombatEncounter.find(query).sort({ gameId: 1, encounterId: 1 }).lean();
  if (apply && docs.length) {
    await CombatEncounter.updateMany(query, {
      $set: {
        status: "cancelled",
        phase: "ending",
        reason: "Test encounter closed by canon leak repair.",
        "flags.repairSource": REPAIR_SOURCE,
      },
    });
  }
  return {
    collection: "combatencounters",
    action: "cancel_active_test_combats",
    count: docs.length,
    ids: summarizeDocs(docs, "encounterId"),
  };
}

async function deleteEphemeralTestDocs({ apply = false } = {}) {
  const targets = [
    { collection: "gamestates", model: GameState, query: { gameId: TEST_GAME_ID }, idField: "gameId" },
    { collection: "eventlogs", model: EventLog, query: { gameId: TEST_GAME_ID }, idField: "logId" },
    { collection: "turntraces", model: TurnTrace, query: { gameId: TEST_GAME_ID }, idField: "turnTraceId" },
    { collection: "checkpoints", model: Checkpoint, query: { gameId: TEST_GAME_ID }, idField: "checkpointId" },
    {
      collection: "biologicalaccumulationarchives",
      model: BiologicalAccumulationArchive,
      query: { gameId: TEST_GAME_ID },
      idField: "archiveId",
    },
    { collection: "knowledgerecords", model: KnowledgeRecord, query: { gameId: TEST_GAME_ID }, idField: "knowledgeId" },
    { collection: "weatherstates", model: WeatherState, query: { regionId: /^region_test_/ }, idField: "weatherId" },
    { collection: "locations", model: Location, query: { locationId: /^loc_test_/ }, idField: "locationId" },
    { collection: "npcs", model: Npc, query: { npcId: /^npc_test_/ }, idField: "npcId" },
    { collection: "npcmemories", model: NpcMemory, query: { npcId: /^npc_test_/ }, idField: "memoryId" },
  ];

  const summaries = [];
  for (const target of targets) {
    const docs = await target.model.find(target.query).sort({ [target.idField]: 1 }).limit(20).lean();
    const count = await target.model.countDocuments(target.query);
    if (apply && count) await target.model.deleteMany(target.query);
    summaries.push({
      collection: target.collection,
      action: "delete_ephemeral_test_docs",
      count,
      ids: summarizeDocs(docs, target.idField),
    });
  }
  return summaries;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for repair:canon-test-leaks.");
  }

  const apply = wantsApply();
  await connectDB();

  const changes = [
    await closeTestMissions({ apply }),
    await closeTestJobContracts({ apply }),
    await cancelTestWorldEvents({ apply }),
    await cancelTestCombatEncounters({ apply }),
    ...(await deleteEphemeralTestDocs({ apply })),
  ];

  const audit = await buildStateAudit({ gameId: CANON_GAME_ID });
  console.log("Canon test leak repair");
  console.log(`Mode: ${apply ? "apply" : "dry-run"}`);
  console.log(JSON.stringify({ changes, auditSummary: audit.summary }, null, 2));

  await mongoose.disconnect();

  if (apply && audit.issues.some((issue) => ["critical", "error"].includes(issue.severity))) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error("Canon test leak repair failed:", error.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
