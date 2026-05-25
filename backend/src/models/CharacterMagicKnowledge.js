const mongoose = require("mongoose");

const characterMagicKnowledgeSchema = new mongoose.Schema(
  {
    knowledgeId: {
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
    techniqueId: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["unknown", "practicing", "known", "mastered", "blocked"],
      default: "unknown",
      index: true,
    },
    learnedDay: {
      type: Number,
      default: null,
    },
    learnedTime: {
      type: String,
      default: "",
    },
    source: {
      type: String,
      default: "",
      index: true,
    },
    notes: {
      type: String,
      default: "",
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

characterMagicKnowledgeSchema.index({ characterId: 1, techniqueId: 1 }, { unique: true });

module.exports = mongoose.model("CharacterMagicKnowledge", characterMagicKnowledgeSchema);
