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

const magicDisciplineSchema = new mongoose.Schema(
  {
    disciplineId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
    },
    parentDisciplineId: {
      type: String,
      default: "",
      index: true,
    },
    type: {
      type: String,
      enum: ["foundation", "sense", "branch", "element", "specialized"],
      default: "branch",
      index: true,
    },
    description: {
      type: String,
      default: "",
    },
    unlockRequirements: {
      skills: {
        type: [skillRequirementSchema],
        default: [],
      },
      notes: {
        type: String,
        default: "",
      },
    },
    socialRisk: {
      type: String,
      enum: ["none", "low", "medium", "high"],
      default: "low",
    },
    order: {
      type: Number,
      default: 0,
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

module.exports = mongoose.model("MagicDiscipline", magicDisciplineSchema);
