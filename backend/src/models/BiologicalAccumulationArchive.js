const mongoose = require("mongoose");

const biologicalAccumulationArchiveSchema = new mongoose.Schema(
  {
    archiveId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    gameId: {
      type: String,
      required: true,
      index: true,
    },
    accumulationId: {
      type: String,
      required: true,
      index: true,
    },
    characterId: {
      type: String,
      default: "char_lucas",
      index: true,
    },
    day: {
      type: Number,
      default: null,
      index: true,
    },
    blockStart: {
      type: String,
      default: "",
    },
    blockEnd: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      default: "",
      index: true,
    },
    minutes: {
      type: Number,
      default: 0,
    },
    reason: {
      type: String,
      default: "",
    },
    sourceActionSummary: {
      type: String,
      default: "",
    },
    sourceEventLogId: {
      type: String,
      default: "",
      index: true,
    },
    status: {
      type: String,
      default: "processed",
      index: true,
    },
    createdAtOriginal: {
      type: Date,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
      index: true,
    },
    processedDay: {
      type: Number,
      default: null,
    },
    processedTime: {
      type: String,
      default: "",
    },
    raw: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

biologicalAccumulationArchiveSchema.index({ gameId: 1, processedAt: -1 });
biologicalAccumulationArchiveSchema.index({ gameId: 1, sourceEventLogId: 1 });

module.exports = mongoose.model("BiologicalAccumulationArchive", biologicalAccumulationArchiveSchema);
