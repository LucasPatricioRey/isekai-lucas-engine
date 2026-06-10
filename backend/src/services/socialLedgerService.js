const NpcSocialLedger = require("../models/NpcSocialLedger");

const SOCIAL_RELATIONSHIP_FIELDS = [
  "trust",
  "familiarity",
  "affection",
  "suspicion",
  "respect",
  "fear",
  "jealousy",
  "socialDebt",
];

const SOCIAL_DAILY_POSITIVE_CAPS = {
  trust: 3,
  familiarity: 5,
  affection: 2,
  suspicion: 6,
  respect: 3,
  fear: 6,
  jealousy: 2,
  socialDebt: 3,
};

const SOCIAL_FIELD_RANGES = {
  trust: { min: 0, max: 100 },
  familiarity: { min: 0, max: 100 },
  affection: { min: 0, max: 100 },
  suspicion: { min: 0, max: 100 },
  respect: { min: 0, max: 100 },
  fear: { min: 0, max: 100 },
  jealousy: { min: 0, max: 100 },
  socialDebt: { min: -100, max: 100 },
};

const SOCIAL_BANDS = [
  { key: "none", label: "nulo/casi inexistente", min: 0, max: 9, nextAt: 10 },
  { key: "low", label: "bajo", min: 10, max: 24, nextAt: 25 },
  { key: "moderate", label: "moderado", min: 25, max: 49, nextAt: 50 },
  { key: "high", label: "alto", min: 50, max: 69, nextAt: 70 },
  { key: "very_high", label: "muy alto", min: 70, max: 89, nextAt: 90 },
  { key: "exceptional", label: "excepcional", min: 90, max: 100, nextAt: null },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createLedgerId({ gameId, npcId, day }) {
  return `social_${gameId}_${npcId}_d${day}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeActionType(value = "") {
  return String(value || "general")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "general";
}

function normalizeRelationship(relationship = {}) {
  const normalized = {};

  for (const field of SOCIAL_RELATIONSHIP_FIELDS) {
    const range = SOCIAL_FIELD_RANGES[field];
    const rawValue = Number(relationship[field]);
    normalized[field] = clamp(Number.isFinite(rawValue) ? rawValue : 0, range.min, range.max);
  }

  normalized.notes = relationship.notes || "";
  return normalized;
}

function relationshipBand(value = 0) {
  const normalized = clamp(Number(value) || 0, 0, 100);
  return SOCIAL_BANDS.find((band) => normalized >= band.min && normalized <= band.max) || SOCIAL_BANDS[0];
}

function buildEmptyDeltas() {
  return Object.fromEntries(SOCIAL_RELATIONSHIP_FIELDS.map((field) => [field, 0]));
}

function normalizeDeltas(input = {}) {
  const deltas = buildEmptyDeltas();

  for (const field of SOCIAL_RELATIONSHIP_FIELDS) {
    const value = input[field] ?? input[`${field}Delta`] ?? 0;
    deltas[field] = Number.isInteger(value) ? value : 0;
  }

  return deltas;
}

function hasNonZeroDelta(deltas = {}) {
  return SOCIAL_RELATIONSHIP_FIELDS.some((field) => (deltas[field] || 0) !== 0);
}

function positiveUsageFromLedger(entries = []) {
  const usage = buildEmptyDeltas();
  const actionTypeCounts = {};

  for (const entry of entries) {
    const applied = entry.appliedDeltas || {};
    for (const field of SOCIAL_RELATIONSHIP_FIELDS) {
      const delta = Number(applied[field]) || 0;
      if (delta > 0) usage[field] += delta;
    }

    const actionType = normalizeActionType(entry.actionType || "general");
    actionTypeCounts[actionType] = (actionTypeCounts[actionType] || 0) + 1;
  }

  return { usage, actionTypeCounts };
}

async function getDailySocialLedger({ gameId, npcId, day, session = null }) {
  return NpcSocialLedger.find({ gameId, npcId, day }).session(session).lean();
}

async function getDailySocialUsage({ gameId, npcId, day, session = null }) {
  const entries = await getDailySocialLedger({ gameId, npcId, day, session });
  return {
    entries,
    ...positiveUsageFromLedger(entries),
  };
}

function applyDailySocialCaps({
  requestedDeltas,
  currentUsage,
  actionType = "general",
  overrideDailyCap = false,
  overrideReason = "",
} = {}) {
  const requested = normalizeDeltas(requestedDeltas);
  const applied = buildEmptyDeltas();
  const capDetails = {};
  const warnings = [];
  const normalizedActionType = normalizeActionType(actionType);
  const repeatedCount = (currentUsage?.actionTypeCounts || {})[normalizedActionType] || 0;

  for (const field of SOCIAL_RELATIONSHIP_FIELDS) {
    const requestedDelta = requested[field] || 0;
    const dailyCap = SOCIAL_DAILY_POSITIVE_CAPS[field] ?? 3;
    const used = currentUsage?.usage?.[field] || 0;
    let appliedDelta = requestedDelta;
    let capped = false;
    let reason = "";

    if (requestedDelta > 0 && !overrideDailyCap) {
      const remaining = Math.max(0, dailyCap - used);
      appliedDelta = Math.min(requestedDelta, remaining);
      capped = appliedDelta !== requestedDelta;
      if (capped) reason = `daily_cap_${field}`;

      if (repeatedCount >= 2 && ["trust", "respect", "affection", "familiarity"].includes(field)) {
        const antiFarmedDelta = Math.min(appliedDelta, 1);
        if (antiFarmedDelta !== appliedDelta) {
          appliedDelta = antiFarmedDelta;
          capped = true;
          reason = reason || "repeated_action_type";
        }
      }
    }

    applied[field] = appliedDelta;
    capDetails[field] = {
      requested: requestedDelta,
      applied: appliedDelta,
      usedToday: used,
      dailyCap,
      remainingAfter: requestedDelta > 0 ? Math.max(0, dailyCap - used - Math.max(0, appliedDelta)) : Math.max(0, dailyCap - used),
      capped,
      reason,
    };

    if (capped) warnings.push(`${field} capped: requested ${requestedDelta}, applied ${appliedDelta}`);
  }

  return {
    requestedDeltas: requested,
    appliedDeltas: applied,
    caps: {
      dailyPositiveCaps: SOCIAL_DAILY_POSITIVE_CAPS,
      actionType: normalizedActionType,
      repeatedActionTypeCount: repeatedCount,
      overrideDailyCap: Boolean(overrideDailyCap),
      overrideReason: overrideReason || "",
      fields: capDetails,
      warnings,
    },
  };
}

async function createSocialLedgerEntry({
  gameId,
  characterId = "char_lucas",
  npcId,
  day,
  time,
  actionType = "general",
  reason,
  source = "applyTurn",
  requestedDeltas,
  appliedDeltas,
  before,
  after,
  caps,
  sourceEventId = "",
  sourceMissionId = "",
  sourceEventLogId = "",
  tags = [],
  session = null,
}) {
  if (!hasNonZeroDelta(appliedDeltas)) return null;

  const [entry] = await NpcSocialLedger.create(
    [
      {
        ledgerId: createLedgerId({ gameId, npcId, day }),
        gameId,
        characterId,
        npcId,
        day,
        time,
        actionType: normalizeActionType(actionType),
        reason,
        source,
        requestedDeltas: normalizeDeltas(requestedDeltas),
        appliedDeltas: normalizeDeltas(appliedDeltas),
        before,
        after,
        caps,
        sourceEventId,
        sourceMissionId,
        sourceEventLogId,
        tags,
      },
    ],
    { session }
  );

  return entry.toObject();
}

function summarizeDailySocialUsage(usage = {}) {
  return {
    usage: usage.usage || buildEmptyDeltas(),
    dailyPositiveCaps: SOCIAL_DAILY_POSITIVE_CAPS,
    actionTypeCounts: usage.actionTypeCounts || {},
    entryCount: (usage.entries || []).length,
  };
}

module.exports = {
  SOCIAL_BANDS,
  SOCIAL_DAILY_POSITIVE_CAPS,
  SOCIAL_FIELD_RANGES,
  SOCIAL_RELATIONSHIP_FIELDS,
  applyDailySocialCaps,
  buildEmptyDeltas,
  createSocialLedgerEntry,
  getDailySocialLedger,
  getDailySocialUsage,
  hasNonZeroDelta,
  normalizeActionType,
  normalizeDeltas,
  normalizeRelationship,
  relationshipBand,
  summarizeDailySocialUsage,
};
