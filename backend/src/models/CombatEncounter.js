const mongoose = require("mongoose");

const combatLogEntrySchema = new mongoose.Schema(
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
      enum: ["active", "won", "lost", "escaped", "cancelled"],
      default: "active",
      index: true,
    },

    locationId: {
      type: String,
      required: true,
      index: true,
    },

    enemyId: {
      type: String,
      required: true,
      index: true,
    },

    enemyName: {
      type: String,
      required: true,
    },

    enemyStatus: {
      life: { current: Number, max: Number },
      morale: { current: Number, max: Number },
      conditions: { type: [String], default: [] },
    },

    currentRound: {
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

    reason: {
      type: String,
      default: "",
    },

    combatLog: {
      type: [combatLogEntrySchema],
      default: [],
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

module.exports = mongoose.model("CombatEncounter", combatEncounterSchema);
