const {
  SOCIAL_RELATIONSHIP_FIELDS,
  normalizeRelationship,
  relationshipBand,
} = require("../services/socialLedgerService");
const { summarizeNpcSocialProfile } = require("../services/socialProfileService");
const { buildSocialConsequenceHintEffect } = require("../services/dailyEventSocialService");
const { evaluateSocialRelationshipState } = require("../services/socialRelationshipStateService");
const { summarizeContractSchedule } = require("../services/jobScheduleService");
const { buildDailyEventNotice, getDailyEventTemplateId } = require("./worldEventPresentation");

function unique(values) {
  return Array.from(new Set((values || []).filter(Boolean)));
}

function toIntQuery(value, fallback, min = 0, max = 100) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function queryBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  const normalized = String(Array.isArray(value) ? value[0] : value).trim().toLowerCase();
  return !["0", "false", "no", "off"].includes(normalized);
}

function truncateText(value, maxLength = 700) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time || "00:00").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

function isExpiredAt(entity, currentDay, currentTime) {
  if (!entity || entity.expiresDay === null || entity.expiresDay === undefined) return false;
  if (entity.expiresDay < currentDay) return true;
  if (entity.expiresDay > currentDay) return false;
  if (!entity.expiresTime) return false;
  return timeToMinutes(currentTime) >= timeToMinutes(entity.expiresTime);
}

function toAbsoluteMinutes(day, time) {
  return (Number(day || 1) - 1) * 1440 + timeToMinutes(time || "00:00");
}

function missionExpirationState(mission, currentDay, currentTime) {
  if (!mission?.expiresDay) {
    return {
      key: "none",
      minutesUntil: null,
      expired: false,
      urgency: "none",
      label: "Sin vencimiento formal.",
    };
  }

  const expiresAt = toAbsoluteMinutes(mission.expiresDay, mission.expiresTime || "23:59");
  const currentAt = toAbsoluteMinutes(currentDay, currentTime);
  const minutesUntil = expiresAt - currentAt;

  if (minutesUntil <= 0) {
    return {
      key: "expired",
      minutesUntil: 0,
      expired: true,
      urgency: "warning",
      label: "Vencida por tiempo de partida.",
    };
  }

  if (minutesUntil <= 180) {
    return {
      key: "due_soon",
      minutesUntil,
      expired: false,
      urgency: "warning",
      label: "Vence pronto.",
    };
  }

  if (Number(mission.expiresDay) === Number(currentDay)) {
    return {
      key: "today",
      minutesUntil,
      expired: false,
      urgency: "info",
      label: "Vence hoy.",
    };
  }

  return {
    key: "future",
    minutesUntil,
    expired: false,
    urgency: "none",
    label: "Vencimiento futuro.",
  };
}

