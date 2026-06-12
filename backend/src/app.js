const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const fs = require("fs");

const contextRoutes = require("./routes/contextRoutes");
const turnRoutes = require("./routes/turnRoutes");
const searchRoutes = require("./routes/searchRoutes");
const npcRoutes = require("./routes/npcRoutes");
const locationRoutes = require("./routes/locationRoutes");
const characterRoutes = require("./routes/characterRoutes");
const checkpointRoutes = require("./routes/checkpointRoutes");
const worldRoutes = require("./routes/worldRoutes");
const economyRoutes = require("./routes/economyRoutes");
const missionRoutes = require("./routes/missionRoutes");
const combatRoutes = require("./routes/combatRoutes");
const jobRoutes = require("./routes/jobRoutes");
const needsRoutes = require("./routes/needsRoutes");
const progressionRoutes = require("./routes/progressionRoutes");
const magicRoutes = require("./routes/magicRoutes");
const travelRoutes = require("./routes/travelRoutes");
const weatherRoutes = require("./routes/weatherRoutes");

const app = express();

const PUBLIC_DOC_FILES = new Set([
  "openapi-gpt-action.json",
  "openapi-gpt-action-compact.json",
  "openapi-gpt-action-admin.json",
  "openapi-gpt-action-admin-extra.json",
  "openapi-gpt-action-combat.json",
]);

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Isekai Lucas Engine API funcionando",
  });
});

app.get("/docs/:fileName", (req, res) => {
  const fileName = req.params.fileName;

  if (!PUBLIC_DOC_FILES.has(fileName)) {
    return res.status(404).json({
      ok: false,
      error: "Documento no disponible.",
    });
  }

  const filePath = path.resolve(__dirname, "../docs", fileName);
  const protocol = String(req.get("x-forwarded-proto") || req.protocol || "https")
    .split(",")[0]
    .trim();
  const host = String(req.get("x-forwarded-host") || req.get("host") || "")
    .split(",")[0]
    .trim();

  if (!host) {
    return res.status(400).json({
      ok: false,
      error: "No se pudo resolver host para el schema.",
    });
  }

  const openApi = JSON.parse(fs.readFileSync(filePath, "utf8"));
  openApi.servers = [{ url: `${protocol}://${host}` }];

  return res.json(openApi);
});

app.use("/api/context", contextRoutes);
app.use("/api/turn", turnRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/npcs", npcRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/characters", characterRoutes);
app.use("/api/checkpoints", checkpointRoutes);
app.use("/api/world", worldRoutes);
app.use("/api/economy", economyRoutes);
app.use("/api/missions", missionRoutes);
app.use("/api/combat", combatRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/needs", needsRoutes);
app.use("/api/progression", progressionRoutes);
app.use("/api/magic", magicRoutes);
app.use("/api/travel", travelRoutes);
app.use("/api/weather", weatherRoutes);

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Ruta no encontrada",
  });
});

module.exports = app;
