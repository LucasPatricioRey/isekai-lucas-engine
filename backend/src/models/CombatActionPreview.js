const mongoose = require("mongoose");

const combatActionPreviewSchema = new mongoose.Schema(
  {
    previewId: {
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

    encounterId: {
      type: String,
      required: true,
      index: true,
    },

    encounterVersion: {
      type: Number,
      required: true,
      min: 1,
    },

    stateHash: {
      type: String,
      required: true,
      index: true,
    },

    round: {
      type: Number,
      required: true,
      min: 1,
    },

    phase: {
      type: String,
      required: true,
      index: true,
    },

    actorId: {
      type: String,
      required: true,
      index: true,
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

    params: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    expectedCosts: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    riskSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    possibleOutcomes: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    deterministicSeed: {
      type: String,
      default: "",
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "applied", "expired", "invalidated"],
      default: "pending",
      index: true,
    },

    invalidationReason: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

combatActionPreviewSchema.index({ gameId: 1, encounterId: 1, status: 1, createdAt: -1 });
combatActionPreviewSchema.index({ encounterId: 1, encounterVersion: 1, stateHash: 1, status: 1 });

module.exports = mongoose.model("CombatActionPreview", combatActionPreviewSchema);
