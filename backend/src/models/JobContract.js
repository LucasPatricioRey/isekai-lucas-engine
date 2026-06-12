const mongoose = require("mongoose");

const mealBenefitSchema = new mongoose.Schema(
  {
    mealId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    satietyBonus: {
      type: Number,
      default: 0,
    },
    energyBonus: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const jobShiftSchema = new mongoose.Schema(
  {
    shiftId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    activityCategory: {
      type: String,
      required: true,
      default: "trabajo_normal",
    },
    expectedMinutes: {
      type: Number,
      required: true,
      min: 1,
    },
    payCopper: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "ended"],
      default: "active",
      index: true,
    },
    activeFromDay: {
      type: Number,
      min: 1,
    },
    activeUntilDay: {
      type: Number,
      min: 1,
    },
    inactiveFromDay: {
      type: Number,
      min: 1,
    },
    inactiveReason: {
      type: String,
      default: "",
    },
    lateGraceMinutes: {
      type: Number,
      default: 0,
      min: 0,
    },
    absenceConsequences: {
      type: [String],
      default: [],
    },
    scheduleNotes: {
      type: [String],
      default: [],
    },
    includedMealIds: {
      type: [String],
      default: [],
    },
    typicalTasks: {
      type: [String],
      default: [],
    },
    rules: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const jobContractSchema = new mongoose.Schema(
  {
    contractId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    characterId: {
      type: String,
      required: true,
      index: true,
    },
    jobId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    employerNpcId: {
      type: String,
      required: true,
      index: true,
    },
    locationId: {
      type: String,
      required: true,
      index: true,
    },
    factionId: {
      type: String,
      default: "",
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "paused", "ended"],
      default: "active",
      index: true,
    },
    startDay: {
      type: Number,
      default: 10,
      min: 1,
    },
    pay: {
      dailyCopper: {
        type: Number,
        default: 0,
        min: 0,
      },
      notes: {
        type: String,
        default: "",
      },
    },
    includesMeals: {
      type: Boolean,
      default: false,
    },
    mealBenefits: {
      type: [mealBenefitSchema],
      default: [],
    },
    shifts: {
      type: [jobShiftSchema],
      default: [],
    },
    typicalTasks: {
      type: [String],
      default: [],
    },
    absenceRules: {
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
    flags: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("JobContract", jobContractSchema);