function missionActionState(mission, currentDay, currentTime) {
  if (!mission) return null;
  const expiration = missionExpirationState(mission, currentDay, currentTime);
  const proofStatus = mission.proofStatus || "not_required";
  const proofRequired = Boolean(mission.proofRequired && proofStatus !== "not_required");
  const base = {
    expiration,
    blocksReward: false,
    requiresFormalClosure: false,
    recommendedAction: "",
  };

  if (expiration.expired && ["available", "accepted"].includes(mission.status)) {
    return {
      ...base,
      key: mission.status === "accepted" ? "accepted_expired" : "available_expired",
      urgency: "warning",
      requiresFormalClosure: true,
      recommendedAction:
        mission.status === "accepted"
          ? "Resolver como fail/expire segun la ficcion antes de pagar recompensa."
          : "No ofrecer como opcion vigente; expirar formalmente si aparece en tablero.",
    };
  }

  if (mission.status === "available") {
    return {
      ...base,
      key: expiration.key === "due_soon" ? "available_expiring_soon" : "available",
      urgency: expiration.urgency === "warning" ? "info" : "none",
      recommendedAction:
        expiration.key === "due_soon"
          ? "Avisar que vence pronto si Lucas puede verlo en cartelera."
          : "Disponible solo si Lucas la consulta o el contexto la hace visible.",
    };
  }

  if (mission.status === "accepted") {
    if (proofStatus === "submitted") {
      return {
        ...base,
        key: "awaiting_verification",
        urgency: "info",
        blocksReward: true,
        recommendedAction: "Verificar prueba/reporte antes de completar o pagar.",
      };
    }

    if (proofStatus === "verified" || !proofRequired) {
      return {
        ...base,
        key: "ready_to_complete",
        urgency: "info",
        recommendedAction: "Puede completarse formalmente y pagar recompensa una sola vez.",
      };
    }

    if (proofStatus === "rejected") {
      return {
        ...base,
        key: "proof_rejected",
        urgency: "warning",
        blocksReward: true,
        requiresFormalClosure: true,
        recommendedAction: "Corregir prueba, fallar la mision o dejar consecuencia formal; no pagar.",
      };
    }

    return {
      ...base,
      key: "needs_report",
      urgency: expiration.urgency === "warning" ? "warning" : "info",
      blocksReward: proofRequired,
      recommendedAction: proofRequired
        ? "Conseguir o presentar prueba/reporte antes de verificar."
        : "Reportar el resultado antes de completar.",
    };
  }

  if (mission.status === "completed") {
    return {
      ...base,
      key: "completed",
      urgency: "none",
      recommendedAction: "No pagar ni completar otra vez.",
    };
  }

  if (["failed", "expired", "withdrawn", "blocked"].includes(mission.status)) {
    return {
      ...base,
      key: mission.status,
      urgency: mission.status === "blocked" ? "info" : "none",
      recommendedAction: "No tratar como mision activa salvo auditoria tecnica.",
    };
  }

  return {
    ...base,
    key: mission.status || "unknown",
    urgency: "info",
    recommendedAction: "Revisar estado de mision antes de narrar recompensas.",
  };
}

function isWeatherStale(weather, currentDay, currentTime) {
  if (!weather || weather.expectedUntilDay === null || weather.expectedUntilDay === undefined) return false;
  if (weather.expectedUntilDay < currentDay) return true;
  if (weather.expectedUntilDay > currentDay) return false;
  if (!weather.expectedUntilTime) return false;
  return timeToMinutes(currentTime) >= timeToMinutes(weather.expectedUntilTime);
}

function commitmentDueStatus(commitment, currentDay, currentTime) {
  if (!commitment?.dueDay) return "unscheduled";
  const currentAbs = (Number(currentDay || 1) - 1) * 1440 + timeToMinutes(currentTime);
  const dueAbs = (Number(commitment.dueDay || 1) - 1) * 1440 + timeToMinutes(commitment.dueTime || "23:59");

  if (currentAbs > dueAbs) return "overdue";
  if (currentAbs === dueAbs) return "due_now";
  if (dueAbs - currentAbs <= 180) return "due_soon";
  return "future";
}

function commitmentOverdueMinutes(commitment, currentDay, currentTime) {
  if (!commitment?.dueDay) return 0;
  const currentAbs = (Number(currentDay || 1) - 1) * 1440 + timeToMinutes(currentTime);
  const dueAbs = (Number(commitment.dueDay || 1) - 1) * 1440 + timeToMinutes(commitment.dueTime || "23:59");
  return Math.max(0, currentAbs - dueAbs);
}

function defaultCommitmentFailureSeverity(commitment = {}) {
  if (commitment.failureSeverity) return commitment.failureSeverity;
  if (commitment.priority === "critical") return "major";
  if (commitment.priority === "high") return "moderate";
  if (["job", "obligation", "appointment", "promise", "mission_intention"].includes(commitment.type)) return "minor";
  return "none";
}

