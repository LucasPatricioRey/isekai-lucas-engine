const mongoose = require("mongoose");

const effectSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
    },
    target: {
      type: String,
      default: "",
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    reason: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const worldEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    gameId: {
      type: String,
      required: true,
      default: "isekai_lucas_main",
      index: true,
    },

    title: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      default: "general",
      index: true,
    },

    scope: {
      type: String,
      enum: ["local", "regional", "national", "continental"],
      default: "local",
    },

    status: {
      type: String,
      enum: ["scheduled", "active", "resolved", "expired", "consequences_applied", "cancelled"],
      default: "scheduled",
      index: true,
    },

    startDay: {
      type: Number,
      required: true,
    },

    startTime: {
      type: String,
      required: true,
    },

    endDay: {
      type: Number,
      default: null,
    },

    endTime: {
      type: String,
      default: "",
    },

    affectedLocationIds: {
      type: [String],
      default: [],
      index: true,
    },

    affectedNpcIds: {
      type: [String],
      default: [],
    },

    affectedFactionIds: {
      type: [String],
      default: [],
    },

    effects: {
      type: [effectSchema],
      default: [],
    },

    visibility: {
      type: String,
      enum: ["hidden", "private", "local", "public"],
      default: "local",
    },

    cause: {
      type: String,
      default: "",
    },

    severity: {
      type: String,
      enum: ["minor", "moderate", "major", "critical"],
      default: "minor",
    },

    createdBy: {
      type: String,
      enum: ["system", "player_action", "npc_action", "world_tick", "admin"],
      default: "system",
    },

    tags: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("WorldEvent", worldEventSchema);
