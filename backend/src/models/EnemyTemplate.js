const mongoose = require("mongoose");

const enemyAttackSchema = new mongoose.Schema(
  {
    attackId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    actionType: {
      type: String,
      default: "attack",
    },
    rangeBand: {
      type: String,
      enum: ["grappled", "engaged", "near", "short", "medium", "far"],
      default: "engaged",
    },
    damageType: {
      type: String,
      default: "physical",
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
    fatigueCost: {
      type: Number,
      default: 0,
      min: 0,
    },
    traits: {
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

const enemyDefenseSchema = new mongoose.Schema(
  {
    defenseId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    defenseType: {
      type: String,
      enum: ["dodge", "block", "armor", "resistance", "instinct", "other"],
      default: "other",
    },
    modifier: {
      type: Number,
      default: 0,
    },
    traits: {
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

const movementProfileSchema = new mongoose.Schema(
  {
    speed: {
      type: Number,
      default: 0,
      min: 0,
    },
    preferredDistance: {
      type: String,
      enum: ["grappled", "engaged", "near", "short", "medium", "far", "out_of_sight", ""],
      default: "",
    },
    canClimb: {
      type: Boolean,
      default: false,
    },
    canSwim: {
      type: Boolean,
      default: false,
    },
    canFly: {
      type: Boolean,
      default: false,
    },
    terrainAdvantages: {
      type: [String],
      default: [],
    },
    terrainDisadvantages: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const sensesProfileSchema = new mongoose.Schema(
  {
    vision: {
      type: String,
      default: "normal",
    },
    hearing: {
      type: String,
      default: "normal",
    },
    smell: {
      type: String,
      default: "normal",
    },
    specialSenses: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const moraleProfileSchema = new mongoose.Schema(
  {
    baseState: {
      type: String,
      enum: ["confident", "cautious", "angered", "afraid", "panicked", "fleeing", "surrendering", "cornered", "berserk", "unknown"],
      default: "cautious",
    },
    breaksAt: {
      type: Number,
      default: 0,
      min: 0,
    },
    fleesAt: {
      type: Number,
      default: 0,
      min: 0,
    },
    surrenderPossible: {
      type: Boolean,
      default: false,
    },
    modifiers: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const behaviorProfileSchema = new mongoose.Schema(
  {
    archetype: {
      type: String,
      enum: [
        "territorial",
        "hungry",
        "protective",
        "predatory",
        "trained",
        "cowardly",
        "ambusher",
        "opportunist",
        "mindless",
        "unknown",
      ],
      default: "unknown",
    },
    preferredActions: {
      type: [String],
      default: [],
    },
    avoidsActions: {
      type: [String],
      default: [],
    },
    targetPriority: {
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

const lootProfileSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      enum: ["none", "proof_only", "logical_search", "mission_only", "corpse_materials", "held_items"],
      default: "logical_search",
    },
    candidateItems: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    requiresTool: {
      type: Boolean,
      default: false,
    },
    requiresSearchAction: {
      type: Boolean,
      default: true,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const evidenceProfileSchema = new mongoose.Schema(
  {
    possibleEvidenceTypes: {
      type: [String],
      default: [],
    },
    proofItems: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
    defaultProofStatus: {
      type: String,
      enum: ["none", "unverified", "partial", "verified"],
      default: "unverified",
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const enemyTemplateSchema = new mongoose.Schema(
  {
    enemyId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
    },

    species: {
      type: String,
      default: "",
      index: true,
    },

    type: {
      type: String,
      enum: ["animal", "beast", "monster", "human_hostile", "anomaly"],
      required: true,
      index: true,
    },

    // Legacy risk label used by current APIs.
    dangerLevel: {
      type: String,
      enum: ["trivial", "low", "medium", "high", "extreme"],
      default: "low",
      index: true,
    },

    // Advanced combat risk label. Defaults from dangerLevel for compatibility.
    dangerRank: {
      type: String,
      enum: ["trivial", "low", "medium", "high", "extreme"],
      default: "low",
      index: true,
    },

    rankHint: {
      type: String,
      default: "Porcelana",
    },

    baseStats: {
      hp: { type: Number, default: null, min: 1 },
      mp: { type: Number, default: 0, min: 0 },
      // Legacy alias kept because existing services and seeds read baseStats.life.
      life: { type: Number, required: true, min: 1 },
      attack: { type: Number, required: true, min: 0 },
      defense: { type: Number, required: true, min: 0 },
      agility: { type: Number, required: true, min: 0 },
      perception: { type: Number, required: true, min: 0 },
      endurance: { type: Number, default: 0, min: 0 },
      morale: { type: Number, required: true, min: 0 },
      speed: { type: Number, default: 0, min: 0 },
      awareness: { type: Number, default: 0, min: 0 },
      instinct: { type: Number, default: 0, min: 0 },
    },

    attacks: {
      type: [enemyAttackSchema],
      default: [],
    },

    defenses: {
      type: [enemyDefenseSchema],
      default: [],
    },

    movement: {
      type: movementProfileSchema,
      default: () => ({}),
    },

    senses: {
      type: sensesProfileSchema,
      default: () => ({}),
    },

    moraleProfile: {
      type: moraleProfileSchema,
      default: () => ({}),
    },

    behaviorProfile: {
      type: behaviorProfileSchema,
      default: () => ({}),
    },

    lootProfile: {
      type: lootProfileSchema,
      default: () => ({}),
    },

    evidenceProfile: {
      type: evidenceProfileSchema,
      default: () => ({}),
    },

    habitatTags: {
      type: [String],
      default: [],
      index: true,
    },

    // Legacy narrative fields kept for current search/audits.
    behavior: {
      type: [String],
      default: [],
    },

    zones: {
      type: [String],
      default: [],
    },

    signals: {
      type: [String],
      default: [],
    },

    retreatLogic: {
      type: String,
      default: "",
    },

    rewardPolicy: {
      type: String,
      default: "No hay recompensa automatica. Solo si existe contrato, prueba o loot logico.",
    },

    tags: {
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

enemyTemplateSchema.pre("validate", function syncAdvancedCombatAliases() {
  if (!this.dangerRank && this.dangerLevel) this.dangerRank = this.dangerLevel;
  if (this.baseStats) {
    if (!this.baseStats.hp && this.baseStats.life) this.baseStats.hp = this.baseStats.life;
    if (!this.baseStats.life && this.baseStats.hp) this.baseStats.life = this.baseStats.hp;
    if (!this.baseStats.speed) this.baseStats.speed = this.baseStats.agility || 0;
    if (!this.baseStats.awareness) this.baseStats.awareness = this.baseStats.perception || 0;
    if (!this.baseStats.instinct) this.baseStats.instinct = this.baseStats.perception || 0;
  }
  if (!this.species) this.species = this.type;
  if (this.habitatTags.length === 0 && this.zones.length > 0) {
    this.habitatTags = this.zones;
  }
});

enemyTemplateSchema.index({ type: 1, dangerLevel: 1, name: 1 });
enemyTemplateSchema.index({ type: 1, dangerRank: 1, name: 1 });

module.exports = mongoose.model("EnemyTemplate", enemyTemplateSchema);