function defaultCommitmentFailureConsequence(commitment = {}) {
  if (commitment.failureConsequence) return commitment.failureConsequence;
  if (commitment.type === "job") return "Puede afectar la confianza laboral, la paga futura o la estabilidad del contrato.";
  if (commitment.type === "promise") return "Puede bajar confianza o familiaridad con los NPCs afectados si se incumple sin explicacion.";
  if (commitment.type === "obligation") return "Puede generar deuda social, molestia o perdida de fiabilidad.";
  if (commitment.type === "appointment") return "Puede hacer perder la oportunidad o exigir disculpa/reprogramacion.";
  if (commitment.type === "mission_intention") return "Puede dejar pasar una oportunidad del gremio o cambiar la disponibilidad del encargo.";
  if (commitment.type === "secret") return "Puede exponer informacion privada si no se maneja con cuidado.";
  return "";
}

function commitmentUrgency(commitment, currentDay, currentTime) {
  if (!commitment || ["fulfilled", "failed", "cancelled", "expired"].includes(commitment.status)) return "closed";
  if (!commitment.dueDay) return commitment.priority === "critical" || commitment.priority === "high" ? "tracked" : "open";

  const currentAbs = (Number(currentDay || 1) - 1) * 1440 + timeToMinutes(currentTime);
  const dueAbs = (Number(commitment.dueDay || 1) - 1) * 1440 + timeToMinutes(commitment.dueTime || "23:59");
  const graceMinutes = Math.max(0, Number(commitment.graceMinutes || 0));
  const minutesUntilDue = dueAbs - currentAbs;

  if (currentAbs > dueAbs + graceMinutes) return "consequence_ready";
  if (currentAbs > dueAbs) return "overdue_in_grace";
  if (currentAbs === dueAbs) return "due_now";
  if (minutesUntilDue <= 60) return "due_soon";
  if (minutesUntilDue <= 180) return "upcoming";
  return "future";
}

function buildCommitmentRecommendedAction({ urgency, type, requiresExplicitResolution }) {
  if (urgency === "consequence_ready") return "Cerrar con fulfill/fail/cancel/expire antes de avanzar escenas largas.";
  if (urgency === "overdue_in_grace") return "Resolver o reprogramar pronto; todavia esta dentro del margen de gracia.";
  if (urgency === "due_now") return "Atender ahora, cumplirlo o reprogramarlo formalmente.";
  if (urgency === "due_soon" || urgency === "upcoming") return "Tenerlo presente en la narracion y evitar saltos largos que lo ignoren.";
  if (requiresExplicitResolution) return "No dejarlo solo en logs; cerrarlo formalmente cuando cambie su estado.";
  if (type === "secret") return "Respetar privacidad y conocimiento NPC.";
  return "Mantener como pendiente hasta que Lucas lo atienda o lo descarte.";
}

function buildCommitmentConsequencePreview(commitment, currentDay, currentTime) {
  const urgency = commitmentUrgency(commitment, currentDay, currentTime);
  const severity = defaultCommitmentFailureSeverity(commitment);
  const graceMinutes = Math.max(0, Number(commitment?.graceMinutes || 0));
  const overdueMinutes = commitmentOverdueMinutes(commitment, currentDay, currentTime);
  const pastGrace = urgency === "consequence_ready";
  const requiresExplicitResolution = Boolean(
    commitment?.requiresExplicitResolution || severity !== "none" || (commitment?.targetNpcIds || []).length > 0
  );

  return {
    severity,
    summary: truncateText(defaultCommitmentFailureConsequence(commitment), 350),
    successSummary: truncateText(commitment?.successConsequence || "", 350),
    graceMinutes,
    overdueMinutes,
    pastGrace,
    requiresExplicitResolution,
    recommendedAction: buildCommitmentRecommendedAction({
      urgency,
      type: commitment?.type || "plan",
      requiresExplicitResolution,
    }),
  };
}

function summarizeStat(stat) {
  if (!stat) return null;
  return {
    current: stat.current,
    max: stat.max,
    label: stat.label || "",
  };
}

