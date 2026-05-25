const mongoose = require("mongoose");

const restockRuleSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["none", "daily", "weekly", "by_event", "manual"],
      default: "manual",
    },

    amount: {
      type: Number,
      default: 0,
      min: 0,
    },

    condition: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const shopStockSchema = new mongoose.Schema(
  {
    stockId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    shopId: {
      type: String,
      required: true,
      index: true,
    },

    itemId: {
      type: String,
      required: true,
      index: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    reservedQuantity: {
      type: Number,
      min: 0,
      default: 0,
    },

    basePriceCopper: {
      type: Number,
      required: true,
      min: 0,
    },

    currentPriceCopper: {
      type: Number,
      required: true,
      min: 0,
    },

    quality: {
      type: String,
      enum: ["poor", "normal", "good", "excellent", "special"],
      default: "normal",
    },

    restockRule: {
      type: restockRuleSchema,
      default: () => ({}),
    },

    scarcityFlags: {
      type: [String],
      default: [],
    },

    lastRestockedDay: {
      type: Number,
      default: null,
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

shopStockSchema.index({ shopId: 1, itemId: 1 }, { unique: true });

module.exports = mongoose.model("ShopStock", shopStockSchema);