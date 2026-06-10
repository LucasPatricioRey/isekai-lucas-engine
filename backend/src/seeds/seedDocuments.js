require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
const connectDB = require("../config/db");

const WorldDocumentIndex = require("../models/WorldDocumentIndex");

function chunkText(text, maxLength = 1200) {
  const chunks = [];
  const sections = text.split(/\n(?=## )/g);

  for (const section of sections) {
    if (section.length <= maxLength) {
      chunks.push(section.trim());
      continue;
    }

    for (let i = 0; i < section.length; i += maxLength) {
      chunks.push(section.slice(i, i + maxLength).trim());
    }
  }

  return chunks.filter(Boolean);
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractVersion(content) {
  const match = String(content || "").match(/^Versi(?:o|ó|Ã³)n:\s*(.+)$/imu);
  return match ? match[1].trim() : "sin_version";
}

async function seedDocuments() {
  await connectDB();

  const docsDir = path.join(__dirname, "../../docs");

  const files = [
    {
      fileName: "rules_engine.md",
      source: "rules_engine",
    },
    {
      fileName: "world_bible.md",
      source: "world_bible",
    },
  ];

  await WorldDocumentIndex.deleteMany({
    source: { $in: ["rules_engine", "world_bible"] },
  });

  const docsToInsert = [];

  for (const file of files) {
    const fullPath = path.join(docsDir, file.fileName);
    const content = await fs.readFile(fullPath, "utf8");
    const chunks = chunkText(content);
    const version = extractVersion(content);

    chunks.forEach((chunk, index) => {
      const firstLine = chunk.split("\n")[0] || file.fileName;
      const title = firstLine.replace(/^#+\s*/, "");

      docsToInsert.push({
        docId: `${file.source}_${index + 1}`,
        source: file.source,
        section: title,
        title,
        content: chunk,
        searchText: normalizeSearchText(`${file.source} ${title} ${chunk}`),
        tags: [file.source, file.fileName.replace(".md", "")],
        version,
      });
    });
  }

  if (docsToInsert.length > 0) {
    await WorldDocumentIndex.insertMany(docsToInsert);
  }

  console.log(`Documentos indexados correctamente: ${docsToInsert.length}`);

  await mongoose.disconnect();
}

seedDocuments().catch(async (error) => {
  console.error("Error indexando documentos:", error);
  await mongoose.disconnect();
  process.exit(1);
});
