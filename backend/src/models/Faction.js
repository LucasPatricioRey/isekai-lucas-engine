const mongoose = require("mongoose");

const relationshipWithLucasSchema = new mongoose.Schema(
  {
    reputation: {
      type: Number,
      default: 0,
    },

    trust: {
      type: Number,
      default: 0,
    },

    suspicion: {
      type: Number,
      default: 0,
    },

    institutionalCredit: {
      type: Number,
      default: 0,
    },

    merit: {
      type: Number,
      default: 0,
    },

    accessLevel: {
      type: String,
      enum: ["none", "basic", "trusted", "restricted", "hostile"],
      default: "basic",
    },

    notes: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const factionSchema = new mongoose.Schema(
  {
    factionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      enum: [
        "kingdom",
        "guild",
        "guard",
        "temple",
        "merchant",
        "noble_house",
        "criminal",
        "village",
        "shop",
        "academic",
        "other",
      ],
      default: "other",
    },

    scope: {
      type: String,
      enum: ["local", "regional", "national", "continental"],
      default: "local",
    },

    regionIds: {
      type: [String],
      default: [],
    },

    goals: {
      type: [String],
      default: [],
    },

    resources: {
      type: [String],
      default: [],
    },

    relationshipWithLucas: {
      type: relationshipWithLucasSchema,
      default: () => ({}),
    },

    knownFactsAboutLucas: {
      type: [String],
      default: [],
    },

    activePolicies: {
      type: [String],
      default: [],
    },

    conflicts: {
      type: [String],
      default: [],
    },

    allies: {
      type: [String],
      default: [],
    },

    rivals: {
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

module.exports = mongoose.model("Faction", factionSchema);
