const mongoose = require("mongoose");

const routineOverrideSchema = new mongoose.Schema(
  {
    overrideId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    npcId: {
      type: String,
      required: true,
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
      required: true,
    },

    locationId: {
      type: String,
      required: true,
      index: true,
    },

    task: {
      type: String,
      required: true,
    },

    reason: {
      type: String,
      default: "",
    },

    priority: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["scheduled", "active", "completed", "cancelled"],
      default: "scheduled",
      index: true,
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

module.exports = mongoose.model("RoutineOverride", routineOverrideSchema);