function summarizeInventoryEntry(entry, item) {
  return {
    itemId: entry.itemId,
    name: item?.name || entry.itemId,
    type: item?.type || "",
    subtype: item?.subtype || "",
    quantity: entry.quantity,
    equipped: Boolean(entry.equipped),
    condition: entry.condition || "",
    notes: entry.notes || "",
    rarity: item?.rarity || "",
    basePriceCopper: item?.basePriceCopper ?? 0,
    tags: item?.tags || [],
  };
}

function summarizeInventory(inventory, itemDocs = []) {
  const itemById = new Map(itemDocs.map((item) => [item.itemId, item]));
  return (inventory || []).map((entry) => summarizeInventoryEntry(entry, itemById.get(entry.itemId)));
}

function summarizeSkill(skill) {
  return {
    skillId: skill.skillId,
    name: skill.name,
    phase: skill.phase,
    level: skill.level,
    exp: skill.exp,
    expToNext: skill.expToNext,
  };
}

function moneyBreakdown(totalCopper = 0) {
  const copper = Math.max(0, Number(totalCopper) || 0);
  return {
    totalCopper: copper,
    gold: Math.floor(copper / 10000),
    silver: Math.floor((copper % 10000) / 100),
    copper: copper % 100,
  };
}

function summarizeLucasState(gameState, character, itemDocs = []) {
  const status = gameState?.lucasStatus || {};
  const inventory = summarizeInventory(gameState?.inventory || [], itemDocs);

  return {
    characterId: gameState?.characterId || character?.characterId || "",
    name: character?.name || "",
    life: summarizeStat(status.life),
    satiety: summarizeStat(status.satiety),
    energy: summarizeStat(status.energy),
    mp: summarizeStat(status.mp),
    money: moneyBreakdown(gameState?.moneyCopper || 0),
    inventory,
    equipped: inventory.filter((entry) => entry.equipped),
    skills: (gameState?.skills || []).map(summarizeSkill),
    conditions: status.conditions || [],
    injuries: status.injuries || [],
    activeMissionIds: gameState?.activeMissionIds || [],
  };
}

function summarizeGameState(gameState) {
  if (!gameState) return null;
  return {
    gameId: gameState.gameId,
    currentDay: gameState.currentDay,
    diegeticDate: gameState.diegeticDate,
    block: gameState.block,
    time: gameState.time,
    locationId: gameState.locationId,
    characterId: gameState.characterId,
    activeEventIds: gameState.activeEventIds || [],
    activeMissionIds: gameState.activeMissionIds || [],
    flags: gameState.flags || {},
  };
}

function summarizeLocation(location) {
  if (!location) return null;
  return {
    locationId: location.locationId,
    name: location.name,
    type: location.type || "",
    regionId: location.regionId || "",
    parentLocationId: location.parentLocationId || "",
    ownerNpcId: location.ownerNpcId || "",
    controllingFactionId: location.controllingFactionId || "",
    currentStatus: location.currentStatus || "",
    dangerLevel: location.dangerLevel || "",
    openHours: location.openHours || [],
    activeEffects: location.activeEffects || [],
    visibleNpcIds: location.visibleNpcIds || [],
    probableNpcIds: location.probableNpcIds || [],
    tags: location.tags || [],
  };
}

function summarizeNpc(npc) {
  if (!npc) return null;
  const relationship = normalizeRelationship(npc.relationshipWithLucas || {});
  return {
    npcId: npc.npcId,
    name: npc.name,
    role: npc.role || "",
    currentLocationId: npc.currentLocationId || "",
    currentTask: npc.currentTask || "",
    availability: npc.availability || {},
    persistenceLevel: npc.persistenceLevel || "",
    socialProfile: summarizeNpcSocialProfile(npc),
    relationshipWithLucas: relationship,
    relationshipBands: {
      trust: relationshipBand(relationship.trust),
      familiarity: relationshipBand(relationship.familiarity),
      affection: relationshipBand(relationship.affection),
      suspicion: relationshipBand(relationship.suspicion),
      respect: relationshipBand(relationship.respect),
      fear: relationshipBand(relationship.fear),
      jealousy: relationshipBand(relationship.jealousy),
    },
    relationshipState: evaluateSocialRelationshipState(relationship),
    factionLinks: npc.factionLinks || [],
    knownPublicFacts: npc.knownPublicFacts || [],
    flags: npc.flags || {},
  };
}

