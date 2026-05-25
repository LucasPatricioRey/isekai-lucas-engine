const mongoose = require("mongoose");

const skillRequirementSchema = new mongoose.Schema(
  {
    skillId: {
      type: String,
      required: true,
    },
    minPhase: {
      type: String,
      default: "Principiante",
    },
    minLevel: {
      type: Number,
      default: 1,
      min: 1,
      max: 10,
    },
  },
  { _id: false }
);

const expSuggestionSchema = new mongoose.Schema(
  {
    skillId: {
      type: String,
      required: true,
    },
    skillName: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      required: true,
    },
    baseExp: {
      type: Number,
      required: true,
      min: 0,
    },
    reason: {
      type: String,
      default: "",
    },
    allowVirtualSkillPreview: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const mpCostSchema = new mongoose.Schema(
  {
    fixed: {
      type: Number,
      default: 0,
      min: 0,
    },
    min: {
      type: Number,
      default: 0,
      min: 0,
    },
    max: {
      type: Number,
      default: 0,
      min: 0,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const magicTechniqueSchema = new mongoose.Schema(
  {
    techniqueId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    disciplineId: {
      type: String,
      required: true,
      index: true,
    },
    kind: {
      type: String,
      enum: ["practice", "exercise", "theory", "trick", "spell"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["available", "locked_template", "deprecated"],
      default: "available",
      index: true,
    },
    description: {
      type: String,
      default: "",
    },
    defaultMinutes: {
      type: Number,
      default: 30,
      min: 1,
    },
    minMinutes: {
      type: Number,
      default: 5,
      min: 1,
    },
    maxMinutes: {
      type: Number,
      default: 120,
      min: 1,
    },
    activityCategory: {
      type: String,
      default: "descanso_sentado",
    },
    difficulty: {
      type: String,
      enum: ["safe", "basic", "intermediate", "advanced", "dangerous"],
      default: "basic",
      index: true,
    },
    mpCost: {
      type: mpCostSchema,
      default: () => ({}),
    },
    requirements: {
      skills: {
        type: [skillRequirementSchema],
        default: [],
      },
      knownTechniqueIds: {
        type: [String],
        default: [],
      },
      notes: {
        type: String,
        default: "",
      },
    },
    expSuggestions: {
      type: [expSuggestionSchema],
      default: [],
    },
    isRealSpell: {
      type: Boolean,
      default: false,
      index: true,
    },
    isAdvanced: {
      type: Boolean,
      default: false,
      index: true,
    },
    isOffensive: {
      type: Boolean,
      default: false,
      index: true,
    },
    canUnlockAutomatically: {
      type: Boolean,
      default: false,
    },
    publicUseRisk: {
      type: String,
      enum: ["none", "low", "medium", "high"],
      default: "low",
    },
    safetyNotes: {
      type: [String],
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
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("MagicTechnique", magicTechniqueSchema);
