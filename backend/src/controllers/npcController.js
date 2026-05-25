const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const Rumor = require("../models/Rumor");
const EventLog = require("../models/EventLog");
const RoutineOverride = require("../models/RoutineOverride");

async function getNpcFull(req, res) {
  const { npcId } = req.params;

  const npc = await Npc.findOne({ npcId }).lean();

  if (!npc) {
    return res.status(404).json({
      ok: false,
      error: `No existe NPC con id: ${npcId}`,
    });
  }

  const [memories, rumors, recentEventLogs, routineOverrides] = await Promise.all([
    NpcMemory.find({ npcId })
      .sort({ importance: -1, createdDay: -1, createdTime: -1 })
      .limit(50)
      .lean(),

    Rumor.find({
      $or: [
        { knownByNpcIds: npcId },
        { content: new RegExp(npc.name, "i") },
      ],
    })
      .sort({ createdDay: -1, createdTime: -1 })
      .limit(20)
      .lean(),

    EventLog.find({ involvedNpcIds: npcId })
      .sort({ day: -1, timeStart: -1 })
      .limit(30)
      .lean(),

    RoutineOverride.find({ npcId })
      .sort({ day: -1, timeStart: -1 })
      .limit(20)
      .lean(),
  ]);

  return res.json({
    ok: true,
    npc,
    memories,
    rumors,
    recentEventLogs,
    routineOverrides,
  });
}

module.exports = {
  getNpcFull,
};
