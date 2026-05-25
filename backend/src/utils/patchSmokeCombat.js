const fs = require("fs");

const filePath = "src/utils/smokeTestRender.js";
let text = fs.readFileSync(filePath, "utf8");

if (!text.includes("/api/combat/enemies")) {
  text = text.replace(
    `  const checkpoints = await request("/api/checkpoints");
  if (!checkpoints.ok) throw new Error("checkpoints fallo");
  console.log("OK /api/checkpoints");`,
    `  const combatEnemies = await request("/api/combat/enemies");
  if (!combatEnemies.ok) throw new Error("combat enemies fallo");
  if (!Array.isArray(combatEnemies.enemies)) throw new Error("combat enemies no devolvio enemies");
  console.log("OK /api/combat/enemies");

  const checkpoints = await request("/api/checkpoints");
  if (!checkpoints.ok) throw new Error("checkpoints fallo");
  console.log("OK /api/checkpoints");`
  );
}

fs.writeFileSync(filePath, text, "utf8");

console.log("smokeTestRender.js actualizado con combat enemies.");
