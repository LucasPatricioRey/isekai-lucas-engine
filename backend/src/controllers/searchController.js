const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const Rumor = require("../models/Rumor");
const Location = require("../models/Location");
const WorldEvent = require("../models/WorldEvent");
const Mission = require("../models/Mission");
const EventLog = require("../models/EventLog");
const Item = require("../models/Item");
const Shop = require("../models/Shop");
const Faction = require("../models/Faction");
const EnemyTemplate = require("../models/EnemyTemplate");
const CombatEncounter = require("../models/CombatEncounter");
const NpcRelationship = require("../models/NpcRelationship");
const WorldDocumentIndex = require("../models/WorldDocumentIndex");

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRegex(query) {
  return new RegExp(escapeRegex(query), "i");
}

async function searchDb(req, res) {
  const q = String(req.query.q || "").trim();
  const gameId = req.query.gameId || "isekai_lucas_main";

  if (!q) {
    return res.status(400).json({
      ok: false,
      error: "Falta query ?q=",
    });
  }

  const regex = buildRegex(q);

  const [
    npcs,
    npcMemories,
    rumors,
    locations,
    worldEvents,
    missions,
    eventLogs,
    items,
    shops,
    factions,
    enemyTemplates,
    combatEncounters,
    npcRelationships,
  ] = await Promise.all([
    Npc.find({
      $or: [
        { npcId: regex },
        { name: regex },
        { role: regex },
        { personality: regex },
        { knownPublicFacts: regex },
      ],
    }).limit(10).lean(),

    NpcMemory.find({
      $or: [
        { npcId: regex },
        { fact: regex },
        { summary: regex },
        { tags: regex },
      ],
    }).limit(10).lean(),

    Rumor.find({
      $or: [
        { rumorId: regex },
        { content: regex },
        { originalContent: regex },
        { origin: regex },
        { source: regex },
        { tags: regex },
      ],
    }).limit(10).lean(),

    Location.find({
      $or: [
        { locationId: regex },
        { name: regex },
        { type: regex },
        { tags: regex },
      ],
    }).limit(10).lean(),

    WorldEvent.find({
      $or: [
        { eventId: regex },
        { title: regex },
        { type: regex },
        { cause: regex },
        { tags: regex },
      ],
    }).limit(10).lean(),

    Mission.find({
      $or: [
        { missionId: regex },
        { title: regex },
        { description: regex },
        { requirements: regex },
      ],
    }).limit(10).lean(),

    EventLog.find({
      gameId,
      $or: [
        { logId: regex },
        { type: regex },
        { summary: regex },
        { tags: regex },
      ],
    }).sort({ day: -1, timeStart: -1 }).limit(10).lean(),

    Item.find({
      $or: [
        { itemId: regex },
        { name: regex },
        { type: regex },
        { description: regex },
        { tags: regex },
      ],
    }).limit(10).lean(),

    Shop.find({
      $or: [
        { shopId: regex },
        { name: regex },
        { type: regex },
        { tags: regex },
      ],
    }).limit(10).lean(),

    Faction.find({
      $or: [
        { factionId: regex },
        { name: regex },
        { type: regex },
        { goals: regex },
        { knownFactsAboutLucas: regex },
      ],
    }).limit(10).lean(),

    EnemyTemplate.find({
      $or: [
        { enemyId: regex },
        { name: regex },
        { type: regex },
        { dangerLevel: regex },
        { rankHint: regex },
        { behavior: regex },
        { zones: regex },
        { signals: regex },
        { tags: regex },
      ],
    }).limit(10).lean(),

    CombatEncounter.find({
      $or: [
        { encounterId: regex },
        { enemyId: regex },
        { enemyName: regex },
        { status: regex },
        { locationId: regex },
      ],
    }).limit(10).lean(),

    NpcRelationship.find({
      $or: [
        { relationshipId: regex },
        { npcAId: regex },
        { npcBId: regex },
        { type: regex },
        { publicSummary: regex },
        { privateNotes: regex },
        { source: regex },
        { tags: regex },
      ],
    }).limit(10).lean(),
  ]);

  return res.json({
    ok: true,
    query: q,
    results: {
      npcs,
      npcMemories,
      rumors,
      locations,
      worldEvents,
      missions,
      eventLogs,
      items,
      shops,
      factions,
      enemyTemplates,
      combatEncounters,
      npcRelationships,
    },
  });
}

async function searchDocs(req, res) {
  const q = String(req.query.q || "").trim();

  if (!q) {
    return res.status(400).json({
      ok: false,
      error: "Falta query ?q=",
    });
  }

  const regex = buildRegex(q);

  const docs = await WorldDocumentIndex.find({
    $or: [
      { docId: regex },
      { source: regex },
      { section: regex },
      { title: regex },
      { content: regex },
      { tags: regex },
    ],
  }).limit(20).lean();

  return res.json({
    ok: true,
    query: q,
    results: docs,
  });
}

module.exports = {
  searchDb,
  searchDocs,
};
