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

const activeEffectSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
    },
    reason: {
      type: String,
      default: "",
    },
    expiresDay: {
      type: Number,
      default: null,
    },
    expiresTime: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const locationSchema = new mongoose.Schema(
  {
    locationId: {
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
      default: "",
    },

    regionId: {
      type: String,
      default: "",
      index: true,
    },

    parentLocationId: {
      type: String,
      default: "",
    },

    ownerNpcId: {
      type: String,
      default: "",
    },

    controllingFactionId: {
      type: String,
      default: "",
    },

    currentStatus: {
      type: String,
      enum: [
        "operational",
        "closed",
        "damaged",
        "looted",
        "under_repair",
        "blocked",
        "dangerous",
        "restricted",
      ],
      default: "operational",
      index: true,
    },

    openHours: {
      type: [openHourSchema],
      default: [],
    },

    services: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    dangerLevel: {
      type: String,
      enum: ["safe", "low", "medium", "high", "extreme"],
      default: "safe",
    },

    activeEffects: {
      type: [activeEffectSchema],
      default: [],
    },

    visibleNpcIds: {
      type: [String],
      default: [],
    },

    probableNpcIds: {
      type: [String],
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

module.exports = mongoose.model("Location", locationSchema);