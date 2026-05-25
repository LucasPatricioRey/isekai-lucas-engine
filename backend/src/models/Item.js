const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema(
  {
    itemId: {
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
        "food",
        "weapon",
        "armor",
        "tool",
        "material",
        "medicine",
        "document",
        "quest_item",
        "misc",
      ],
      required: true,
      index: true,
    },

    subtype: {
      type: String,
      default: "",
    },

    description: {
      type: String,
      default: "",
    },

    stackable: {
      type: Boolean,
      default: true,
    },

    basePriceCopper: {
      type: Number,
      default: 0,
      min: 0,
    },

    satietyBonus: {
      type: Number,
      default: 0,
    },

    energyBonus: {
      type: Number,
      default: 0,
    },

    mpBonus: {
      type: Number,
      default: 0,
    },

    durability: {
      max: {
        type: Number,
        default: null,
      },
      defaultCurrent: {
        type: Number,
        default: null,
      },
    },

    rarity: {
      type: String,
      enum: ["common", "uncommon", "rare", "very_rare", "unique"],
      default: "common",
    },

    legalStatus: {
      type: String,
      enum: ["legal", "restricted", "illegal", "unknown"],
      default: "legal",
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

module.exports = mongoose.model("Item", itemSchema);