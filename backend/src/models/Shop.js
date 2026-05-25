const mongoose = require("mongoose");

const openHourSchema = new mongoose.Schema(
  {
    dayType: {
      type: String,
      default: "normal",
    },
    open: {
      type: String,
      default: "",
    },
    close: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const shopSchema = new mongoose.Schema(
  {
    shopId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
    },

    locationId: {
      type: String,
      required: true,
      index: true,
    },

    ownerNpcId: {
      type: String,
      default: "",
      index: true,
    },

    type: {
      type: String,
      enum: [
        "food",
        "smithy",
        "herbalist",
        "tailor",
        "general_store",
        "inn",
        "guild",
        "bank",
        "market_stall",
        "other",
      ],
      default: "other",
    },

    factionId: {
      type: String,
      default: "",
    },

    openHours: {
      type: [openHourSchema],
      default: [],
    },

    status: {
      type: String,
      enum: [
        "operational",
        "closed",
        "damaged",
        "looted",
        "under_repair",
        "blocked",
        "restricted",
      ],
      default: "operational",
      index: true,
    },

    pricingProfile: {
      priceMultiplier: {
        type: Number,
        default: 1,
        min: 0,
      },
      notes: {
        type: String,
        default: "",
      },
    },

    acceptsDebt: {
      type: Boolean,
      default: false,
    },

    services: {
      buy: {
        type: Boolean,
        default: true,
      },
      sell: {
        type: Boolean,
        default: true,
      },
      repair: {
        type: Boolean,
        default: false,
      },
      lodging: {
        type: Boolean,
        default: false,
      },
      food: {
        type: Boolean,
        default: false,
      },
      loans: {
        type: Boolean,
        default: false,
      },
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

module.exports = mongoose.model("Shop", shopSchema);