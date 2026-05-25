const fs = require("fs");

const filePath = "src/app.js";
let text = fs.readFileSync(filePath, "utf8");

if (!text.includes('const economyRoutes = require("./routes/economyRoutes");')) {
  text = text.replace(
    'const worldRoutes = require("./routes/worldRoutes");',
    'const worldRoutes = require("./routes/worldRoutes");\nconst economyRoutes = require("./routes/economyRoutes");'
  );
}

if (!text.includes('app.use("/api/economy", economyRoutes);')) {
  text = text.replace(
    'app.use("/api/world", worldRoutes);',
    'app.use("/api/world", worldRoutes);\napp.use("/api/economy", economyRoutes);'
  );
}

fs.writeFileSync(filePath, text, "utf8");

console.log("app.js actualizado con /api/economy.");
