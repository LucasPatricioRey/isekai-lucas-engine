const mongoose = require("mongoose");

const routineEntrySchema = new mongoose.Schema(
  {
    dayType: {
      type: String,
      default: "normal",
    },
    timeStart: {
      type: String,
      required: true,
    },
    timeEnd: {
      type: String,
      required: true,
    },
    locationId: {
      type: String,
      required: true,
    },
    task: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

const relationshipSchema = new mongoose.Schema(
  {
    trust: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    familiarity: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    affection: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    suspicion: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    respect: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    fear: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    jealousy: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    socialDebt: {
      type: Number,
      default: 0,
      min: -100,
      max: 100,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const socialProfileSchema = new mongoose.Schema(
  {
    archetype: {
      type: String,
      default: "",
    },
    affinityTags: {
      type: [String],
      default: [],
    },
    frictionTags: {
      type: [String],
      default: [],
    },
    trustSignals: {
      type: [String],
      default: [],
    },
    respectSignals: {
      type: [String],
      default: [],
    },
    affectionSignals: {
      type: [String],
      default: [],
    },
    suspicionSignals: {
      type: [String],
      default: [],
    },
    fearSignals: {
      type: [String],
      default: [],
    },
    jealousySignals: {
      type: [String],
      default: [],
    },
    boundaries: {
      type: [String],
      default: [],
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const emotionalProfileSchema = new mongoose.Schema(
  {
    schemaVersion: {
      type: String,
      default: "emotional_profile_v1",
    },
    defaultMood: {
      type: String,
      default: "",
    },
    coreDrives: {
      type: [String],
      default: [],
    },
    coreFears: {
      type: [String],
      default: [],
    },
    pride: {
      type: String,
      default: "",
    },
    softSpots: {
      type: [String],
      default: [],
    },
    stressors: {
      type: [String],
      default: [],
    },
    visibleTells: {
      type: [String],
      default: [],
    },
    copingStyle: {
      type: String,
      default: "",
    },
    contradiction: {
      type: String,
      default: "",
    },
    sceneHooks: {
      type: [String],
      default: [],
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const factionLinkSchema = new mongoose.Schema(
  {
    factionId: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: "",
    },
    loyalty: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const secretSchema = new mongoose.Schema(
  {
    secretId: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    visibility: {
      type: String,
      enum: ["unknown", "rumor", "known_by_few", "public"],
      default: "unknown",
    },
  },
  { _id: false }
);

const npcSchema = new mongoose.Schema(
  {
    npcId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
    },

    age: {
      type: Number,
      default: null,
    },

    role: {
      type: String,
      default: "",
    },

    regionId: {
      type: String,
      default: "",
      index: true,
    },

    cityId: {
      type: String,
      default: "",
      index: true,
    },

    homeLocationId: {
      type: String,
      default: "",
    },

    currentLocationId: {
      type: String,
      default: "",
      index: true,
    },

    currentTask: {
      type: String,
      default: "",
    },

    availability: {
      status: {
        type: String,
        enum: ["available", "busy", "absent", "sleeping", "traveling", "unknown"],
        default: "unknown",
      },
      reason: {
        type: String,
        default: "",
      },
    },

    persistenceLevel: {
      type: String,
      enum: ["important", "secondary", "background_prepared"],
      default: "secondary",
    },

    personality: {
      type: [String],
      default: [],
    },

    speechStyle: {
      type: String,
      default: "",
    },

    values: {
      type: [String],
      default: [],
    },

    tolerates: {
      type: [String],
      default: [],
    },

    rejects: {
      type: [String],
      default: [],
    },

    routineBase: {
      type: [routineEntrySchema],
      default: [],
    },

    relationshipWithLucas: {
      type: relationshipSchema,
      default: () => ({}),
    },

    socialProfile: {
      type: socialProfileSchema,
      default: () => ({}),
    },

    emotionalProfile: {
      type: emotionalProfileSchema,
      default: () => ({}),
    },

    factionLinks: {
      type: [factionLinkSchema],
      default: [],
    },

    secrets: {
      type: [secretSchema],
      default: [],
    },

    knownPublicFacts: {
      type: [String],
      default: [],
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

module.exports = mongoose.model("Npc", npcSchema);
