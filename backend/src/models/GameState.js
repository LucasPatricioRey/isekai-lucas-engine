const mongoose = require("mongoose");

const statSchema = new mongoose.Schema(
  {
    current: {
      type: Number,
      required: true,
      min: 0,
    },
    max: {
      type: Number,
      required: true,
      min: 1,
    },
    label: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const injurySchema = new mongoose.Schema(
  {
    injuryId: {
      type: String,
      required: true,
    },
    location: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      enum: ["leve", "moderada", "grave", "critica"],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    effects: {
      type: [String],
      default: [],
    },
    createdDay: {
      type: Number,
      required: true,
    },
    createdTime: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const conditionSchema = new mongoose.Schema(
  {
    conditionId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    severity: {
      type: String,
      default: "normal",
    },
    description: {
      type: String,
      required: true,
    },
    effects: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const inventoryItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    condition: {
      type: String,
      default: "normal",
    },
    equipped: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const skillSchema = new mongoose.Schema(
  {
    skillId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    phase: {
      type: String,
      required: true,
    },
    level: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    exp: {
      type: Number,
      required: true,
      min: 0,
    },
    expToNext: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false }
);

const biologicalAccumulationSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
    },
    minutes: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const biologicalPendingAccumulationSchema = new mongoose.Schema(
  {
    accumulationId: {
      type: String,
      required: true,
    },
    gameId: {
      type: String,
      required: true,
      index: true,
    },
    characterId: {
      type: String,
      required: true,
      default: "char_lucas",
    },
    day: {
      type: Number,
      required: true,
      min: 1,
    },
    blockStart: {
      type: String,
      required: true,
    },
    blockEnd: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    minutes: {
      type: Number,
      required: true,
      min: 0,
    },
    reason: {
      type: String,
      default: "",
    },
    sourceActionSummary: {
      type: String,
      default: "",
    },
    sourceEventLogId: {
      type: String,
      default: "",
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "processed"],
      default: "pending",
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    processedDay: {
      type: Number,
      default: null,
    },
    processedTime: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const gameStateSchema = new mongoose.Schema(
  {
    gameId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: "isekai_lucas_main",
    },

    currentDay: {
      type: Number,
      required: true,
      min: 1,
    },

    diegeticDate: {
      day: {
        type: Number,
        required: true,
      },
      month: {
        type: String,
        required: true,
      },
      season: {
        type: String,
        required: true,
      },
      year: {
        type: Number,
        required: true,
        default: 1,
      },
    },

    block: {
      type: String,
      enum: ["Madrugada", "Mañana", "Mediodía", "Tarde", "Noche"],
      required: true,
    },

    time: {
      type: String,
      required: true,
    },

    locationId: {
      type: String,
      required: true,
      index: true,
    },

    characterId: {
      type: String,
      required: true,
      default: "char_lucas",
    },

    lucasStatus: {
      life: {
        type: statSchema,
        required: true,
      },
      satiety: {
        type: statSchema,
        required: true,
      },
      energy: {
        type: statSchema,
        required: true,
      },
      mp: {
        type: statSchema,
        required: true,
      },
      injuries: {
        type: [injurySchema],
        default: [],
      },
      conditions: {
        type: [conditionSchema],
        default: [],
      },
    },

    moneyCopper: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    inventory: {
      type: [inventoryItemSchema],
      default: [],
    },

    skills: {
      type: [skillSchema],
      default: [],
    },

    activeEventIds: {
      type: [String],
      default: [],
    },

    activeMissionIds: {
      type: [String],
      default: [],
    },

    biologicalClock: {
      lastProcessedTime: {
        type: String,
        required: true,
      },
      currentHourBlock: {
        type: String,
        required: true,
      },
      pendingAccumulation: {
        type: [biologicalAccumulationSchema],
        default: [],
      },
      pendingAccumulations: {
        type: [biologicalPendingAccumulationSchema],
        default: [],
      },
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

module.exports = mongoose.model("GameState", gameStateSchema);
