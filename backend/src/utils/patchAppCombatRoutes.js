const fs = require("fs");

const filePath = "src/app.js";
let text = fs.readFileSync(filePath, "utf8");

if (!text.includes('const combatRoutes = require("./routes/combatRoutes");')) {
  text = text.replace(
    'const missionRoutes = require("./routes/missionRoutes");',
    'const missionRoutes = require("./routes/missionRoutes");\nconst combatRoutes = require("./routes/combatRoutes");'
  );
}

if (!text.includes('app.use("/api/combat", combatRoutes);')) {
  text = text.replace(
    'app.use("/api/missions", missionRoutes);',
    'app.use("/api/missions", missionRoutes);\napp.use("/api/combat", combatRoutes);'
  );
}

fs.writeFileSync(filePath, text, "utf8");

console.log("app.js actualizado con combatRoutes.");
