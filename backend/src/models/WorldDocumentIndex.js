const mongoose = require("mongoose");

const worldDocumentIndexSchema = new mongoose.Schema(
  {
    docId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    source: {
      type: String,
      enum: ["rules_engine", "world_bible", "migration_notes", "static_seed"],
      required: true,
      index: true,
    },

    section: {
      type: String,
      default: "",
    },

    title: {
      type: String,
      required: true,
    },

    ruleId: {
      type: String,
      default: "",
      index: true,
    },

    domain: {
      type: String,
      default: "",
      index: true,
    },

    priority: {
      type: String,
      enum: ["critical", "high", "normal", "reference", ""],
      default: "",
      index: true,
    },

    appliesTo: {
      type: [String],
      default: [],
      index: true,
    },

    must: {
      type: [String],
      default: [],
    },

    never: {
      type: [String],
      default: [],
    },

    template: {
      type: String,
      default: "",
    },

    content: {
      type: String,
      required: true,
    },

    searchText: {
      type: String,
      default: "",
      index: true,
    },

    tags: {
      type: [String],
      default: [],
      index: true,
    },

    version: {
      type: String,
      default: "v1",
    },
  },
  {
    timestamps: true,
  }
);

worldDocumentIndexSchema.index({
  ruleId: "text",
  domain: "text",
  appliesTo: "text",
  title: "text",
  content: "text",
  tags: "text",
});

module.exports = mongoose.model("WorldDocumentIndex", worldDocumentIndexSchema);
