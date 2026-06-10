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
  title: "text",
  content: "text",
  tags: "text",
});

module.exports = mongoose.model("WorldDocumentIndex", worldDocumentIndexSchema);
