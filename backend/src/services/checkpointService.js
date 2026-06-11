const Checkpoint = require("../models/Checkpoint");
const GameState = require("../models/GameState");
const Character = require("../models/Character");
const Npc = require("../models/Npc");
const NpcMemory = require("../models/NpcMemory");
const Rumor = require("../models/Rumor");
const Location = require("../models/Location");
const WorldEvent = require("../models/WorldEvent");
const Mission = require("../models/Mission");
const EventLog = require("../models/EventLog");
const Shop = require("../models/Shop");
const ShopStock = require("../models/ShopStock");
const Item = require("../models/Item");
const Faction = require("../models/Faction");
const RoutineOverride = require("../models/RoutineOverride");
const CombatEncounter = require("../models/CombatEncounter");
const NpcRelationship = require("../models/NpcRelationship");
const NpcSocialLedger = require("../models/NpcSocialLedger");
const CharacterMagicKnowledge = require("../models/CharacterMagicKnowledge");
const MagicDiscipline = require("../models/MagicDiscipline");
const MagicTechnique = require("../models/MagicTechnique");
const TravelRoute = require("../models/TravelRoute");
const WeatherState = require("../models/WeatherState");

const RESTORE_COLLECTIONS = [
  ["characters", Character],
  ["npcs", Npc],
  ["npcMemories", NpcMemory],
  ["rumors", Rumor],
  ["locations", Location],
  ["worldEvents", WorldEvent],
  ["missions", Mission],
  ["eventLogs", EventLog],
  ["shops", Shop],
  ["shopStocks", ShopStock],
  ["items", Item],
  ["factions", Faction],
  ["routineOverrides", RoutineOverride],
  ["combatEncounters", CombatEncounter],
  ["npcRelationships", NpcRelationship],
  ["npcSocialLedger", NpcSocialLedger],
  ["characterMagicKnowledge", CharacterMagicKnowledge],
  ["magicDisciplines", MagicDiscipline],
  ["magicTechniques", MagicTechnique],
  ["travelRoutes", TravelRoute],
  ["weatherStates", WeatherState],
];

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function createCheckpointId(gameState, prefix = "checkpoint") {
  const safeTime = String(gameState.time || "0000").replace(":", "");
  return `${prefix}_d${gameState.currentDay}_${safeTime}_${Date.now()}`;
}

function checkpointReference(checkpoint) {
  if (!checkpoint) return null;
  const value = typeof checkpoint.toObject === "function" ? checkpoint.toObject() : checkpoint;

  return {
    checkpointId: value.checkpointId,
    title: value.title,
    reason: value.reason,
    day: value.day,
    time: value.time,
    auto: Boolean(value.auto),
    triggerKey: value.triggerKey || "",
    createdAt: value.createdAt,
  };
}

async function buildFullSnapshot(gameId, { session = null } = {}) {
  const gameState = await withSession(GameState.findOne({ gameId }).lean(), session);

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  const [
    characters,
    npcs,
    npcMemories,
    rumors,
    locations,
    worldEvents,
    missions,
    eventLogs,
    shops,
    shopStocks,
    items,
    factions,
    routineOverrides,
    combatEncounters,
    npcRelationships,
    npcSocialLedger,
    characterMagicKnowledge,
    magicDisciplines,
    magicTechniques,
    travelRoutes,
    weatherStates,
  ] = await Promise.all([
    withSession(Character.find({}).lean(), session),
    withSession(Npc.find({}).lean(), session),
    withSession(NpcMemory.find({}).lean(), session),
    withSession(Rumor.find({}).lean(), session),
    withSession(Location.find({}).lean(), session),
    withSession(WorldEvent.find({}).lean(), session),
    withSession(Mission.find({}).lean(), session),
    withSession(EventLog.find({}).lean(), session),
    withSession(Shop.find({}).lean(), session),
    withSession(ShopStock.find({}).lean(), session),
    withSession(Item.find({}).lean(), session),
    withSession(Faction.find({}).lean(), session),
    withSession(RoutineOverride.find({}).lean(), session),
    withSession(CombatEncounter.find({}).lean(), session),
    withSession(NpcRelationship.find({}).lean(), session),
    withSession(NpcSocialLedger.find({}).lean(), session),
    withSession(CharacterMagicKnowledge.find({}).lean(), session),
    withSession(MagicDiscipline.find({}).lean(), session),
    withSession(MagicTechnique.find({}).lean(), session),
    withSession(TravelRoute.find({}).lean(), session),
    withSession(WeatherState.find({}).lean(), session),
  ]);

  return {
    gameState,
    collections: {
      characters,
      npcs,
      npcMemories,
      rumors,
      locations,
      worldEvents,
      missions,
      eventLogs,
      shops,
      shopStocks,
      items,
      factions,
      routineOverrides,
      combatEncounters,
      npcRelationships,
      npcSocialLedger,
      characterMagicKnowledge,
      magicDisciplines,
      magicTechniques,
      travelRoutes,
      weatherStates,
    },
  };
}

async function createCheckpointFromCurrentState({
  gameId = "isekai_lucas_main",
  checkpointId = "",
  title = "",
  reason = "Checkpoint manual.",
  notes = "",
  auto = false,
  triggerKey = "",
  metadata = {},
  session = null,
} = {}) {
  const snapshot = await buildFullSnapshot(gameId, { session });
  const gameState = snapshot.gameState;
  const docs = await Checkpoint.create(
    [
      {
        checkpointId: checkpointId || createCheckpointId(gameState, auto ? "checkpoint_auto" : "checkpoint"),
        gameId,
        title: title || `Checkpoint Día ${gameState.currentDay} ${gameState.time}`,
        reason,
        day: gameState.currentDay,
        time: gameState.time,
        gameStateSnapshot: snapshot.gameState,
        changedCollectionsSnapshot: snapshot.collections,
        notes,
        auto,
        triggerKey,
        metadata,
      },
    ],
    session ? { session } : {}
  );

  return docs[0];
}

async function createAutomaticCheckpoint({
  gameId = "isekai_lucas_main",
  title = "",
  reason = "Checkpoint automático.",
  notes = "",
  triggerKey = "auto",
  metadata = {},
  session = null,
} = {}) {
  const snapshot = await buildFullSnapshot(gameId, { session });
  const gameState = snapshot.gameState;
  const existing = await withSession(
    Checkpoint.findOne({
      gameId,
      auto: true,
      triggerKey,
      day: gameState.currentDay,
      time: gameState.time,
    })
      .select("checkpointId title reason day time auto triggerKey createdAt")
      .lean(),
    session
  );

  if (existing) {
    return {
      created: false,
      skipped: true,
      skipReason: "duplicate_auto_checkpoint",
      checkpoint: checkpointReference(existing),
    };
  }

  const docs = await Checkpoint.create(
    [
      {
        checkpointId: createCheckpointId(gameState, "checkpoint_auto"),
        gameId,
        title: title || `Auto checkpoint Día ${gameState.currentDay} ${gameState.time}`,
        reason,
        day: gameState.currentDay,
        time: gameState.time,
        gameStateSnapshot: snapshot.gameState,
        changedCollectionsSnapshot: snapshot.collections,
        notes,
        auto: true,
        triggerKey,
        metadata,
      },
    ],
    session ? { session } : {}
  );

  return {
    created: true,
    skipped: false,
    checkpoint: checkpointReference(docs[0]),
  };
}

module.exports = {
  RESTORE_COLLECTIONS,
  buildFullSnapshot,
  checkpointReference,
  createAutomaticCheckpoint,
  createCheckpointFromCurrentState,
  createCheckpointId,
};
