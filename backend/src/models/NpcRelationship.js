const mongoose = require("mongoose");

function normalizePair(npcAId, npcBId) {
  return [npcAId, npcBId].sort();
}

const npcRelationshipSchema = new mongoose.Schema(
  {
    relationshipId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    npcAId: {
      type: String,
      required: true,
      index: true,
    },

    npcBId: {
      type: String,
      required: true,
      index: true,
    },

    type: {
      type: String,
      required: true,
      index: true,
    },

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

    tension: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    publicSummary: {
      type: String,
      required: true,
    },

    privateNotes: {
      type: String,
      default: "",
    },

    knownToLucas: {
      type: Boolean,
      default: false,
      index: true,
    },

    source: {
      type: String,
      default: "seed",
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

npcRelationshipSchema.pre("validate", function normalizeRelationshipPair() {
  if (this.npcAId && this.npcBId) {
    const [npcAId, npcBId] = normalizePair(this.npcAId, this.npcBId);
    this.npcAId = npcAId;
    this.npcBId = npcBId;

    if (!this.relationshipId) {
      this.relationshipId = `rel_${npcAId}_${npcBId}`;
    }
  }
});

npcRelationshipSchema.index({ npcAId: 1, npcBId: 1 }, { unique: true });

module.exports = mongoose.model("NpcRelationship", npcRelationshipSchema);