function summarizeNpcPresenceRef(npc) {
  if (!npc) return null;
  const availability = npc.availability || {};

  return {
    npcId: npc.npcId,
    name: npc.name,
    currentLocationId: npc.currentLocationId || "",
    currentTask: truncateText(npc.currentTask || "", 160),
    availability: {
      status: availability.status || "",
      reason: truncateText(availability.reason || "", 160),
    },
  };
}

function summarizeNonZeroDeltas(deltas = {}) {
  const summary = {};
  for (const field of SOCIAL_RELATIONSHIP_FIELDS) {
    const value = Number(deltas[field]) || 0;
    if (value !== 0) summary[field] = value;
  }
  return summary;
}

function summarizeNpcSocialLedger(entry) {
  if (!entry) return null;
  return {
    ledgerId: entry.ledgerId,
    npcId: entry.npcId,
    day: entry.day,
    time: entry.time,
    actionType: entry.actionType || "",
    reason: truncateText(entry.reason || "", 400),
    requestedDeltas: summarizeNonZeroDeltas(entry.requestedDeltas),
    appliedDeltas: summarizeNonZeroDeltas(entry.appliedDeltas),
    capWarnings: entry.caps?.warnings || [],
    sourceEventId: entry.sourceEventId || "",
    sourceMissionId: entry.sourceMissionId || "",
    tags: entry.tags || [],
  };
}

function summarizeMission(mission, currentDay, currentTime) {
  if (!mission) return null;
  const actionState = missionActionState(mission, currentDay, currentTime);
  return {
    missionId: mission.missionId,
    title: mission.title,
    description: truncateText(mission.description, 900),
    status: mission.status,
    rank: mission.rank,
    riskLevel: mission.riskLevel,
    clientNpcId: mission.clientNpcId || "",
    locationId: mission.locationId || "",
    sourceFactionId: mission.sourceFactionId || "",
    reward: mission.reward || {},
    mgReward: mission.mgReward || 0,
    requirements: mission.requirements || [],
    proofRequired: mission.proofRequired || "",
    proofStatus: mission.proofStatus || "",
    postedDay: mission.postedDay,
    postedTime: mission.postedTime,
    expiresDay: mission.expiresDay,
    expiresTime: mission.expiresTime || "",
    expiredByCurrentTime: isExpiredAt(mission, currentDay, currentTime),
    actionState,
    acceptedByCharacterId: mission.acceptedByCharacterId || "",
    acceptedDay: mission.acceptedDay,
    completedDay: mission.completedDay,
    flags: mission.flags || {},
  };
}

function summarizeEventLog(log, options = {}) {
  if (!log) return null;
  const includeMechanicalChanges = Boolean(options.includeMechanicalChanges);
  const summary = {
    logId: log.logId,
    day: log.day,
    timeStart: log.timeStart,
    timeEnd: log.timeEnd || "",
    locationId: log.locationId || "",
    type: log.type,
    summary: truncateText(log.summary, options.summaryMaxLength || 900),
    involvedCharacterIds: log.involvedCharacterIds || [],
    involvedNpcIds: log.involvedNpcIds || [],
    involvedFactionIds: log.involvedFactionIds || [],
    visibility: log.visibility || "",
    source: log.source || "",
    tags: log.tags || [],
  };
  if (includeMechanicalChanges) summary.mechanicalChanges = log.mechanicalChanges || {};
  return summary;
}

