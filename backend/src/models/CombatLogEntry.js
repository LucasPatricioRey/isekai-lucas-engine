const mongoose = require("mongoose");

const combatLogEntrySchema = new mongoose.Schema(
  {
    logId: {
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

    round: {
      type: Number,
      required: true,
      min: 1,
    },

    phase: {
      type: String,
      default: "",
      index: true,
    },

    actorId: {
      type: String,
      default: "",
      index: true,
    },

    actorName: {
      type: String,
      default: "",
    },

    actionType: {
      type: String,
      required: true,
      index: true,
    },

    targetIds: {
      type: [String],
      default: [],
    },

    previewId: {
      type: String,
      default: "",
      index: true,
    },

    rolls: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    modifiers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    result: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    damage: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    injuriesCreated: {
      type: [String],
      default: [],
    },

    positionChanges: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    moraleChanges: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    fatigueChanges: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    resourceChanges: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    lootChanges: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    evidenceChanges: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    missionChanges: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    eventChanges: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    narrativeSummary: {
      type: String,
      required: true,
    },

    visibility: {
      type: String,
      enum: ["private", "technical", "public", "hidden"],
      default: "private",
      index: true,
    },

    createdDay: {
      type: Number,
      required: true,
    },

    createdTime: {
      type: String,
      required: true,
    },

    elapsedSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

combatLogEntrySchema.index({ gameId: 1, encounterId: 1, round: 1, createdAt: 1 });

module.exports = mongoose.model("CombatLogEntry", combatLogEntrySchema);
