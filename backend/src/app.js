const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

const contextRoutes = require("./routes/contextRoutes");
const turnRoutes = require("./routes/turnRoutes");
const searchRoutes = require("./routes/searchRoutes");
const npcRoutes = require("./routes/npcRoutes");
const locationRoutes = require("./routes/locationRoutes");
const checkpointRoutes = require("./routes/checkpointRoutes");
const worldRoutes = require("./routes/worldRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Isekai Lucas Engine API funcionando",
  });
});

app.use("/api/context", contextRoutes);
app.use("/api/turn", turnRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/npcs", npcRoutes);
app.use("/api/locations", locationRoutes);
app.use("/api/checkpoints", checkpointRoutes);
app.use("/api/world", worldRoutes);

app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: "Ruta no encontrada",
  });
});

module.exports = app;
