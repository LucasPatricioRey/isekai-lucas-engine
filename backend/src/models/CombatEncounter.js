const mongoose = require("mongoose");

const ENCOUNTER_STATUSES = [
  "active",
  "won",
  "lost",
  "escaped",
  "enemy_fled",
  "surrendered",
  "deescalated",
  "interrupted",
  "cancelled",
];

const ENCOUNTER_PHASES = [
  "setup",
  "player_turn",
  "npc_turn",
  "reaction_window",
  "round_end",
  "ending",
];

const VISIBILITY_STATES = ["clear", "dim", "dark", "fog", "rain", "obscured", "unknown"];
const NOISE_LEVELS = ["silent", "quiet", "normal", "loud", "alarming", "unknown"];
const SURPRISE_STATES = ["none", "lucas_surprised", "enemy_surprised", "mutual", "unknown"];

const resourcePoolSchema = new mongoose.Schema(
  {
    current: {
      type: Number,
      default: 0,
      min: 0,
    },
    max: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false }
);

const legacyCombatLogEntrySchema = new mongoose.Schema(
  {
    round: {
      type: Number,
      required: true,
    },
    summary: {
      type: String,
      required: true,
    },
    lucasChanges: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    enemyChanges: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    injuriesAdded: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  { _id: false }
);

const actionEconomyStateSchema = new mongoose.Schema(
  {
    mainAction: {
      type: String,
      enum: ["available", "spent", "blocked"],
      default: "available",
    },
    moveAction: {
      type: String,
      enum: ["available", "spent", "blocked"],
      default: "available",
    },
    reaction: {
      type: String,
      enum: ["available", "spent", "blocked"],
      default: "available",
    },
    freeAction: {
      type: String,
      enum: ["available", "spent", "blocked"],
      default: "available",
    },
  },
  { _id: false }
);

const combatantSnapshotSchema = new mongoose.Schema(
  {
    combatantId: {
      type: String,
      required: true,
    },
    side: {
      type: String,
      enum: ["lucas", "ally", "enemy", "neutral", "environment"],
      required: true,
    },
    characterId: {
      type: String,
      default: "",
    },
    npcId: {
      type: String,
      default: "",
    },
    enemyInstanceId: {
      type: String,
      default: "",
    },
    enemyTemplateId: {
      type: String,
      default: "",
    },
    name: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: ["character", "npc", "enemy", "summoned", "environmental"],
      required: true,
    },
    hp: {
      type: resourcePoolSchema,
      default: () => ({ current: 0, max: 0 }),
    },
    mp: {
      type: resourcePoolSchema,
      default: () => ({ current: 0, max: 0 }),
    },
    combatFatigue: {
      type: Number,
      default: 0,
      min: 0,
    },
    breath: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    stress: {
      type: Number,
      default: 0,
      min: 0,
    },
    morale: {
      type: resourcePoolSchema,
      default: () => ({ current: 0, max: 0 }),
    },
    stance: {
      type: String,
      default: "neutral",
    },
    positionState: {
      type: String,
      default: "standing",
    },
    bodyState: {
      type: String,
      default: "able",
    },
    awarenessState: {
      type: String,
      default: "aware",
    },
    equippedWeaponIds: {
      type: [String],
      default: [],
    },
    armorProfileId: {
      type: String,
      default: "",
    },
    injuries: {
      type: [String],
      default: [],
    },
    conditions: {
      type: [String],
      default: [],
    },
    intent: {
      type: String,
      default: "",
    },
    targetPriority: {
      type: [String],
      default: [],
    },
    isConscious: {
      type: Boolean,
      default: true,
    },
    isAlive: {
      type: Boolean,
      default: true,
    },
    canAct: {
      type: Boolean,
      default: true,
    },
    actionEconomy: {
      type: actionEconomyStateSchema,
      default: () => ({}),
    },
    flags: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

const escapeRouteSchema = new mongoose.Schema(
  {
    routeId: {
      type: String,
      required: true,
    },
    toLocationId: {
      type: String,
      default: "",
    },
    label: {
      type: String,
      default: "",
    },
    riskLevel: {
      type: String,
      enum: ["safe", "low", "medium", "high", "extreme", "unknown"],
      default: "unknown",
    },
    blocked: {
      type: Boolean,
      default: false,
    },
    reason: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const combatLootStateSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["none", "unavailable", "available_unclaimed", "partially_claimed", "claimed", "abandoned", "blocked"],
      default: "none",
      index: true,
    },
    reason: {
      type: String,
      default: "",
    },
    candidateItems: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    candidateEvidence: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    blockedByDanger: {
      type: Boolean,
      default: false,
    },
    blockedByWitnesses: {
      type: Boolean,
      default: false,
    },
    blockedByOwnership: {
      type: Boolean,
      default: false,
    },
    requiresSearchAction: {
      type: Boolean,
      default: true,
    },
    searched: {
      type: Boolean,
      default: false,
    },
    claimedByCharacterId: {
      type: String,
      default: "",
    },
    claimedDay: {
      type: Number,
      default: null,
    },
    claimedTime: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const combatEvidenceStateSchema = new mongoose.Schema(
  {
    evidenceIds: {
      type: [String],
      default: [],
    },
    candidateEvidence: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    proofStatus: {
      type: String,
      enum: ["none", "unverified", "partial", "verified", "invalidated"],
      default: "none",
    },
    reportedToNpcIds: {
      type: [String],
      default: [],
    },
    reportedToFactionIds: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

function buildPool(current = 0, max = current) {
  const safeCurrent = Math.max(0, Number(current) || 0);
  const safeMax = Math.max(safeCurrent, Number(max) || safeCurrent);
  return {
    current: safeCurrent,
    max: safeMax,
  };
}

function buildLegacyEnemyStatus(enemy = {}) {
  const baseStats = enemy.baseStats || {};
  const hp = baseStats.hp ?? baseStats.life ?? 1;
  const morale = baseStats.morale ?? 1;

  return {
    life: buildPool(hp, hp),
    morale: buildPool(morale, morale),
    conditions: [],
  };
}

function buildInitialParticipantsFromLegacy({ gameState = {}, enemy = {} } = {}) {
  const lucasLife = gameState.lucasStatus?.life || {};
  const lucasMp = gameState.lucasStatus?.mp || {};
  const enemyStatus = buildLegacyEnemyStatus(enemy);

  return [
    {
      combatantId: "combatant_lucas",
      side: "lucas",
      characterId: "char_lucas",
      name: "Lucas",
      type: "character",
      hp: buildPool(lucasLife.current ?? 0, lucasLife.max ?? lucasLife.current ?? 0),
      mp: buildPool(lucasMp.current ?? 0, lucasMp.max ?? lucasMp.current ?? 0),
      morale: buildPool(100, 100),
      equippedWeaponIds: (gameState.inventory || [])
        .filter((entry) => entry.equipped)
        .map((entry) => entry.itemId),
    },
    {
      combatantId: `combatant_${enemy.enemyId || "enemy"}`,
      side: "enemy",
      enemyInstanceId: `${enemy.enemyId || "enemy"}_instance_1`,
      enemyTemplateId: enemy.enemyId || "",
      name: enemy.name || "Enemigo",
      type: "enemy",
      hp: buildPool(enemyStatus.life.current, enemyStatus.life.max),
      morale: buildPool(enemyStatus.morale.current, enemyStatus.morale.max),
      conditions: enemyStatus.conditions,
    },
  ];
}

const combatEncounterSchema = new mongoose.Schema(
  {
    encounterId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    gameId: {
      type: String,
      default: "isekai_lucas_main",
      index: true,
    },

    status: {
      type: String,
      enum: ENCOUNTER_STATUSES,
      default: "active",
      index: true,
    },

    phase: {
      type: String,
      enum: ENCOUNTER_PHASES,
      default: "player_turn",
      index: true,
    },

    locationId: {
      type: String,
      required: true,
      index: true,
    },

    parentLocationId: {
      type: String,
      default: "",
      index: true,
    },

    regionId: {
      type: String,
      default: "",
      index: true,
    },

    sourceEventId: {
      type: String,
      default: "",
      index: true,
    },

    sourceMissionId: {
      type: String,
      default: "",
      index: true,
    },

    sourceCommitmentId: {
      type: String,
      default: "",
      index: true,
    },

    // Legacy single-enemy fields kept for current services and GPT Actions.
    enemyId: {
      type: String,
      default: "",
      index: true,
    },

    enemyName: {
      type: String,
      default: "",
    },

    enemyStatus: {
      life: {
        type: resourcePoolSchema,
        default: () => buildPool(0, 0),
      },
      morale: {
        type: resourcePoolSchema,
        default: () => buildPool(0, 0),
      },
      conditions: {
        type: [String],
        default: [],
      },
    },

    currentRound: {
      type: Number,
      default: 1,
      min: 1,
    },

    round: {
      type: Number,
      default: 1,
      min: 1,
    },

    startedDay: {
      type: Number,
      required: true,
    },

    startedTime: {
      type: String,
      required: true,
    },

    endedDay: {
      type: Number,
      default: null,
    },

    endedTime: {
      type: String,
      default: "",
    },

    elapsedSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },

    roundDurationSeconds: {
      type: Number,
      default: 6,
      min: 1,
    },

    pendingClockAdvanceSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },

    terrainTags: {
      type: [String],
      default: [],
      index: true,
    },

    weatherId: {
      type: String,
      default: "",
    },

    weatherCondition: {
      type: String,
      default: "",
    },

    visibility: {
      type: String,
      enum: VISIBILITY_STATES,
      default: "unknown",
    },

    noiseLevel: {
      type: String,
      enum: NOISE_LEVELS,
      default: "unknown",
    },

    surpriseState: {
      type: String,
      enum: SURPRISE_STATES,
      default: "unknown",
    },

    escapeRoutes: {
      type: [escapeRouteSchema],
      default: [],
    },

    participants: {
      type: [combatantSnapshotSchema],
      default: [],
    },

    turnOrder: {
      type: [String],
      default: [],
    },

    currentActorId: {
      type: String,
      default: "combatant_lucas",
      index: true,
    },

    distanceMap: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    lootState: {
      type: combatLootStateSchema,
      default: () => ({}),
    },

    evidenceState: {
      type: combatEvidenceStateSchema,
      default: () => ({}),
    },

    encounterVersion: {
      type: Number,
      default: 1,
      min: 1,
      index: true,
    },

    combatLog: {
      type: [legacyCombatLogEntrySchema],
      default: [],
    },

    combatLogIds: {
      type: [String],
      default: [],
    },

    reason: {
      type: String,
      default: "",
    },

    flags: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

combatEncounterSchema.pre("validate", function syncLegacyRound() {
  if (!this.round && this.currentRound) this.round = this.currentRound;
  if (!this.currentRound && this.round) this.currentRound = this.round;

  if (!this.currentActorId && Array.isArray(this.turnOrder) && this.turnOrder.length > 0) {
    this.currentActorId = this.turnOrder[0];
  }
});

combatEncounterSchema.methods.getRound = function getRound() {
  return this.round || this.currentRound || 1;
};

combatEncounterSchema.statics.buildLegacyEnemyStatus = buildLegacyEnemyStatus;
combatEncounterSchema.statics.buildInitialParticipantsFromLegacy = buildInitialParticipantsFromLegacy;

combatEncounterSchema.index({ gameId: 1, status: 1, createdAt: -1 });
combatEncounterSchema.index({ gameId: 1, status: 1, phase: 1 });
combatEncounterSchema.index({ gameId: 1, sourceEventId: 1, status: 1 });

module.exports = mongoose.model("CombatEncounter", combatEncounterSchema);
