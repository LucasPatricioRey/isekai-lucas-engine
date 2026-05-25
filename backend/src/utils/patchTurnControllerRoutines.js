const fs = require("fs");

const filePath = "src/controllers/turnController.js";
let text = fs.readFileSync(filePath, "utf8");

if (!text.includes('const { syncNpcRoutines } = require("../services/routineService");')) {
  const importAnchor = 'const Item = require("../models/Item");';

  if (!text.includes(importAnchor)) {
    throw new Error("No se encontro el import anchor de Item.");
  }

  text = text.replace(
    importAnchor,
    `${importAnchor}
const { syncNpcRoutines } = require("../services/routineService");`
  );
}

if (!text.includes("changes.routineSync")) {
  const pattern = /await gameState\.save\(\);\s*const updatedGameState = gameState\.toObject\(\);/;

  if (!pattern.test(text)) {
    throw new Error("No se encontro el bloque await gameState.save() + updatedGameState.");
  }

  text = text.replace(
    pattern,
    `await gameState.save();

    if (changes.time) {
      const routineSync = await syncNpcRoutines({
        day: gameState.currentDay,
        time: gameState.time,
      });

      if (routineSync.updatedCount > 0) {
        changes.routineSync = routineSync;
      }
    }

    const updatedGameState = gameState.toObject();`
  );
}

fs.writeFileSync(filePath, text, "utf8");

console.log("turnController.js integrado correctamente con syncNpcRoutines.");