function summarizeNpcMemory(memory) {
  if (!memory) return null;
  return {
    memoryId: memory.memoryId,
    npcId: memory.npcId,
    fact: truncateText(memory.fact, 800),
    summary: truncateText(memory.summary, 500),
    sourceType: memory.sourceType,
    certainty: memory.certainty,
    emotionalWeight: memory.emotionalWeight,
    privacyLevel: memory.privacyLevel,
    canShare: memory.canShare,
    createdDay: memory.createdDay,
    createdTime: memory.createdTime,
    importance: memory.importance,
    tags: memory.tags || [],
  };
}

function summarizeRumor(rumor) {
  if (!rumor) return null;
  return {
    rumorId: rumor.rumorId,
    content: truncateText(rumor.content, 700),
    source: rumor.source || "",
    sourceType: rumor.sourceType || "",
    certainty: rumor.certainty || "",
    distortionLevel: rumor.distortionLevel,
    locationIds: rumor.locationIds || [],
    createdDay: rumor.createdDay,
    createdTime: rumor.createdTime,
    expiresDay: rumor.expiresDay,
    status: rumor.status,
    tags: rumor.tags || [],
  };
}

function summarizeWorldEvent(event) {
  if (!event) return null;
  const storedEffects = event.effects || [];
  const templateId = getDailyEventTemplateId(event);
  const tags = event.tags || [];
  const countsAsMainEvent =
    event.countsAsMainEvent === true ||
    (event.countsAsMainEvent !== false && tags.includes("daily_event") && !event.eventLayer);
  const eventLayer = event.eventLayer || (countsAsMainEvent ? "main_event" : "background");
  const relevantEffects = storedEffects
    .filter((effect) =>
      [
        "daily_event_rolls",
        "consequence_if_ignored",
        "consequence_applied",
        "social_consequence_rules",
        "social_consequence_applied",
        "event_resolution",
      ].includes(effect.type)
    );

  if (
    countsAsMainEvent &&
    !storedEffects.some((effect) => effect.type === "social_consequence_rules")
  ) {
    relevantEffects.push(buildSocialConsequenceHintEffect(event));
  }

  return {
    eventId: event.eventId,
    gameId: event.gameId || "isekai_lucas_main",
    templateId,
    rolls: event.rolls || {},
    title: event.title,
    type: event.type,
    eventLayer,
    countsAsMainEvent,
    blocksMainEventGeneration:
      ["scheduled", "active"].includes(event.status) &&
      (event.blocksMainEventGeneration === true || countsAsMainEvent),
    scope: event.scope,
    status: event.status,
    resolution: event.resolution || {},
    startDay: event.startDay,
    startTime: event.startTime,
    endDay: event.endDay,
    endTime: event.endTime || "",
    affectedLocationIds: event.affectedLocationIds || [],
    affectedNpcIds: event.affectedNpcIds || [],
    severity: event.severity,
    visibility: event.visibility,
    dailyEventNotice: countsAsMainEvent ? buildDailyEventNotice(event) : null,
    cause: truncateText(event.cause || "", 500),
    effects: relevantEffects.slice(0, 6),
    tags,
  };
}

