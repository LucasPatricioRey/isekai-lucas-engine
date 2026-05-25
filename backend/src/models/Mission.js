const mongoose = require("mongoose");

const rewardSchema = new mongoose.Schema(
  {
    moneyCopper: {
      type: Number,
      default: 0,
      min: 0,
    },

    items: {
      type: [String],
      default: [],
    },

    other: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const missionSchema = new mongoose.Schema(
  {
    missionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    templateId: {
      type: String,
      default: "",
      index: true,
    },

    title: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
    },

    sourceFactionId: {
      type: String,
      default: "",
      index: true,
    },

    clientNpcId: {
      type: String,
      default: "",
      index: true,
    },

    locationId: {
      type: String,
      default: "",
      index: true,
    },

    rank: {
      type: String,
      enum: [
        "Porcelana",
        "Cobre",
        "Bronce",
        "Hierro",
        "Plata",
        "Oro",
        "Platino",
        "Mithril",
        "Oricalco",
        "Adamantita",
      ],
      default: "Porcelana",
    },

    requirements: {
      type: [String],
      default: [],
    },

    reward: {
      type: rewardSchema,
      default: () => ({}),
    },

    mgReward: {
      type: Number,
      default: 0,
      min: 0,
    },

    riskLevel: {
      type: String,
      enum: ["none", "low", "medium", "high", "extreme"],
      default: "low",
    },

    status: {
      type: String,
      enum: [
        "available",
        "accepted",
        "completed",
        "failed",
        "expired",
        "withdrawn",
        "blocked",
      ],
      default: "available",
      index: true,
    },

    postedDay: {
      type: Number,
      required: true,
    },

    postedTime: {
      type: String,
      required: true,
    },

    expiresDay: {
      type: Number,
      default: null,
    },

    expiresTime: {
      type: String,
      default: "",
    },

    acceptedByCharacterId: {
      type: String,
      default: "",
    },

    acceptedDay: {
      type: Number,
      default: null,
    },

    completedDay: {
      type: Number,
      default: null,
    },

    proofRequired: {
      type: String,
      default: "",
    },

    proofStatus: {
      type: String,
      enum: ["not_required", "pending", "submitted", "verified", "rejected"],
      default: "not_required",
    },

    consequencesIfIgnored: {
      type: [String],
      default: [],
    },

    relatedEventIds: {
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

module.exports = mongoose.model("Mission", missionSchema);