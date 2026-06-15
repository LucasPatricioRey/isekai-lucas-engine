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
const CombatantState = require("../models/CombatantState");
const CombatActionPreview = require("../models/CombatActionPreview");
const CombatLogEntry = require("../models/CombatLogEntry");
const InjuryRecord = require("../models/InjuryRecord");
const WeaponProfile = require("../models/WeaponProfile");
const NpcRelationship = require("../models/NpcRelationship");
const NpcSocialLedger = require("../models/NpcSocialLedger");
const CharacterMagicKnowledge = require("../models/CharacterMagicKnowledge");
const MagicDiscipline = require("../models/MagicDiscipline");
const MagicTechnique = require("../models/MagicTechnique");
const TravelRoute = require("../models/TravelRoute");
const WeatherState = require("../models/WeatherState");
const Evidence = require("../models/Evidence");

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
  ["combatantStates", CombatantState],
  ["combatActionPreviews", CombatActionPreview],
  ["combatLogEntries", CombatLogEntry],
  ["injuryRecords", InjuryRecord],
  ["weaponProfiles", WeaponProfile],
  ["npcRelationships", NpcRelationship],
  ["npcSocialLedger", NpcSocialLedger],
  ["characterMagicKnowledge", CharacterMagicKnowledge],
  ["magicDisciplines", MagicDiscipline],
  ["magicTechniques", MagicTechnique],
  ["travelRoutes", TravelRoute],
  ["weatherStates", WeatherState],
  ["evidence", Evidence],
];

const DEFAULT_AUTO_CHECKPOINT_RETENTION = 40;
const GAME_SCOPED_RESTORE_COLLECTION_KEYS = new Set([
  "worldEvents",
  "eventLogs",
  "combatEncounters",
  "combatantStates",
  "combatActionPreviews",
  "combatLogEntries",
  "injuryRecords",
  "npcSocialLedger",
  "evidence",
]);

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function checkpointSnapshotMetadata({ mode = "full", gameId = "" } = {}) {
  return {
    snapshotMode: mode,
    gameId,
    scopedCollections: mode === "game_scoped" ? Array.from(GAME_SCOPED_RESTORE_COLLECTION_KEYS).sort() : [],
  };
}

function snapshotFind(Model, collectionKey, { gameId = "", mode = "full", session = null } = {}) {
  const filter = mode === "game_scoped" && GAME_SCOPED_RESTORE_COLLECTION_KEYS.has(collectionKey)
    ? { gameId }
    : {};
  return withSession(Model.find(filter).lean(), session);
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
    metadata: value.metadata || {},
    createdAt: value.createdAt,
  };
}

async function pruneAutomaticCheckpoints({
  gameId = "isekai_lucas_main",
  keep = DEFAULT_AUTO_CHECKPOINT_RETENTION,
  session = null,
} = {}) {
  const limit = Math.max(1, Number(keep) || DEFAULT_AUTO_CHECKPOINT_RETENTION);
  const extras = await withSession(
    Checkpoint.find({ gameId, auto: true })
      .sort({ createdAt: -1 })
      .skip(limit)
      .select("_id checkpointId createdAt")
      .lean(),
    session
  );

  if (extras.length === 0) {
    return {
      deletedCount: 0,
      kept: limit,
    };
  }

  const ids = extras.map((checkpoint) => checkpoint._id);
  const result = await withSession(Checkpoint.deleteMany({ _id: { $in: ids } }), session);

  return {
    deletedCount: result.deletedCount || 0,
    kept: limit,
    deletedCheckpointIds: extras.map((checkpoint) => checkpoint.checkpointId),
  };
}

