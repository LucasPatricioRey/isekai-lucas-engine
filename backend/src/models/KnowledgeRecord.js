const mongoose = require("mongoose");

const knowledgeRecordSchema = new mongoose.Schema(
  {
    knowledgeId: {
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
    subjectType: {
      type: String,
      enum: [
        "character",
        "npc",
        "faction",
        "location",
        "job_contract",
        "mission",
        "world_event",
        "evidence",
        "secret",
        "other",
      ],
      required: true,
      index: true,
    },
    subjectId: {
      type: String,
      default: "",
      index: true,
    },
    factKey: {
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
        "institutional_record",
        "rumor",
        "inference",
        "system",
      ],
      required: true,
      index: true,
    },
    sourceId: {
      type: String,
      default: "",
    },
    certainty: {
      type: String,
      enum: ["confirmed", "probable", "rumor", "doubtful"],
      required: true,
      index: true,
    },
    visibility: {
      type: String,
      enum: ["public", "semi_private", "private", "secret", "mechanical_only"],
      default: "private",
      index: true,
    },
    holderNpcIds: {
      type: [String],
      default: [],
      index: true,
    },
    holderFactionIds: {
      type: [String],
      default: [],
      index: true,
    },
    holderCharacterIds: {
      type: [String],
      default: [],
      index: true,
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
      min: 1,
    },
    createdTime: {
      type: String,
      required: true,
    },
    lastConfirmedDay: {
      type: Number,
      default: null,
    },
    lastConfirmedTime: {
      type: String,
      default: "",
    },
    expiresDay: {
      type: Number,
      default: null,
    },
    expiresTime: {
      type: String,
      default: "",
    },
    relatedNpcIds: {
      type: [String],
      default: [],
    },
    relatedFactionIds: {
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
    relatedEvidenceIds: {
      type: [String],
      default: [],
    },
    relatedJobContractIds: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ["active", "superseded", "retired", "disputed"],
      default: "active",
      index: true,
    },
    tags: {
      type: [String],
      default: [],
      index: true,
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

knowledgeRecordSchema.index({ gameId: 1, factKey: 1, status: 1 });
knowledgeRecordSchema.index({ gameId: 1, subjectType: 1, subjectId: 1 });

module.exports = mongoose.model("KnowledgeRecord", knowledgeRecordSchema);
