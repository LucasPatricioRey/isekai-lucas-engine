const mongoose = require("mongoose");

const eventLogSchema = new mongoose.Schema(
  {
    logId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    day: {
      type: Number,
      required: true,
      index: true,
    },

    timeStart: {
      type: String,
      required: true,
    },

    timeEnd: {
      type: String,
      default: "",
    },

    locationId: {
      type: String,
      default: "",
      index: true,
    },

    type: {
      type: String,
      required: true,
      index: true,
    },

    summary: {
      type: String,
      required: true,
    },

    involvedCharacterIds: {
      type: [String],
      default: [],
    },

    involvedNpcIds: {
      type: [String],
      default: [],
      index: true,
    },

    involvedFactionIds: {
      type: [String],
      default: [],
    },

    mechanicalChanges: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    visibility: {
      type: String,
      enum: ["hidden", "private", "local", "public"],
      default: "private",
    },

    source: {
      type: String,
      enum: ["player_action", "system", "npc_action", "world_event", "admin"],
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

module.exports = mongoose.model("EventLog", eventLogSchema);
