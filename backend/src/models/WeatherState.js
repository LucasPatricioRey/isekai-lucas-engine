const mongoose = require("mongoose");

const weatherEffectSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
    },
    target: {
      type: String,
      default: "",
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    appliesToRouteTypes: {
      type: [String],
      default: [],
    },
    appliesToTerrain: {
      type: [String],
      default: [],
    },
    reason: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const weatherStateSchema = new mongoose.Schema(
  {
    weatherId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    regionId: {
      type: String,
      required: true,
      index: true,
    },

    currentCondition: {
      type: String,
      enum: ["clear", "cloudy", "light_rain", "heavy_rain", "fog", "cold", "heat"],
      required: true,
      index: true,
    },

    intensity: {
      type: Number,
      default: 1,
      min: 0,
      max: 10,
    },

    startedDay: {
      type: Number,
      required: true,
    },

    startedTime: {
      type: String,
      required: true,
    },

    expectedUntilDay: {
      type: Number,
      default: null,
    },

    expectedUntilTime: {
      type: String,
      default: "",
    },

    effects: {
      type: [weatherEffectSchema],
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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("WeatherState", weatherStateSchema);
