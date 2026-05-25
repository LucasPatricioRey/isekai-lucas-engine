const fs = require("fs");

const filePath = "src/controllers/turnController.js";
let text = fs.readFileSync(filePath, "utf8");

if (!text.includes('const Item = require("../models/Item");')) {
  text = text.replace(
    'const ShopStock = require("../models/ShopStock");',
    'const ShopStock = require("../models/ShopStock");\nconst Item = require("../models/Item");'
  );
}

if (!text.includes("function timeToMinutes(time)")) {
  text = text.replace(
`function getBlockFromTime(time) {
  const hour = Number(time.split(":")[0]);

  if (hour >= 0 && hour < 6) return "Madrugada";
  if (hour >= 6 && hour < 12) return "Mañana";
  if (hour >= 12 && hour < 14) return "Mediodía";
  if (hour >= 14 && hour < 18) return "Tarde";
  return "Noche";
}`,
`function getBlockFromTime(time) {
  const hour = Number(time.split(":")[0]);

  if (hour >= 0 && hour < 6) return "Madrugada";
  if (hour >= 6 && hour < 12) return "Mañana";
  if (hour >= 12 && hour < 14) return "Mediodía";
  if (hour >= 14 && hour < 18) return "Tarde";
  return "Noche";
}

function timeToMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}`
  );
}

text = text.replace(
  "function applyInventoryPatch(inventory, patch) {",
  "async function applyInventoryPatch(inventory, patch) {"
);

if (!text.includes("No se puede agregar item inexistente")) {
  text = text.replace(
`  if (!itemId) {
    throw validationError("inventoryPatch.itemId es obligatorio.");
  }`,
`  if (!itemId) {
    throw validationError("inventoryPatch.itemId es obligatorio.");
  }

  if (op === "add" || op === "set_quantity") {
    const itemExists = await Item.exists({ itemId });

    if (!itemExists) {
      throw validationError("No se puede agregar item inexistente al inventario.", {
        itemId,
      });
    }
  }`
  );
}

text = text.replace(
  "inventoryChanges.push(applyInventoryPatch(gameState.inventory, patch));",
  "inventoryChanges.push(await applyInventoryPatch(gameState.inventory, patch));"
);

if (!text.includes("timeAdvance.to no puede ser anterior")) {
  text = text.replace(
`      if (!isValidTime(to)) {
        return res.status(400).json({
          ok: false,
          error: "timeAdvance.to debe tener formato HH:MM exacto.",
        });
      }`,
`      if (!isValidTime(to)) {
        return res.status(400).json({
          ok: false,
          error: "timeAdvance.to debe tener formato HH:MM exacto.",
        });
      }

      if (from && timeToMinutes(to) < timeToMinutes(from)) {
        return res.status(400).json({
          ok: false,
          error: "timeAdvance.to no puede ser anterior a timeAdvance.from dentro del mismo dia.",
          details: {
            from,
            to,
          },
        });
      }`
  );
}

fs.writeFileSync(filePath, text, "utf8");

console.log("turnController.js endurecido con validacion de items y tiempo.");
