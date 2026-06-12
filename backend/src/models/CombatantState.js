const mongoose = require("mongoose");

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

const combatantStateSchema = new mongoose.Schema(
  {
    combatantId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    encounterId: {
      type: String,
      required: true,
      index: true,
    },

    gameId: {
      type: String,
      default: "isekai_lucas_main",
      index: true,
    },

    side: {
      type: String,
      enum: ["lucas", "ally", "enemy", "neutral", "environment"],
      required: true,
      index: true,
    },

    characterId: {
      type: String,
      default: "",
      index: true,
    },

    npcId: {
      type: String,
      default: "",
      index: true,
    },

    enemyInstanceId: {
      type: String,
      default: "",
      index: true,
    },

    enemyTemplateId: {
      type: String,
      default: "",
      index: true,
    },

    name: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: ["character", "npc", "enemy", "summoned", "environmental"],
      required: true,
      index: true,
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
      index: true,
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

    distanceToOthers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    actionEconomy: {
      type: actionEconomyStateSchema,
      default: () => ({}),
    },

    isConscious: {
      type: Boolean,
      default: true,
      index: true,
    },

    isAlive: {
      type: Boolean,
      default: true,
      index: true,
    },

    canAct: {
      type: Boolean,
      default: true,
      index: true,
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

combatantStateSchema.index({ gameId: 1, encounterId: 1, side: 1 });
combatantStateSchema.index({ encounterId: 1, canAct: 1, isAlive: 1, isConscious: 1 });

module.exports = mongoose.model("CombatantState", combatantStateSchema);
