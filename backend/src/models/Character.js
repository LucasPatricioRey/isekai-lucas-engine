const mongoose = require("mongoose");

const characterSchema = new mongoose.Schema(
  {
    characterId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: "char_lucas",
    },

    name: {
      type: String,
      required: true,
    },

    apparentAge: {
      type: Number,
      required: true,
      min: 1,
    },

    realPastLifeAge: {
      type: Number,
      default: null,
    },

    visual: {
      heightCm: {
        type: Number,
        default: null,
      },
      hair: {
        type: String,
        default: "",
      },
      eyes: {
        type: String,
        default: "",
      },
      skin: {
        type: String,
        default: "",
      },
      body: {
        type: String,
        default: "",
      },
      clothing: {
        type: String,
        default: "",
      },
      presence: {
        type: String,
        default: "",
      },
      notes: {
        type: String,
        default: "",
      },
    },

    background: {
      currentWorldSummary: {
        type: String,
        default: "",
      },
      pastLifeSummary: {
        type: String,
        default: "",
      },
      reincarnationSummary: {
        type: String,
        default: "",
      },
    },

    modernKnowledgeProfile: {
      type: [String],
      default: [],
    },

    basePersonality: {
      type: [String],
      default: [],
    },

    staticFlags: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Character", characterSchema);