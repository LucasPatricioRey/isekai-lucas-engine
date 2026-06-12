const mongoose = require("mongoose");

const conditionRulesSchema = new mongoose.Schema(
  {
    durabilityMatters: {
      type: Boolean,
      default: false,
    },
    canBreak: {
      type: Boolean,
      default: false,
    },
    breakRiskNotes: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const weaponProfileSchema = new mongoose.Schema(
  {
    weaponProfileId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    itemId: {
      type: String,
      default: "",
      index: true,
    },

    name: {
      type: String,
      required: true,
    },

    weaponType: {
      type: String,
      enum: [
        "unarmed",
        "dagger",
        "short_sword",
        "long_sword",
        "spear",
        "staff",
        "club",
        "axe",
        "bow",
        "crossbow",
        "shield",
        "improvised",
      ],
      required: true,
      index: true,
    },

    rangeBand: {
      type: String,
      enum: ["grappled", "engaged", "near", "short", "medium", "far"],
      default: "engaged",
      index: true,
    },

    damageType: {
      type: String,
      enum: ["blunt", "cut", "pierce", "mixed", "none"],
      default: "blunt",
    },

    baseDamage: {
      type: Number,
      default: 0,
      min: 0,
    },

    accuracyModifier: {
      type: Number,
      default: 0,
    },

    defenseModifier: {
      type: Number,
      default: 0,
    },

    speedModifier: {
      type: Number,
      default: 0,
    },

    fatigueCostModifier: {
      type: Number,
      default: 0,
    },

    requiredSkillId: {
      type: String,
      default: "",
      index: true,
    },

    offhandAllowed: {
      type: Boolean,
      default: false,
    },

    traits: {
      type: [String],
      enum: [
        "light",
        "heavy",
        "reach",
        "thrown",
        "two_handed",
        "defensive",
        "armor_piercing",
        "nonlethal",
        "improvised",
        "concealable",
        "slow",
        "fast",
      ],
      default: [],
      index: true,
    },

    conditionRules: {
      type: conditionRulesSchema,
      default: () => ({}),
    },

    notes: {
      type: String,
      default: "",
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

weaponProfileSchema.index({ weaponType: 1, rangeBand: 1, name: 1 });

module.exports = mongoose.model("WeaponProfile", weaponProfileSchema);
