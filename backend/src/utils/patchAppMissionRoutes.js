const fs = require("fs");

const filePath = "src/app.js";
let text = fs.readFileSync(filePath, "utf8");

if (!text.includes('const missionRoutes = require("./routes/missionRoutes");')) {
  if (text.includes('const economyRoutes = require("./routes/economyRoutes");')) {
    text = text.replace(
      'const economyRoutes = require("./routes/economyRoutes");',
      'const economyRoutes = require("./routes/economyRoutes");\nconst missionRoutes = require("./routes/missionRoutes");'
    );
  } else {
    text = text.replace(
      'const worldRoutes = require("./routes/worldRoutes");',
      'const worldRoutes = require("./routes/worldRoutes");\nconst missionRoutes = require("./routes/missionRoutes");'
    );
  }
}

if (!text.includes('app.use("/api/missions", missionRoutes);')) {
  if (text.includes('app.use("/api/economy", economyRoutes);')) {
    text = text.replace(
      'app.use("/api/economy", economyRoutes);',
      'app.use("/api/economy", economyRoutes);\napp.use("/api/missions", missionRoutes);'
    );
  } else {
    text = text.replace(
      'app.use("/api/world", worldRoutes);',
      'app.use("/api/world", worldRoutes);\napp.use("/api/missions", missionRoutes);'
    );
  }
}

fs.writeFileSync(filePath, text, "utf8");

console.log("app.js actualizado con /api/missions.");
