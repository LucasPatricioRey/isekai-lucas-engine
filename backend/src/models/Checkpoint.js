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

    auto: {
      type: Boolean,
      default: false,
      index: true,
    },

    triggerKey: {
      type: String,
      default: "",
      index: true,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

checkpointSchema.index({ createdAt: -1 });
checkpointSchema.index({ gameId: 1, createdAt: -1 });
checkpointSchema.index({ gameId: 1, auto: 1, createdAt: -1 });

module.exports = mongoose.model("Checkpoint", checkpointSchema);
