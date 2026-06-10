const mongoose = require("mongoose");

const deltaSchema = new mongoose.Schema(
  {
    trust: { type: Number, default: 0 },
    familiarity: { type: Number, default: 0 },
    affection: { type: Number, default: 0 },
    suspicion: { type: Number, default: 0 },
    respect: { type: Number, default: 0 },
    fear: { type: Number, default: 0 },
    jealousy: { type: Number, default: 0 },
    socialDebt: { type: Number, default: 0 },
  },
  { _id: false }
);

const npcSocialLedgerSchema = new mongoose.Schema(
  {
    ledgerId: {
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

    characterId: {
      type: String,
      default: "char_lucas",
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

    time: {
      type: String,
      required: true,
    },

    actionType: {
      type: String,
      default: "general",
      index: true,
    },

    reason: {
      type: String,
      required: true,
    },

    source: {
      type: String,
      default: "applyTurn",
      index: true,
    },

    requestedDeltas: {
      type: deltaSchema,
      default: () => ({}),
    },

    appliedDeltas: {
      type: deltaSchema,
      default: () => ({}),
    },

    before: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    after: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    caps: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    sourceEventId: {
      type: String,
      default: "",
      index: true,
    },

    sourceMissionId: {
      type: String,
      default: "",
      index: true,
    },

    sourceEventLogId: {
      type: String,
      default: "",
      index: true,
    },

    tags: {
      type: [String],
      default: [],
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

npcSocialLedgerSchema.index({ gameId: 1, npcId: 1, day: 1 });
npcSocialLedgerSchema.index({ gameId: 1, npcId: 1, day: 1, actionType: 1 });

module.exports = mongoose.model("NpcSocialLedger", npcSocialLedgerSchema);
