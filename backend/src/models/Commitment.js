const mongoose = require("mongoose");

const resolutionSchema = new mongoose.Schema(
  {
    day: {
      type: Number,
      default: null,
    },
    time: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      default: "",
    },
    summary: {
      type: String,
      default: "",
    },
    reason: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const commitmentSchema = new mongoose.Schema(
  {
    commitmentId: {
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
      required: true,
      default: "char_lucas",
      index: true,
    },

    title: {
      type: String,
      required: true,
    },

    summary: {
      type: String,
      default: "",
    },

    type: {
      type: String,
      enum: [
        "promise",
        "plan",
        "obligation",
        "appointment",
        "follow_up",
        "job",
        "mission_intention",
        "personal_goal",
        "secret",
        "other",
      ],
      default: "plan",
      index: true,
    },

    promiseType: {
      type: String,
      enum: [
        "none",
        "hard_promise",
        "soft_estimate",
        "administrative_process",
        "npc_offer",
        "debt_or_favor",
        "warning_or_condition",
        "follow_up",
      ],
      default: "none",
      index: true,
    },

    promiseStrength: {
      type: String,
      enum: ["none", "soft", "normal", "binding"],
      default: "none",
      index: true,
    },

    status: {
      type: String,
      enum: ["pending", "active", "fulfilled", "failed", "cancelled", "expired"],
      default: "pending",
      index: true,
    },

    priority: {
      type: String,
      enum: ["low", "normal", "high", "critical"],
      default: "normal",
      index: true,
    },

    failureSeverity: {
      type: String,
      enum: ["none", "minor", "moderate", "major", "critical"],
      default: undefined,
      index: true,
    },

    failureConsequence: {
      type: String,
      default: "",
    },

    successConsequence: {
      type: String,
      default: "",
    },

    graceMinutes: {
      type: Number,
      default: 0,
      min: 0,
      max: 1440,
    },

    requiresExplicitResolution: {
      type: Boolean,
      default: false,
      index: true,
    },

    visibility: {
      type: String,
      enum: ["hidden", "private", "local", "public"],
      default: "private",
    },

    createdDay: {
      type: Number,
      required: true,
    },

    createdTime: {
      type: String,
      required: true,
    },

    dueDay: {
      type: Number,
      default: null,
      index: true,
    },

    dueTime: {
      type: String,
      default: "",
    },

    windowStartDay: {
      type: Number,
      default: null,
    },

    windowStartTime: {
      type: String,
      default: "",
    },

    windowEndDay: {
      type: Number,
      default: null,
    },

    windowEndTime: {
      type: String,
      default: "",
    },

    nextCheckDay: {
      type: Number,
      default: null,
      index: true,
    },

    nextCheckTime: {
      type: String,
      default: "",
    },

    blockerSummary: {
      type: String,
      default: "",
    },

    conditionSummary: {
      type: String,
      default: "",
    },

    dormantUntilDay: {
      type: Number,
      default: null,
      index: true,
    },

    dormantUntilTime: {
      type: String,
      default: "",
    },

    ownerCharacterId: {
      type: String,
      default: "char_lucas",
      index: true,
    },

    speakerNpcId: {
      type: String,
      default: "",
      index: true,
    },

    responsibleNpcId: {
      type: String,
      default: "",
      index: true,
    },

    responsibleFactionId: {
      type: String,
      default: "",
      index: true,
    },

    targetNpcIds: {
      type: [String],
      default: [],
      index: true,
    },

    relatedNpcIds: {
      type: [String],
      default: [],
    },

    relatedLocationIds: {
      type: [String],
      default: [],
    },

    relatedMissionIds: {
      type: [String],
      default: [],
    },

    relatedEventIds: {
      type: [String],
      default: [],
    },

    resolution: {
      type: resolutionSchema,
      default: () => ({}),
    },

    sourceEventLogId: {
      type: String,
      default: "",
    },

    tags: {
      type: [String],
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

commitmentSchema.index({ gameId: 1, status: 1, dueDay: 1, dueTime: 1 });
commitmentSchema.index({ gameId: 1, status: 1, nextCheckDay: 1, nextCheckTime: 1 });
commitmentSchema.index({ gameId: 1, status: 1, dormantUntilDay: 1, dormantUntilTime: 1 });
commitmentSchema.index({ gameId: 1, targetNpcIds: 1, status: 1 });

module.exports = mongoose.model("Commitment", commitmentSchema);