function summarizeCommitment(commitment, currentDay, currentTime) {
  if (!commitment) return null;
  const dueStatus = commitmentDueStatus(commitment, currentDay, currentTime);
  const urgency = commitmentUrgency(commitment, currentDay, currentTime);
  return {
    commitmentId: commitment.commitmentId,
    gameId: commitment.gameId || "isekai_lucas_main",
    characterId: commitment.characterId || "char_lucas",
    title: commitment.title,
    summary: truncateText(commitment.summary || "", 700),
    type: commitment.type || "plan",
    status: commitment.status || "pending",
    priority: commitment.priority || "normal",
    failureSeverity: defaultCommitmentFailureSeverity(commitment),
    failureConsequence: truncateText(commitment.failureConsequence || "", 350),
    successConsequence: truncateText(commitment.successConsequence || "", 350),
    graceMinutes: Math.max(0, Number(commitment.graceMinutes || 0)),
    requiresExplicitResolution: Boolean(commitment.requiresExplicitResolution),
    visibility: commitment.visibility || "private",
    createdDay: commitment.createdDay,
    createdTime: commitment.createdTime,
    dueDay: commitment.dueDay,
    dueTime: commitment.dueTime || "",
    dueStatus,
    urgency,
    windowStartDay: commitment.windowStartDay,
    windowStartTime: commitment.windowStartTime || "",
    windowEndDay: commitment.windowEndDay,
    windowEndTime: commitment.windowEndTime || "",
    targetNpcIds: commitment.targetNpcIds || [],
    relatedNpcIds: commitment.relatedNpcIds || [],
    relatedLocationIds: commitment.relatedLocationIds || [],
    relatedMissionIds: commitment.relatedMissionIds || [],
    relatedEventIds: commitment.relatedEventIds || [],
    resolution: commitment.resolution || {},
    sourceEventLogId: commitment.sourceEventLogId || "",
    tags: commitment.tags || [],
    consequencePreview: buildCommitmentConsequencePreview(commitment, currentDay, currentTime),
  };
}

function summarizeWeather(weather, currentDay, currentTime) {
  if (!weather) return null;
  return {
    weatherId: weather.weatherId,
    regionId: weather.regionId,
    currentCondition: weather.currentCondition,
    intensity: weather.intensity,
    startedDay: weather.startedDay,
    startedTime: weather.startedTime,
    expectedUntilDay: weather.expectedUntilDay,
    expectedUntilTime: weather.expectedUntilTime || "",
    staleByCurrentTime: isWeatherStale(weather, currentDay, currentTime),
    effects: weather.effects || [],
    source: weather.source || "",
    tags: weather.tags || [],
  };
}

function summarizeJobContract(contract, gameState = null) {
  if (!contract) return null;
  const schedule = summarizeContractSchedule(contract, gameState);
  return {
    contractId: contract.contractId,
    jobId: contract.jobId,
    title: contract.title,
    employerNpcId: contract.employerNpcId,
    locationId: contract.locationId,
    status: contract.status,
    startDay: contract.startDay,
    pay: contract.pay || {},
    includesMeals: Boolean(contract.includesMeals),
    mealBenefits: contract.mealBenefits || [],
    shifts: (contract.shifts || []).map((shift) => ({
      ...shift,
      scheduleStatus: schedule?.shifts?.find((entry) => entry.shiftId === shift.shiftId) || null,
    })),
    schedule,
    typicalTasks: contract.typicalTasks || [],
    absenceRules: contract.absenceRules || [],
    tags: contract.tags || [],
  };
}

function summarizeCombatEncounter(encounter) {
  if (!encounter) return null;
  return {
    encounterId: encounter.encounterId,
    status: encounter.status,
    locationId: encounter.locationId,
    enemyId: encounter.enemyId,
    enemyName: encounter.enemyName,
    enemyStatus: encounter.enemyStatus || {},
    currentRound: encounter.currentRound,
    startedDay: encounter.startedDay,
    startedTime: encounter.startedTime,
    reason: encounter.reason || "",
  };
}

module.exports = {
  unique,
  toIntQuery,
  queryBoolean,
  truncateText,
  timeToMinutes,
  isExpiredAt,
  isWeatherStale,
  summarizeStat,
  summarizeInventory,
  summarizeSkill,
  moneyBreakdown,
  summarizeLucasState,
  summarizeGameState,
  summarizeLocation,
  summarizeNpc,
  summarizeNpcPresenceRef,
  summarizeNpcSocialLedger,
  summarizeMission,
  summarizeEventLog,
  summarizeNpcMemory,
  summarizeRumor,
  summarizeWorldEvent,
  summarizeCommitment,
  summarizeWeather,
  summarizeJobContract,
  summarizeCombatEncounter,
  missionActionState,
  missionExpirationState,
};
