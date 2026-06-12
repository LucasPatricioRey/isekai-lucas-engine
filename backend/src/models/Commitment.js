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

    ownerCharacterId: {
      type: String,
      default: "char_lucas",
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
commitmentSchema.index({ gameId: 1, targetNpcIds: 1, status: 1 });

module.exports = mongoose.model("Commitment", commitmentSchema);
