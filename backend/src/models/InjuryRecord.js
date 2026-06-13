const mongoose = require("mongoose");

const injuryRecordSchema = new mongoose.Schema(
  {
    injuryId: {
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
      default: "",
      index: true,
    },

    targetType: {
      type: String,
      enum: ["character", "npc", "enemy", "summoned", "environmental"],
      required: true,
      index: true,
    },

    targetId: {
      type: String,
      required: true,
      index: true,
    },

    bodyPart: {
      type: String,
      enum: [
        "head",
        "torso",
        "left_arm",
        "right_arm",
        "left_leg",
        "right_leg",
        "hand",
        "foot",
        "neck",
        "face",
        "back",
        "left_hand",
        "right_hand",
        "left_foot",
        "right_foot",
        "unknown",
      ],
      default: "unknown",
      index: true,
    },

    injuryType: {
      type: String,
      enum: ["cut", "pierce", "blunt", "burn", "bite", "claw", "poison", "sprain", "fracture", "magic", "other"],
      default: "other",
    },

    severity: {
      type: String,
      enum: ["scratch", "minor", "moderate", "serious", "critical", "maimed"],
      required: true,
      index: true,
    },

    bleeding: {
      type: Number,
      default: 0,
      min: 0,
    },

    pain: {
      type: Number,
      default: 0,
      min: 0,
    },

    mobilityPenalty: {
      type: Number,
      default: 0,
    },

    actionPenalty: {
      type: Number,
      default: 0,
    },

    concentrationPenalty: {
      type: Number,
      default: 0,
    },

    untreatedRisk: {
      type: String,
      enum: ["none", "low", "medium", "high", "critical"],
      default: "none",
    },

    requiresTreatment: {
      type: Boolean,
      default: false,
    },

    treated: {
      type: Boolean,
      default: false,
    },

    treatmentQuality: {
      type: String,
      enum: ["none", "poor", "basic", "good", "excellent"],
      default: "none",
    },

    createdDay: {
      type: Number,
      required: true,
    },

    createdTime: {
      type: String,
      required: true,
    },

    createdByActionId: {
      type: String,
      default: "",
      index: true,
    },

    expectedRecoveryDays: {
      type: Number,
      default: null,
      min: 0,
    },

    healingProgress: {
      type: Number,
      default: 0,
      min: 0,
    },

    recoveryHoursRemaining: {
      type: Number,
      default: null,
      min: 0,
    },

    lastRecoveryDay: {
      type: Number,
      default: null,
    },

    lastRecoveryTime: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["active", "treated", "healing", "healed", "worsened", "permanent"],
      default: "active",
      index: true,
    },

    notes: {
      type: String,
      default: "",
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

injuryRecordSchema.index({ gameId: 1, targetType: 1, targetId: 1, status: 1 });
injuryRecordSchema.index({ gameId: 1, encounterId: 1, severity: 1 });

module.exports = mongoose.model("InjuryRecord", injuryRecordSchema);
