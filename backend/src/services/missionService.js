const GameState = require("../models/GameState");
const Mission = require("../models/Mission");
const EventLog = require("../models/EventLog");

function timeToMinutes(time) {
  if (!time) return 0;
  const [hours, minutes] = String(time).split(":").map(Number);
  return hours * 60 + minutes;
}

function isMissionExpired(mission, gameState) {
  if (!mission.expiresDay) return false;

  if (mission.expiresDay < gameState.currentDay) return true;
  if (mission.expiresDay > gameState.currentDay) return false;

  if (!mission.expiresTime) return false;

  return timeToMinutes(mission.expiresTime) <= timeToMinutes(gameState.time);
}

function createLogId() {
  return `log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function getMissionBoard({
  status,
  locationId,
  rank,
  riskLevel,
  sourceFactionId,
  gameId = "isekai_lucas_main",
  includeExpiredAvailable = false,
} = {}) {
  const query = {};

  if (status) {
    query.status = Array.isArray(status) ? { $in: status } : status;
  } else {
    query.status = { $in: ["available", "accepted", "blocked"] };
  }

  if (locationId) query.locationId = locationId;
  if (rank) query.rank = rank;
  if (riskLevel) query.riskLevel = riskLevel;
  if (sourceFactionId) query.sourceFactionId = sourceFactionId;

  const missions = await Mission.find(query)
    .sort({ status: 1, rank: 1, postedDay: -1, postedTime: -1 })
    .limit(50)
    .lean();

  if (includeExpiredAvailable) return missions;

  const hasAvailableStatus = !status || status === "available" || (Array.isArray(status) && status.includes("available"));
  if (!hasAvailableStatus) return missions;

  const gameState = await GameState.findOne({ gameId }).lean();
  if (!gameState) return missions;

  return missions.filter((mission) => mission.status !== "available" || !isMissionExpired(mission, gameState));
}

async function getMissionDetail(missionId) {
  const mission = await Mission.findOne({ missionId }).lean();

  if (!mission) {
    const error = new Error(`No existe misión con id: ${missionId}`);
    error.statusCode = 404;
    throw error;
  }

  return mission;
}

async function acceptMission({ missionId, gameId = "isekai_lucas_main", characterId = "char_lucas" }) {
  const gameState = await GameState.findOne({ gameId });

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const mission = await Mission.findOne({ missionId });

  if (!mission) {
    const error = new Error(`No existe misión con id: ${missionId}`);
    error.statusCode = 404;
    throw error;
  }

  if (mission.status !== "available") {
    const error = new Error(`La misión no está disponible. Estado actual: ${mission.status}`);
    error.statusCode = 400;
    throw error;
  }

  if (isMissionExpired(mission, gameState)) {
    mission.status = "expired";
    await mission.save();

    const error = new Error("La misión ya expiró por tiempo de partida.");
    error.statusCode = 400;
    throw error;
  }

  mission.status = "accepted";
  mission.acceptedByCharacterId = characterId;
  mission.acceptedDay = gameState.currentDay;

  await mission.save();

  if (!gameState.activeMissionIds.includes(mission.missionId)) {
    gameState.activeMissionIds.push(mission.missionId);
    await gameState.save();
  }

  await EventLog.create({
    logId: createLogId(),
    gameId,
    day: gameState.currentDay,
    timeStart: gameState.time,
    timeEnd: gameState.time,
    locationId: gameState.locationId,
    type: "mission_accept",
    summary: `Lucas aceptó la misión: ${mission.title}.`,
    involvedCharacterIds: [characterId],
    involvedNpcIds: mission.clientNpcId ? [mission.clientNpcId] : [],
    involvedFactionIds: mission.sourceFactionId ? [mission.sourceFactionId] : [],
    mechanicalChanges: {
      missionId: mission.missionId,
      status: "accepted",
    },
    visibility: "private",
    source: "player_action",
    tags: ["mission", "guild"],
  });

  return {
    mission: mission.toObject(),
    gameState: gameState.toObject(),
  };
}

async function submitMissionReport({
  missionId,
  gameId = "isekai_lucas_main",
  characterId = "char_lucas",
  reportSummary = "",
}) {
  const gameState = await GameState.findOne({ gameId }).lean();

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const mission = await Mission.findOne({ missionId });

  if (!mission) {
    const error = new Error(`No existe misión con id: ${missionId}`);
    error.statusCode = 404;
    throw error;
  }

  if (mission.status !== "accepted") {
    const error = new Error(`Solo se puede reportar una misión aceptada. Estado actual: ${mission.status}`);
    error.statusCode = 400;
    throw error;
  }

  if (mission.acceptedByCharacterId && mission.acceptedByCharacterId !== characterId) {
    const error = new Error("La misión fue aceptada por otro personaje.");
    error.statusCode = 400;
    throw error;
  }

  mission.proofStatus = "submitted";
  await mission.save();

  await EventLog.create({
    logId: createLogId(),
    gameId,
    day: gameState.currentDay,
    timeStart: gameState.time,
    timeEnd: gameState.time,
    locationId: gameState.locationId,
    type: "mission_report",
    summary: reportSummary || `Lucas presentó reporte de la misión: ${mission.title}.`,
    involvedCharacterIds: [characterId],
    involvedNpcIds: mission.clientNpcId ? [mission.clientNpcId] : [],
    involvedFactionIds: mission.sourceFactionId ? [mission.sourceFactionId] : [],
    mechanicalChanges: {
      missionId: mission.missionId,
      proofStatus: "submitted",
    },
    visibility: "private",
    source: "player_action",
    tags: ["mission", "guild", "report"],
  });

  return mission.toObject();
}

async function expireAvailableMissionsForGameState(
  gameState,
  {
    session = null,
    reason = "expired_by_current_time",
  } = {}
) {
  const query = { status: "available" };

  if (gameState.gameId && gameState.gameId !== "isekai_lucas_main") {
    query["flags.testSuite"] = true;
  }

  const available = await Mission.find(query).session(session).exec();
  const expired = [];

  for (const mission of available) {
    if (!isMissionExpired(mission, gameState)) continue;

    mission.status = "expired";
    mission.flags = {
      ...(mission.flags || {}),
      expiredAtDay: gameState.currentDay,
      expiredAtTime: gameState.time,
      expireReason: reason,
    };
    await mission.save({ session });

    expired.push({
      missionId: mission.missionId,
      title: mission.title,
      expiresDay: mission.expiresDay,
      expiresTime: mission.expiresTime,
      status: mission.status,
    });
  }

  return {
    day: gameState.currentDay,
    time: gameState.time,
    expiredCount: expired.length,
    expired,
  };
}

async function expireAvailableMissions({ gameId = "isekai_lucas_main" }) {
  const gameState = await GameState.findOne({ gameId }).lean();

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  return expireAvailableMissionsForGameState(gameState);
}

module.exports = {
  getMissionBoard,
  getMissionDetail,
  acceptMission,
  submitMissionReport,
  expireAvailableMissions,
  expireAvailableMissionsForGameState,
  isMissionExpired,
};
