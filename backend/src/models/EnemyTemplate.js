const mongoose = require("mongoose");

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

    type: {
      type: String,
      enum: ["animal", "beast", "monster", "human_hostile", "anomaly"],
      required: true,
    },

    dangerLevel: {
      type: String,
      enum: ["trivial", "low", "medium", "high", "extreme"],
      default: "low",
    },

    rankHint: {
      type: String,
      default: "Porcelana",
    },

    baseStats: {
      life: { type: Number, required: true, min: 1 },
      attack: { type: Number, required: true, min: 0 },
      defense: { type: Number, required: true, min: 0 },
      agility: { type: Number, required: true, min: 0 },
      perception: { type: Number, required: true, min: 0 },
      morale: { type: Number, required: true, min: 0 },
    },

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
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("EnemyTemplate", enemyTemplateSchema);
