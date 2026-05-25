const mongoose = require("mongoose");

const checkpointSchema = new mongoose.Schema(
  {
    checkpointId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    gameId: {
      type: String,
      required: true,
      index: true,
      default: "isekai_lucas_main",
    },

    title: {
      type: String,
      required: true,
    },

    reason: {
      type: String,
      required: true,
    },

    day: {
      type: Number,
      required: true,
    },

    time: {
      type: String,
      required: true,
    },

    gameStateSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    changedCollectionsSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Checkpoint", checkpointSchema);
