const DAILY_EVENT_TAG = "daily_event";

const SOCIAL_OUTCOME_TAGS = {
  resolved: "social_consequence_resolved",
  resolved_partial: "social_consequence_resolved_partial",
  ignored: "social_consequence_ignored",
  failed: "social_consequence_failed",
};

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function isDailyEvent(event = {}) {
  if (event.countsAsMainEvent === false) return false;
  if (event.eventLayer && event.eventLayer !== "main_event") return false;
  return (event.tags || []).includes(DAILY_EVENT_TAG);
}

function isMajorEvent(event = {}) {
  return (
    ["major", "critical"].includes(event.severity) ||
    (event.tags || []).includes("daily_event_important") ||
    (event.tags || []).includes("requires_player_resolution")
  );
}

function buildResolvedDeltas(event = {}, outcome = "resolved") {
  const major = isMajorEvent(event);

  if (outcome === "resolved_partial") {
    return major
      ? { trustDelta: 1, respectDelta: 1, familiarityDelta: 1 }
      : { trustDelta: 1, familiarityDelta: 1 };
  }

  return major
    ? { trustDelta: 2, respectDelta: 2, familiarityDelta: 1, socialDebtDelta: 1 }
    : { trustDelta: 1, respectDelta: 1, familiarityDelta: 1 };
}

function buildNegativeDeltas(event = {}, outcome = "ignored") {
  const major = isMajorEvent(event);

  if (outcome === "failed") {
    return major
      ? { trustDelta: -2, respectDelta: -2, suspicionDelta: 1 }
      : { trustDelta: -1, respectDelta: -1, suspicionDelta: 1 };
  }

  return major
    ? { trustDelta: -2, respectDelta: -1, suspicionDelta: 1 }
    : { trustDelta: -1, respectDelta: -1 };
}

function buildDeltasForOutcome(event = {}, outcome = "resolved") {
  if (["resolved", "resolved_partial"].includes(outcome)) {
    return buildResolvedDeltas(event, outcome);
  }

  if (["ignored", "failed"].includes(outcome)) {
    return buildNegativeDeltas(event, outcome);
  }

  return {};
}

function inferSocialOutcome({ before = null, event = {}, patch = {}, forcedOutcome = "" } = {}) {
  if (patch.applySocialConsequences === false || forcedOutcome === "none" || patch.socialOutcome === "none") {
    return "none";
  }

  if (forcedOutcome) return forcedOutcome;
  if (patch.socialOutcome) return patch.socialOutcome;

  const beforeStatus = before?.status || "";
  const afterStatus = event.status || patch.status || beforeStatus;

  if (afterStatus === "resolved" && beforeStatus !== "resolved") return "resolved";
  if (afterStatus === "expired" && beforeStatus !== "expired") return "ignored";
  if (afterStatus === "consequences_applied" && beforeStatus !== "consequences_applied") return "ignored";

  return "none";
}

function alreadyApplied(event = {}, outcome = "") {
  const tags = event.tags || [];
  const outcomeTag = SOCIAL_OUTCOME_TAGS[outcome];
  if (!outcomeTag) return true;
  return tags.includes(outcomeTag) || tags.includes("social_consequence_applied");
}

function buildReason(event = {}, outcome = "resolved") {
  if (outcome === "resolved") {
    return `Lucas resolvio el evento diario "${event.title}" y los NPCs afectados lo registran.`;
  }
  if (outcome === "resolved_partial") {
    return `Lucas ayudo parcialmente con el evento diario "${event.title}".`;
  }
  if (outcome === "failed") {
    return `El evento diario "${event.title}" termino mal para los NPCs afectados.`;
  }
  return `El evento diario "${event.title}" vencio sin resolverse y deja una consecuencia social leve.`;
}

function buildSocialConsequenceEffect({ event = {}, outcome = "resolved", deltas = {}, npcIds = [] } = {}) {
  return {
    type: "social_consequence_applied",
    target: outcome,
    value: {
      outcome,
      affectedNpcIds: npcIds,
      relationshipDeltas: deltas,
      severity: event.severity || "minor",
      dailyEvent: isDailyEvent(event),
    },
    reason: buildReason(event, outcome),
  };
}

function buildSocialConsequenceHintEffect(event = {}) {
  const resolvedDeltas = buildDeltasForOutcome(event, "resolved");
  const ignoredDeltas = buildDeltasForOutcome(event, "ignored");

  return {
    type: "social_consequence_rules",
    target: "affected_npcs",
    value: {
      affectedNpcIds: event.affectedNpcIds || [],
      onResolved: resolvedDeltas,
      onIgnored: ignoredDeltas,
      usesDailySocialLedger: true,
      majorEventCanOverridePositiveDailyCaps: isMajorEvent(event),
    },
    reason:
      "Pista tecnica: si el evento diario se resuelve o vence, puede generar parches sociales sobre NPCs afectados.",
  };
}

function buildWorldEventSocialConsequencePlan({
  before = null,
  event = {},
  patch = {},
  forcedOutcome = "",
} = {}) {
  const outcome = inferSocialOutcome({ before, event, patch, forcedOutcome });
  const npcIds = unique(event.affectedNpcIds || []);

  if (outcome === "none" || !isDailyEvent(event) || npcIds.length === 0 || alreadyApplied(event, outcome)) {
    return {
      shouldApply: false,
      outcome,
      tags: [],
      effects: [],
      npcRelationshipPatches: [],
    };
  }

  const deltas = buildDeltasForOutcome(event, outcome);
  const reason = buildReason(event, outcome);
  const major = isMajorEvent(event);
  const tags = unique([
    "social_consequence_applied",
    SOCIAL_OUTCOME_TAGS[outcome],
    outcome === "ignored" ? "event_ignored_social_effect" : "",
    outcome === "resolved" ? "event_resolved_social_effect" : "",
  ]);
  const effect = buildSocialConsequenceEffect({ event, outcome, deltas, npcIds });

  return {
    shouldApply: true,
    outcome,
    tags,
    effects: [effect],
    npcRelationshipPatches: npcIds.map((npcId) => ({
      npcId,
      ...deltas,
      reason,
      actionType: `daily_event_${outcome}`,
      overrideDailyCap: ["resolved", "resolved_partial"].includes(outcome) && major,
      overrideReason:
        ["resolved", "resolved_partial"].includes(outcome) && major
          ? "Evento diario importante resuelto: puede superar caps diarios positivos."
          : "",
      sourceEventId: event.eventId,
      tags: unique(["daily_event_social_consequence", `daily_event_${outcome}`, event.severity || "minor"]),
    })),
  };
}

module.exports = {
  SOCIAL_OUTCOME_TAGS,
  buildSocialConsequenceHintEffect,
  buildWorldEventSocialConsequencePlan,
  buildDeltasForOutcome,
};
