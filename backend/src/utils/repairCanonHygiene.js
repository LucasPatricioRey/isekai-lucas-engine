try {
  require("dotenv").config({ quiet: true });
} catch {
  // dotenv is optional; MONGODB_URI can come from the host environment.
}

const mongoose = require("mongoose");

const connectDB = require("../config/db");
const EventLog = require("../models/EventLog");
const GameState = require("../models/GameState");
const Mission = require("../models/Mission");
const { buildStateAudit } = require("../services/stateAuditService");
const { canonicalActiveMissionQuery } = require("../services/missionService");

const CANON_GAME_ID = "isekai_lucas_main";
const REPAIR_SOURCE = "c9_canon_hygiene";
const MAGIC_PERCEPTION_SKILL = {
  skillId: "skill_percepcion_magica",
  name: "Percepcion magica",
  phase: "Principiante",
  level: 1,
  exp: 0,
  expToNext: 100,
};

function createLogId() {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function repairOpenTestSuiteMissions(gameState, { dryRun = true } = {}) {
  const missions = await Mission.find({
    "flags.testSuite": true,
    status: { $in: ["available", "accepted", "blocked"] },
  })
    .sort({ status: 1, postedDay: -1, postedTime: -1 })
    .exec();

  const changes = [];
  for (const mission of missions) {
    changes.push({
      missionId: mission.missionId,
      fromStatus: mission.status,
      toStatus: "withdrawn",
    });

    if (dryRun) continue;

    mission.status = "withdrawn";
    mission.flags = {
      ...(mission.flags || {}),
      canonHidden: true,
      hiddenFromCanonReason: "test_suite_fixture",
      repairSource: REPAIR_SOURCE,
      repairedAtDay: gameState.currentDay,
      repairedAtTime: gameState.time,
    };
    mission.markModified("flags");
    await mission.save();
  }

  if (!dryRun) {
    await Mission.updateMany(
      {
        "flags.testSuite": true,
        status: { $in: ["completed", "failed", "expired", "withdrawn"] },
      },
      {
        $set: {
          "flags.canonHidden": true,
          "flags.hiddenFromCanonReason": "test_suite_fixture",
          "flags.repairSource": REPAIR_SOURCE,
        },
      }
    );
  }

  return changes;
}

async function reconcileActiveMissionIds(gameState, { dryRun = true } = {}) {
  const activeMissions = await Mission.find(canonicalActiveMissionQuery(gameState)).lean();
  const derivedIds = Array.from(new Set(activeMissions.map((mission) => mission.missionId).filter(Boolean))).sort();
  const beforeIds = Array.from(new Set(gameState.activeMissionIds || [])).sort();
  const changed =
    beforeIds.length !== derivedIds.length ||
    beforeIds.some((missionId, index) => missionId !== derivedIds[index]);

  if (changed && !dryRun) {
    gameState.activeMissionIds = derivedIds;
    gameState.markModified("activeMissionIds");
  }

  return {
    changed,
    before: beforeIds,
    after: derivedIds,
  };
}

async function ensureMagicPerceptionSkill(gameState, { dryRun = true } = {}) {
  const exists = (gameState.skills || []).some((skill) => skill.skillId === MAGIC_PERCEPTION_SKILL.skillId);

  if (!exists && !dryRun) {
    gameState.skills = [...(gameState.skills || []), MAGIC_PERCEPTION_SKILL];
    gameState.markModified("skills");
  }

  return {
    changed: !exists,
    skillId: MAGIC_PERCEPTION_SKILL.skillId,
  };
}

async function writeRepairLog(gameState, changes) {
  const hasChanges =
    changes.testSuiteMissions.length > 0 ||
    changes.activeMissionIds.changed ||
    changes.magicPerceptionSkill.changed;

  if (!hasChanges) return null;

  const log = await EventLog.create({
    logId: createLogId(),
    gameId: gameState.gameId,
    day: gameState.currentDay,
    timeStart: gameState.time,
    timeEnd: gameState.time,
    locationId: gameState.locationId,
    type: "state_hygiene_repair",
    summary: "Reparacion tecnica C9: fixtures testSuite ocultos, misiones activas reconciliadas y skill magica base asegurada.",
    involvedCharacterIds: ["char_lucas"],
    mechanicalChanges: changes,
    visibility: "hidden",
    source: "system_correction",
    tags: ["state_hygiene", REPAIR_SOURCE, "admin_fix"],
  });

  return log.logId;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required for repair:canon-hygiene.");
  }

  const write = process.argv.includes("--write");
  await connectDB();

  const gameState = await GameState.findOne({ gameId: CANON_GAME_ID });
  if (!gameState) throw new Error(`No existe GameState para gameId: ${CANON_GAME_ID}`);

  const changes = {
    testSuiteMissions: await repairOpenTestSuiteMissions(gameState, { dryRun: !write }),
    activeMissionIds: await reconcileActiveMissionIds(gameState, { dryRun: !write }),
    magicPerceptionSkill: await ensureMagicPerceptionSkill(gameState, { dryRun: !write }),
  };

  let logId = null;
  if (write) {
    await gameState.save();
    logId = await writeRepairLog(gameState, changes);
  }

  const audit = await buildStateAudit({ gameId: CANON_GAME_ID });
  console.log("Canon hygiene repair");
  console.log(`Mode: ${write ? "write" : "dry-run"}`);
  console.log(JSON.stringify({ changes, logId, auditSummary: audit.summary }, null, 2));

  await mongoose.disconnect();

  if (write && audit.issues.some((issue) => ["critical", "error"].includes(issue.severity))) {
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error("Canon hygiene repair failed:", error.message);
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  process.exit(1);
});
