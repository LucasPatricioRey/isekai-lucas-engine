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
const Commitment = require("../models/Commitment");
const NpcRelationship = require("../models/NpcRelationship");
const WorldDocumentIndex = require("../models/WorldDocumentIndex");
const { eventGameFilter } = require("../services/dailyEventSchedulerService");

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildRegex(query) {
  return new RegExp(escapeRegex(query), "i");
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSearchTokens(query) {
  const stopwords = new Set([
    "con",
    "del",
    "para",
    "por",
    "que",
    "los",
    "las",
    "una",
    "uno",
    "como",
    "sobre",
    "esto",
    "esta",
    "este",
    "mensaje",
  ]);

  return Array.from(new Set(normalizeSearchText(query).split(" ")))
    .filter((token) => token.length >= 3 && !stopwords.has(token))
    .slice(0, 8);
}

function scoreDocSearchResult(doc, rawQuery, tokens) {
  const exactRegex = buildRegex(rawQuery);
  const normalized = normalizeSearchText(
    `${doc.docId} ${doc.source} ${doc.section} ${doc.title} ${doc.content} ${(doc.tags || []).join(" ")}`
  );
  let score = 0;

  if (exactRegex.test(doc.title || "")) score += 10;
  if (exactRegex.test(doc.section || "")) score += 8;
  if (exactRegex.test(doc.content || "")) score += 5;

  for (const token of tokens) {
    if (normalizeSearchText(doc.title).includes(token)) score += 4;
    if (normalizeSearchText(doc.section).includes(token)) score += 3;
    if (normalized.includes(token)) score += 1;
  }

  return score;
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
    commitments,
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
      $and: [
        eventGameFilter(gameId),
        {
          $or: [
            { eventId: regex },
            { templateId: regex },
            { title: regex },
            { type: regex },
            { cause: regex },
            { tags: regex },
          ],
        },
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

    Commitment.find({
      gameId,
      $or: [
        { commitmentId: regex },
        { title: regex },
        { summary: regex },
        { type: regex },
        { status: regex },
        { targetNpcIds: regex },
        { tags: regex },
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
      commitments,
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
  const tokens = getSearchTokens(q);
  const tokenRegexes = tokens.map((token) => buildRegex(token));
  const tokenClauses = tokenRegexes.map((tokenRegex) => ({
    $or: [
      { docId: tokenRegex },
      { source: tokenRegex },
      { section: tokenRegex },
      { title: tokenRegex },
      { content: tokenRegex },
      { searchText: tokenRegex },
      { tags: tokenRegex },
    ],
  }));

  const query = {
    $or: [
      { docId: regex },
      { source: regex },
      { section: regex },
      { title: regex },
      { content: regex },
      { searchText: regex },
      { tags: regex },
      ...(tokenClauses.length > 0 ? [{ $and: tokenClauses.slice(0, 5) }] : []),
      ...(tokenClauses.length > 0 ? tokenClauses : []),
    ],
  };

  const docs = await WorldDocumentIndex.find(query).limit(50).lean();
  const ranked = docs
    .map((doc) => ({
      ...doc,
      searchScore: scoreDocSearchResult(doc, q, tokens),
    }))
    .filter((doc) => doc.searchScore > 0 || docs.length <= 20)
    .sort((a, b) => b.searchScore - a.searchScore)
    .slice(0, 20);

  return res.json({
    ok: true,
    query: q,
    tokens,
    results: ranked,
  });
}

module.exports = {
  searchDb,
  searchDocs,
};
