const mongoose = require("mongoose");

const turnTraceSchema = new mongoose.Schema(
  {
    traceId: {
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

    clientTurnId: {
      type: String,
      default: "",
      index: true,
    },

    operation: {
      type: String,
      enum: ["applyTurn"],
      default: "applyTurn",
      index: true,
    },

    status: {
      type: String,
      enum: ["applied", "idempotent_replay"],
      default: "applied",
      index: true,
    },

    requestHash: {
      type: String,
      required: true,
      index: true,
    },

    responseHash: {
      type: String,
      required: true,
    },

    requestSanitized: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    responseSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    logIds: {
      type: [String],
      default: [],
      index: true,
    },

    primaryLogId: {
      type: String,
      default: "",
      index: true,
    },

    checkpointId: {
      type: String,
      default: "",
      index: true,
    },

    displayBundle: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    eventLogsCreated: {
      type: Number,
      default: 0,
      min: 0,
    },

    idempotentReplay: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

turnTraceSchema.index({ gameId: 1, clientTurnId: 1, updatedAt: -1 });
turnTraceSchema.index({ gameId: 1, primaryLogId: 1 });

module.exports = mongoose.model("TurnTrace", turnTraceSchema);
