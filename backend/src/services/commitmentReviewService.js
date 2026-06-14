const Commitment = require("../models/Commitment");

function timeToMinutes(time = "00:00") {
  const [hours = "0", minutes = "0"] = String(time || "00:00").split(":");
  return Number(hours) * 60 + Number(minutes);
}

function toAbsoluteMinutes(day, time = "23:59") {
  return (Number(day || 1) - 1) * 1440 + timeToMinutes(time);
}

function minutesToTime(totalMinutes) {
  const normalized = Math.max(0, Math.min(1439, Number(totalMinutes || 0)));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function addMinutes(day, time, minutes) {
  const start = toAbsoluteMinutes(day, time);
  const target = start + Number(minutes || 0);
  return {
    day: Math.floor(target / 1440) + 1,
    time: minutesToTime(target % 1440),
  };
}

function plainFlags(commitment = {}) {
  return commitment.flags && typeof commitment.flags === "object" && !Array.isArray(commitment.flags)
    ? commitment.flags
    : {};
}

function hasTag(commitment = {}, tag) {
  return (commitment.tags || []).includes(tag);
}

function reviewAbs(commitment = {}) {
  if (commitment.nextCheckDay) {
    return toAbsoluteMinutes(commitment.nextCheckDay, commitment.nextCheckTime || "23:59");
  }
  if (commitment.dormantUntilDay) {
    return toAbsoluteMinutes(commitment.dormantUntilDay, commitment.dormantUntilTime || "23:59");
  }
  return null;
}

function isOpenCommitment(commitment = {}) {
  return commitment && ["pending", "active"].includes(commitment.status || "pending");
}

function isReviewCandidate(commitment = {}) {
  if (!isOpenCommitment(commitment)) return false;
  return Boolean(commitment.nextCheckDay || commitment.dormantUntilDay);
}

function reviewFallsInRange(commitment, fromAbs, toAbs, includeAlreadyDue = true) {
  const abs = reviewAbs(commitment);
  if (abs === null) return false;
  if (includeAlreadyDue && abs <= toAbs) return true;
  return abs > fromAbs && abs <= toAbs;
}

function baseReviewPlan({ commitment, gameState, reviewKind, reviewAt }) {
  return {
    schemaVersion: "commitment_review_plan_v1",
    commitmentId: commitment.commitmentId,
    title: commitment.title,
    type: commitment.type || "plan",
    promiseType: commitment.promiseType || "none",
    promiseStrength: commitment.promiseStrength || "none",
    status: commitment.status || "pending",
    reviewKind,
    reviewAt,
    responsibleNpcId: commitment.responsibleNpcId || "",
    responsibleFactionId: commitment.responsibleFactionId || "",
    speakerNpcId: commitment.speakerNpcId || "",
    generatedAt: {
      day: gameState.currentDay,
      time: gameState.time,
    },
    agencyScope: "npc_or_institution_offscreen",
    requiresApplyTurn: true,
    suggestedCommitmentPatch: null,
    suggestedGameStatePatch: null,
    suggestedEventLog: null,
    narrationGuidance: "",
    reason: "",
  };
}

function buildReprogramPatch({ commitment, gameState, minutes = 120, blockerSummary = "" }) {
  const next = addMinutes(gameState.currentDay, gameState.time, minutes);
  return {
    op: "update",
    commitmentId: commitment.commitmentId,
    nextCheckDay: next.day,
    nextCheckTime: next.time,
    blockerSummary,
  };
}

function guildRegistrationPlan({ commitment, gameState, reviewKind, reviewAt }) {
  const plan = baseReviewPlan({ commitment, gameState, reviewKind, reviewAt });
  const flags = plainFlags(commitment);
  const forcedOutcome = String(flags.reviewOutcome || "").trim();

  if (forcedOutcome === "blocked") {
    const blockerSummary =
      flags.reviewBlockerSummary ||
      "El cierre administrativo necesita una comprobacion interna adicional antes de habilitar el registro formal.";
    plan.outcome = "reprogram";
    plan.confidence = "high";
    plan.reason = "El compromiso trae reviewOutcome=blocked.";
    plan.suggestedCommitmentPatch = buildReprogramPatch({ commitment, gameState, blockerSummary });
    plan.narrationGuidance =
      "El responsable debe explicar el bloqueo concreto y dejar una nueva revision formal; no narrar castigo social automatico.";
    return plan;
  }

  if (hasTag(commitment, "applicant_part_completed") && gameState.flags?.formalGuildRegistrationPending) {
    plan.outcome = "fulfill";
    plan.confidence = "high";
    plan.reason =
      "La parte del solicitante ya esta completa y no hay bloqueo mecanico activo; el tramite puede cerrarse offscreen por el gremio.";
    plan.suggestedCommitmentPatch = {
      op: "fulfill",
      commitmentId: commitment.commitmentId,
      resolutionSummary:
        "El gremio cerro internamente el registro formal de aspirante; Lucas ya figura como aspirante registrado.",
      reason: "Revision administrativa cumplida por el responsable institucional.",
    };
    plan.suggestedGameStatePatch = {
      formalGuildRegistrationPending: false,
      guildRegistrationStatus: "complete",
      guildRegistrationResolution:
        "Registro formal de aspirante cerrado por el gremio tras revision administrativa interna.",
    };
    plan.suggestedEventLog = {
      visibility: "private",
      tags: ["guild_registration", "commitment_review", "offscreen_resolution"],
      text:
        "El gremio completo la revision administrativa interna y dejo listo el registro formal de aspirante de Lucas.",
    };
    plan.narrationGuidance =
      "Mara o Garrick pueden comunicar el cierre con tono administrativo. No presentarlo como favor personal ni recompensa.";
    return plan;
  }

  const blockerSummary =
    "El responsable institucional aun no puede cerrar el proceso con la informacion disponible; debe explicar el bloqueo y revisar de nuevo.";
  plan.outcome = "reprogram";
  plan.confidence = "medium";
  plan.reason = "Proceso administrativo sin criterio mecanico suficiente para cierre automatico.";
  plan.suggestedCommitmentPatch = buildReprogramPatch({ commitment, gameState, blockerSummary });
  plan.narrationGuidance =
    "Reprogramar con causa concreta en escena; no dejar el tramite como pendiente indefinido.";
  return plan;
}

function defaultReviewPlan({ commitment, gameState, reviewKind, reviewAt }) {
  const plan = baseReviewPlan({ commitment, gameState, reviewKind, reviewAt });

  if (reviewKind === "wake_dormant_condition") {
    plan.outcome = "condition_review";
    plan.confidence = "medium";
    plan.reason = "La dormancia llego a su fecha de revision.";
    plan.suggestedCommitmentPatch = buildReprogramPatch({
      commitment,
      gameState,
      minutes: 24 * 60,
      blockerSummary:
        "La condicion futura sigue sin estar confirmada; mantener seguimiento dormido hasta una nueva revision.",
    });
    plan.narrationGuidance =
      "Revisar si la condicion ya existe; si no, mantener la promesa dormida sin bloquear la escena.";
    return plan;
  }

  const isSoft = commitment.promiseStrength === "soft" || commitment.promiseType === "soft_estimate";
  plan.outcome = "reprogram";
  plan.confidence = isSoft ? "medium" : "low";
  plan.reason = isSoft
    ? "Estimacion blanda vencida: corresponde confirmar avance o fijar nueva revision."
    : "Compromiso revisable vencido sin regla especifica de cierre automatico.";
  plan.suggestedCommitmentPatch = buildReprogramPatch({
    commitment,
    gameState,
    blockerSummary: isSoft
      ? "La estimacion necesita confirmacion del responsable antes de cerrarse."
      : "Falta una decision explicita del responsable o de Lucas para cerrar este compromiso.",
  });
  plan.narrationGuidance =
    "No inventar cumplimiento ni fallo automatico; usar la revision para pedir respuesta, causa o reprogramacion formal.";
  return plan;
}

function buildCommitmentReviewPlan({ commitment, gameState, fromAbs = null, toAbs = null }) {
  if (!isReviewCandidate(commitment)) return null;

  const targetAbs = toAbs ?? toAbsoluteMinutes(gameState.currentDay, gameState.time);
  const currentFromAbs = fromAbs ?? targetAbs;
  if (!reviewFallsInRange(commitment, currentFromAbs, targetAbs, true)) return null;

  const dueAbs = reviewAbs(commitment);
  const reviewKind = commitment.dormantUntilDay && !commitment.nextCheckDay
    ? "wake_dormant_condition"
    : dueAbs < currentFromAbs
      ? "overdue_review"
      : "scheduled_review";
  const reviewAt = commitment.nextCheckDay
    ? { day: commitment.nextCheckDay, time: commitment.nextCheckTime || "23:59" }
    : { day: commitment.dormantUntilDay, time: commitment.dormantUntilTime || "23:59" };

  if (commitment.promiseType === "administrative_process" && hasTag(commitment, "guild_registration")) {
    return guildRegistrationPlan({ commitment, gameState, reviewKind, reviewAt });
  }

  return defaultReviewPlan({ commitment, gameState, reviewKind, reviewAt });
}

function buildCommitmentReviewPlans({ commitments = [], gameState, fromDay = null, fromTime = "", toDay = null, toTime = "" }) {
  const normalizedFromDay = Number(fromDay || gameState.currentDay);
  const normalizedFromTime = fromTime || gameState.time;
  const normalizedToDay = Number(toDay || gameState.currentDay);
  const normalizedToTime = toTime || gameState.time;
  const fromAbs = toAbsoluteMinutes(normalizedFromDay, normalizedFromTime);
  const toAbs = toAbsoluteMinutes(normalizedToDay, normalizedToTime);

  return commitments
    .map((commitment) => buildCommitmentReviewPlan({ commitment, gameState, fromAbs, toAbs }))
    .filter(Boolean);
}

async function previewCommitmentReviews({
  gameId = "isekai_lucas_main",
  gameState,
  fromDay = null,
  fromTime = "",
  toDay = null,
  toTime = "",
  limit = 20,
} = {}) {
  const commitments = await Commitment.find({
    gameId,
    status: { $in: ["pending", "active"] },
    $or: [
      { nextCheckDay: { $ne: null } },
      { dormantUntilDay: { $ne: null } },
    ],
  })
    .sort({ nextCheckDay: 1, nextCheckTime: 1, dormantUntilDay: 1, dormantUntilTime: 1 })
    .limit(Math.max(limit * 3, limit))
    .lean();

  const plans = buildCommitmentReviewPlans({
    commitments,
    gameState,
    fromDay,
    fromTime,
    toDay,
    toTime,
  }).slice(0, limit);

  return {
    schemaVersion: "commitment_review_preview_v1",
    checkedCount: commitments.length,
    dueCount: plans.length,
    plans,
    willMutateGameState: false,
    requiresApplyTurn: plans.length > 0,
  };
}

module.exports = {
  buildCommitmentReviewPlan,
  buildCommitmentReviewPlans,
  previewCommitmentReviews,
  toAbsoluteMinutes,
};