async function buildFullSnapshot(gameId, { session = null, mode = "full" } = {}) {
  const gameState = await withSession(GameState.findOne({ gameId }).lean(), session);

  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }

  if (mode === "game_state_only") {
    return {
      gameState,
      collections: {},
    };
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
    combatantStates,
    combatActionPreviews,
    combatLogEntries,
    injuryRecords,
    weaponProfiles,
    npcRelationships,
    npcSocialLedger,
    characterMagicKnowledge,
    magicDisciplines,
    magicTechniques,
    travelRoutes,
    weatherStates,
    evidence,
  ] = await Promise.all([
    snapshotFind(Character, "characters", { gameId, mode, session }),
    snapshotFind(Npc, "npcs", { gameId, mode, session }),
    snapshotFind(NpcMemory, "npcMemories", { gameId, mode, session }),
    snapshotFind(Rumor, "rumors", { gameId, mode, session }),
    snapshotFind(Location, "locations", { gameId, mode, session }),
    snapshotFind(WorldEvent, "worldEvents", { gameId, mode, session }),
    snapshotFind(Mission, "missions", { gameId, mode, session }),
    snapshotFind(EventLog, "eventLogs", { gameId, mode, session }),
    snapshotFind(Shop, "shops", { gameId, mode, session }),
    snapshotFind(ShopStock, "shopStocks", { gameId, mode, session }),
    snapshotFind(Item, "items", { gameId, mode, session }),
    snapshotFind(Faction, "factions", { gameId, mode, session }),
    snapshotFind(RoutineOverride, "routineOverrides", { gameId, mode, session }),
    snapshotFind(CombatEncounter, "combatEncounters", { gameId, mode, session }),
    snapshotFind(CombatantState, "combatantStates", { gameId, mode, session }),
    snapshotFind(CombatActionPreview, "combatActionPreviews", { gameId, mode, session }),
    snapshotFind(CombatLogEntry, "combatLogEntries", { gameId, mode, session }),
    snapshotFind(InjuryRecord, "injuryRecords", { gameId, mode, session }),
    snapshotFind(WeaponProfile, "weaponProfiles", { gameId, mode, session }),
    snapshotFind(NpcRelationship, "npcRelationships", { gameId, mode, session }),
    snapshotFind(NpcSocialLedger, "npcSocialLedger", { gameId, mode, session }),
    snapshotFind(CharacterMagicKnowledge, "characterMagicKnowledge", { gameId, mode, session }),
    snapshotFind(MagicDiscipline, "magicDisciplines", { gameId, mode, session }),
    snapshotFind(MagicTechnique, "magicTechniques", { gameId, mode, session }),
    snapshotFind(TravelRoute, "travelRoutes", { gameId, mode, session }),
    snapshotFind(WeatherState, "weatherStates", { gameId, mode, session }),
    snapshotFind(Evidence, "evidence", { gameId, mode, session }),
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
      combatantStates,
      combatActionPreviews,
      combatLogEntries,
      injuryRecords,
      weaponProfiles,
      npcRelationships,
      npcSocialLedger,
      characterMagicKnowledge,
      magicDisciplines,
      magicTechniques,
      travelRoutes,
      weatherStates,
      evidence,
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
        metadata: {
          ...checkpointSnapshotMetadata({ mode: "full", gameId }),
          ...metadata,
        },
      },
    ],
    session ? { session } : {}
  );

  const pruning = auto
    ? await pruneAutomaticCheckpoints({ gameId, session })
    : { deletedCount: 0, kept: DEFAULT_AUTO_CHECKPOINT_RETENTION };

  const checkpoint = docs[0];
  checkpoint._autoCheckpointPruning = pruning;
  return checkpoint;
}

async function createAutomaticCheckpoint({
  gameId = "isekai_lucas_main",
  title = "",
  reason = "Checkpoint automático.",
  notes = "",
  triggerKey = "auto",
  metadata = {},
  snapshotMode = "game_scoped",
  session = null,
} = {}) {
  const gameState = await withSession(GameState.findOne({ gameId }).lean(), session);
  if (!gameState) {
    const error = new Error(`No existe GameState para gameId: ${gameId}`);
    error.statusCode = 404;
    throw error;
  }
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

  const snapshot = await buildFullSnapshot(gameId, { session, mode: snapshotMode });
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
        metadata: {
          ...checkpointSnapshotMetadata({ mode: snapshotMode, gameId }),
          ...metadata,
        },
      },
    ],
    session ? { session } : {}
  );
  const pruning = await pruneAutomaticCheckpoints({ gameId, session });

  return {
    created: true,
    skipped: false,
    checkpoint: checkpointReference(docs[0]),
    pruning,
  };
}

module.exports = {
  GAME_SCOPED_RESTORE_COLLECTION_KEYS,
  RESTORE_COLLECTIONS,
  buildFullSnapshot,
  checkpointReference,
  createAutomaticCheckpoint,
  createCheckpointFromCurrentState,
  createCheckpointId,
  pruneAutomaticCheckpoints,
};
