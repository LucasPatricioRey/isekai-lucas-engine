const mongoose = require("mongoose");

const npcMemorySchema = new mongoose.Schema(
  {
    memoryId: {
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

    fact: {
      type: String,
      required: true,
    },

    summary: {
      type: String,
      default: "",
    },

    sourceType: {
      type: String,
      enum: [
        "saw",
        "heard",
        "told_by_lucas",
        "told_by_npc",
        "public_record",
        "rumor",
        "inference",
      ],
      required: true,
    },

    sourceId: {
      type: String,
      default: "",
    },

    sourceEventLogId: {
      type: String,
      default: "",
      index: true,
    },

    certainty: {
      type: String,
      enum: ["confirmed", "probable", "rumor", "doubtful"],
      required: true,
    },

    emotionalWeight: {
      type: String,
      enum: ["none", "low", "medium", "high", "very_high"],
      default: "low",
    },

    privacyLevel: {
      type: String,
      enum: ["public", "semi_private", "private", "secret"],
      default: "private",
    },

    canShare: {
      type: Boolean,
      default: false,
    },

    shareConditions: {
      type: [String],
      default: [],
    },

    createdDay: {
      type: Number,
      required: true,
    },

    createdTime: {
      type: String,
      required: true,
    },

    lastReferencedDay: {
      type: Number,
      default: null,
    },

    importance: {
      type: String,
      enum: ["minor", "normal", "important", "critical"],
      default: "normal",
    },

    decayType: {
      type: String,
      enum: ["none", "soft_decay", "forgettable"],
      default: "none",
    },

    relatedNpcIds: {
      type: [String],
      default: [],
    },

    relatedLocationIds: {
      type: [String],
      default: [],
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

module.exports = mongoose.model("NpcMemory", npcMemorySchema);
