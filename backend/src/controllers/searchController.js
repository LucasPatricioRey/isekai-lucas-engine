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

function parseListQuery(value) {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseListQuery(entry));
  }

  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function parseLimit(value, fallback = 20, max = 50) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function scoreDocSearchResult(doc, rawQuery, tokens) {
  const exactRegex = rawQuery ? buildRegex(rawQuery) : null;
  const normalized = normalizeSearchText(
    [
      doc.docId,
      doc.source,
      doc.section,
      doc.title,
      doc.ruleId,
      doc.domain,
      doc.priority,
      doc.content,
      doc.template,
      ...(doc.appliesTo || []),
      ...(doc.must || []),
      ...(doc.never || []),
      ...(doc.tags || []),
    ].join(" ")
  );
  let score = 0;

  if (doc.ruleId && rawQuery && doc.ruleId === rawQuery) score += 80;
  if (doc.priority === "critical") score += 3;
  if (exactRegex?.test(doc.ruleId || "")) score += 30;
  if (exactRegex?.test(doc.title || "")) score += 10;
  if (exactRegex?.test(doc.section || "")) score += 8;
  if (exactRegex?.test(doc.domain || "")) score += 8;
  if (exactRegex?.test(doc.content || "")) score += 5;

  for (const token of tokens) {
    if (normalizeSearchText(doc.ruleId).includes(token)) score += 8;
    if (normalizeSearchText(doc.domain).includes(token)) score += 5;
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
  const ruleIds = parseListQuery(req.query.ruleId || req.query.ruleIds);
  const sources = parseListQuery(req.query.source || req.query.sources);
  const domains = parseListQuery(req.query.domain || req.query.domains);
  const priorities = parseListQuery(req.query.priority || req.query.priorities);
  const tags = parseListQuery(req.query.tag || req.query.tags);
  const appliesTo = parseListQuery(req.query.appliesTo);
  const limit = parseLimit(req.query.limit);
  const hasFilters =
    ruleIds.length > 0 ||
    sources.length > 0 ||
    domains.length > 0 ||
    priorities.length > 0 ||
    tags.length > 0 ||
    appliesTo.length > 0;

  if (!q && !hasFilters) {
    return res.status(400).json({
      ok: false,
      error: "Falta query ?q= o filtro ruleId/domain/source/tag/appliesTo.",
    });
  }

  const clauses = [];

  if (sources.length > 0) clauses.push({ source: { $in: sources } });
  if (ruleIds.length > 0) clauses.push({ ruleId: { $in: ruleIds } });
  if (domains.length > 0) clauses.push({ domain: { $in: domains } });
  if (priorities.length > 0) clauses.push({ priority: { $in: priorities } });
  if (tags.length > 0) clauses.push({ tags: { $all: tags } });
  if (appliesTo.length > 0) clauses.push({ appliesTo: { $in: appliesTo } });

  const tokens = getSearchTokens(q);
  if (q) {
    const regex = buildRegex(q);
    const tokenRegexes = tokens.map((token) => buildRegex(token));
    const tokenClauses = tokenRegexes.map((tokenRegex) => ({
      $or: [
        { docId: tokenRegex },
        { source: tokenRegex },
        { section: tokenRegex },
        { title: tokenRegex },
        { ruleId: tokenRegex },
        { domain: tokenRegex },
        { priority: tokenRegex },
        { content: tokenRegex },
        { searchText: tokenRegex },
        { appliesTo: tokenRegex },
        { tags: tokenRegex },
      ],
    }));

    clauses.push({
      $or: [
        { docId: regex },
        { source: regex },
        { section: regex },
        { title: regex },
        { ruleId: regex },
        { domain: regex },
        { priority: regex },
        { content: regex },
        { searchText: regex },
        { appliesTo: regex },
        { tags: regex },
        ...(tokenClauses.length > 0 ? [{ $and: tokenClauses.slice(0, 5) }] : []),
        ...(tokenClauses.length > 0 ? tokenClauses : []),
      ],
    });
  }

  const query = clauses.length > 0 ? { $and: clauses } : {};

  const docs = await WorldDocumentIndex.find(query).limit(Math.max(limit * 3, 50)).lean();
  const ranked = docs
    .map((doc) => ({
      ...doc,
      searchScore: scoreDocSearchResult(doc, q, tokens),
    }))
    .filter((doc) => doc.searchScore > 0 || !q || docs.length <= limit)
    .sort((a, b) => b.searchScore - a.searchScore)
    .slice(0, limit);

  return res.json({
    ok: true,
    query: q,
    filters: {
      ruleIds,
      sources,
      domains,
      priorities,
      tags,
      appliesTo,
      limit,
    },
    tokens,
    results: ranked,
  });
}

module.exports = {
  searchDb,
  searchDocs,
};
