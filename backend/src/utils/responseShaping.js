const {
  SOCIAL_RELATIONSHIP_FIELDS,
  normalizeRelationship,
  relationshipBand,
} = require("../services/socialLedgerService");

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

function isWeatherStale(weather, currentDay, currentTime) {
  if (!weather || weather.expectedUntilDay === null || weather.expectedUntilDay === undefined) return false;
  if (weather.expectedUntilDay < currentDay) return true;
  if (weather.expectedUntilDay > currentDay) return false;
  if (!weather.expectedUntilTime) return false;
  return timeToMinutes(currentTime) >= timeToMinutes(weather.expectedUntilTime);
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
    factionLinks: npc.factionLinks || [],
    knownPublicFacts: npc.knownPublicFacts || [],
    flags: npc.flags || {},
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
  const relevantEffects = (event.effects || [])
    .filter((effect) =>
      ["daily_event_rolls", "consequence_if_ignored", "consequence_applied"].includes(effect.type)
    )
    .slice(0, 5);

  return {
    eventId: event.eventId,
    gameId: event.gameId || "isekai_lucas_main",
    title: event.title,
    type: event.type,
    scope: event.scope,
    status: event.status,
    startDay: event.startDay,
    startTime: event.startTime,
    endDay: event.endDay,
    endTime: event.endTime || "",
    affectedLocationIds: event.affectedLocationIds || [],
    affectedNpcIds: event.affectedNpcIds || [],
    severity: event.severity,
    visibility: event.visibility,
    cause: truncateText(event.cause || "", 500),
    effects: relevantEffects,
    tags: event.tags || [],
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

function summarizeJobContract(contract) {
  if (!contract) return null;
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
    shifts: contract.shifts || [],
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
  summarizeNpcSocialLedger,
  summarizeMission,
  summarizeEventLog,
  summarizeNpcMemory,
  summarizeRumor,
  summarizeWorldEvent,
  summarizeWeather,
  summarizeJobContract,
  summarizeCombatEncounter,
};
