const mongoose = require("mongoose");

const modifierSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      default: "",
    },
    multiplier: {
      type: Number,
      default: 1,
      min: 0,
    },
    condition: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const travelRouteSchema = new mongoose.Schema(
  {
    routeId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    fromLocationId: {
      type: String,
      required: true,
      index: true,
    },

    toLocationId: {
      type: String,
      required: true,
      index: true,
    },

    baseMinutes: {
      type: Number,
      required: true,
      min: 1,
    },

    routeType: {
      type: String,
      enum: ["interior", "town", "road", "wilderness", "regional"],
      default: "town",
      index: true,
    },

    dangerLevel: {
      type: String,
      enum: ["safe", "low", "medium", "high", "extreme"],
      default: "safe",
      index: true,
    },

    terrain: {
      type: [String],
      default: [],
    },

    bidirectional: {
      type: Boolean,
      default: true,
    },

    modifiers: {
      type: [modifierSchema],
      default: [],
    },

    source: {
      type: String,
      default: "",
      index: true,
    },

    tags: {
      type: [String],
      default: [],
    },

    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

travelRouteSchema.index({ fromLocationId: 1, toLocationId: 1 });

module.exports = mongoose.model("TravelRoute", travelRouteSchema);
