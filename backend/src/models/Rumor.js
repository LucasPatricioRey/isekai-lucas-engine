const mongoose = require("mongoose");

const rumorSchema = new mongoose.Schema(
  {
    rumorId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    content: {
      type: String,
      required: true,
    },

    originalContent: {
      type: String,
      default: "",
    },

    origin: {
      type: String,
      default: "",
    },

    source: {
      type: String,
      default: "",
      index: true,
    },

    sourceType: {
      type: String,
      enum: [
        "anonymous",
        "npc",
        "faction",
        "public_event",
        "mission",
        "market",
        "guild",
        "temple",
        "guard",
      ],
      default: "anonymous",
    },

    certainty: {
      type: String,
      enum: ["confirmed", "probable", "rumor", "doubtful"],
      default: "rumor",
    },

    distortionLevel: {
      type: Number,
      min: 0,
      max: 4,
      default: 0,
    },

    knownByNpcIds: {
      type: [String],
      default: [],
    },

    knownByFactionIds: {
      type: [String],
      default: [],
    },

    locationIds: {
      type: [String],
      default: [],
      index: true,
    },

    relatedEventIds: {
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

    expiresDay: {
      type: Number,
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "faded", "debunked", "confirmed"],
      default: "active",
      index: true,
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

module.exports = mongoose.model("Rumor", rumorSchema);
