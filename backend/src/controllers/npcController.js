const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const Rumor = require("../models/Rumor");
const EventLog = require("../models/EventLog");
const RoutineOverride = require("../models/RoutineOverride");
const NpcRelationship = require("../models/NpcRelationship");
const NpcSocialLedger = require("../models/NpcSocialLedger");
const { previewSocialImpact } = require("../services/socialImpactService");
const responseShaping = require("../utils/responseShaping");

async function getNpcFull(req, res) {
  const { npcId } = req.params;
  const gameId = req.query.gameId || "isekai_lucas_main";
  const memoryLimit = responseShaping.toIntQuery(req.query.memoryLimit, 20, 0, 50);
  const rumorLimit = responseShaping.toIntQuery(req.query.rumorLimit, 10, 0, 20);
  const logLimit = responseShaping.toIntQuery(req.query.logLimit, 10, 0, 30);
  const routineLimit = responseShaping.toIntQuery(req.query.routineLimit, 10, 0, 20);
  const relationshipLimit = responseShaping.toIntQuery(req.query.relationshipLimit, 20, 0, 50);
  const socialLedgerLimit = responseShaping.toIntQuery(req.query.socialLedgerLimit, 10, 0, 30);
  const includeMechanicalChanges = responseShaping.queryBoolean(req.query.includeMechanicalChanges, false);

  const npc = await Npc.findOne({ npcId }).lean();

  if (!npc) {
    return res.status(404).json({
      ok: false,
      error: `No existe NPC con id: ${npcId}`,
    });
  }

  const [memories, rumors, recentEventLogs, routineOverrides, socialRelationships, socialLedger] = await Promise.all([
    NpcMemory.find({ npcId })
      .sort({ importance: -1, createdDay: -1, createdTime: -1 })
      .limit(memoryLimit)
      .lean(),

    Rumor.find({
      $or: [
        { knownByNpcIds: npcId },
        { content: new RegExp(npc.name, "i") },
      ],
    })
      .sort({ createdDay: -1, createdTime: -1 })
      .limit(rumorLimit)
      .lean(),

    EventLog.find({ gameId, involvedNpcIds: npcId })
      .sort({ day: -1, timeStart: -1 })
      .limit(logLimit)
      .lean(),

    RoutineOverride.find({ npcId })
      .sort({ day: -1, timeStart: -1 })
      .limit(routineLimit)
      .lean(),

    NpcRelationship.find({
      $or: [{ npcAId: npcId }, { npcBId: npcId }],
    })
      .sort({ familiarity: -1, trust: -1 })
      .limit(relationshipLimit)
      .lean(),

    NpcSocialLedger.find({ gameId, npcId })
      .sort({ day: -1, time: -1, createdAt: -1 })
      .limit(socialLedgerLimit)
      .lean(),
  ]);
  const npcSummary = responseShaping.summarizeNpc(npc);

  return res.json({
    ok: true,
    npc,
    npcSummary,
    relationshipState: npcSummary.relationshipState,
    memories,
    rumors,
    recentEventLogs: recentEventLogs.map((log) =>
      responseShaping.summarizeEventLog(log, { includeMechanicalChanges })
    ),
    routineOverrides,
    socialRelationships,
    socialLedger: socialLedger.map(responseShaping.summarizeNpcSocialLedger),
  });
}

async function previewSocialImpactController(req, res) {
  try {
    const preview = await previewSocialImpact(req.body || {});

    return res.json({
      ok: true,
      dryRun: true,
      preview,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

module.exports = {
  getNpcFull,
  previewSocialImpactController,
};
