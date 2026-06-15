const mongoose = require("mongoose");

const observationSchema = new mongoose.Schema(
  {
    day: {
      type: Number,
      default: null,
    },
    time: {
      type: String,
      default: "",
    },
    locationId: {
      type: String,
      default: "",
      index: true,
    },
    summary: {
      type: String,
      default: "",
    },
    byCharacterId: {
      type: String,
      default: "char_lucas",
    },
    byNpcId: {
      type: String,
      default: "",
    },
    certainty: {
      type: String,
      enum: ["unknown", "low", "medium", "high", "confirmed"],
      default: "unknown",
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const evidenceSchema = new mongoose.Schema(
  {
    evidenceId: {
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

    name: {
      type: String,
      required: true,
    },

    summary: {
      type: String,
      default: "",
    },

    type: {
      type: String,
      enum: ["sample", "trace", "note", "object", "document", "testimony", "other"],
      default: "other",
      index: true,
    },

    status: {
      type: String,
      enum: ["observed", "collected", "stored", "reported", "handed_over", "lost", "discarded", "destroyed"],
      default: "observed",
      index: true,
    },

    holderType: {
      type: String,
      enum: ["character", "npc", "location", "faction", "none"],
      default: "character",
      index: true,
    },

    holderId: {
      type: String,
      default: "char_lucas",
      index: true,
    },

    containerItemId: {
      type: String,
      default: "",
    },

    locationId: {
      type: String,
      default: "",
      index: true,
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

    relatedEventIds: {
      type: [String],
      default: [],
      index: true,
    },

    relatedMissionIds: {
      type: [String],
      default: [],
    },

    reportedToNpcIds: {
      type: [String],
      default: [],
    },

    visibleToNpcIds: {
      type: [String],
      default: [],
    },

    condition: {
      type: String,
      default: "normal",
    },

    integrity: {
      type: Number,
      min: 0,
      max: 100,
      default: 100,
    },

    collectedDay: {
      type: Number,
      default: null,
    },

    collectedTime: {
      type: String,
      default: "",
    },

    observations: {
      type: [observationSchema],
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

evidenceSchema.index({ gameId: 1, holderType: 1, holderId: 1, status: 1 });
evidenceSchema.index({ gameId: 1, sourceEventId: 1, status: 1 });

module.exports = mongoose.model("Evidence", evidenceSchema);
