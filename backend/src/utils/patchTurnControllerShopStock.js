const fs = require("fs");

const filePath = "src/controllers/turnController.js";
let text = fs.readFileSync(filePath, "utf8");

if (!text.includes('const ShopStock = require("../models/ShopStock");')) {
  text = text.replace(
    'const Location = require("../models/Location");',
    'const Location = require("../models/Location");\nconst ShopStock = require("../models/ShopStock");'
  );
}

const helper = `
async function applyShopStockPatches(patches) {
  const results = [];

  for (const patch of patches) {
    if (!patch.shopId) {
      throw validationError("shopStockPatch.shopId es obligatorio.");
    }

    if (!patch.itemId) {
      throw validationError("shopStockPatch.itemId es obligatorio.");
    }

    if (!Number.isInteger(patch.deltaQuantity) || patch.deltaQuantity === 0) {
      throw validationError("shopStockPatch.deltaQuantity debe ser un entero distinto de cero.");
    }

    const stock = await ShopStock.findOne({
      shopId: patch.shopId,
      itemId: patch.itemId,
    });

    if (!stock) {
      throw validationError("No existe stock para ese shopId/itemId.", {
        shopId: patch.shopId,
        itemId: patch.itemId,
      });
    }

    const before = toPlain(stock);
    const afterQuantity = stock.quantity + patch.deltaQuantity;

    if (afterQuantity < 0) {
      throw validationError("Stock insuficiente.", {
        shopId: patch.shopId,
        itemId: patch.itemId,
        currentQuantity: stock.quantity,
        attemptedDelta: patch.deltaQuantity,
      });
    }

    stock.quantity = afterQuantity;

    if (patch.currentPriceCopper !== undefined) {
      if (!Number.isInteger(patch.currentPriceCopper) || patch.currentPriceCopper < 0) {
        throw validationError("shopStockPatch.currentPriceCopper debe ser entero >= 0.");
      }

      stock.currentPriceCopper = patch.currentPriceCopper;
    }

    if (Array.isArray(patch.addScarcityFlags)) {
      stock.scarcityFlags = Array.from(
        new Set([...(stock.scarcityFlags || []), ...patch.addScarcityFlags])
      );
    }

    if (Array.isArray(patch.removeScarcityFlags)) {
      stock.scarcityFlags = (stock.scarcityFlags || []).filter(
        (flag) => !patch.removeScarcityFlags.includes(flag)
      );
    }

    await stock.save();

    results.push({
      shopId: stock.shopId,
      itemId: stock.itemId,
      before: {
        quantity: before.quantity,
        currentPriceCopper: before.currentPriceCopper,
        scarcityFlags: before.scarcityFlags,
      },
      deltaQuantity: patch.deltaQuantity,
      after: {
        quantity: stock.quantity,
        currentPriceCopper: stock.currentPriceCopper,
        scarcityFlags: stock.scarcityFlags,
      },
      reason: patch.reason || "",
    });
  }

  return results;
}
`;

if (!text.includes("async function applyShopStockPatches")) {
  text = text.replace(
    "\nasync function applyTurn(req, res) {",
    helper + "\nasync function applyTurn(req, res) {"
  );
}

const oldBlock = `    if (Array.isArray(req.body.locationPatches)) {
      const locationChanges = await applyLocationPatches(req.body.locationPatches);
      if (locationChanges.length > 0) changes.locations = locationChanges;
    }

    const logsToCreate = [];`;

const newBlock = `    if (Array.isArray(req.body.locationPatches)) {
      const locationChanges = await applyLocationPatches(req.body.locationPatches);
      if (locationChanges.length > 0) changes.locations = locationChanges;
    }

    if (Array.isArray(req.body.shopStockPatches)) {
      const shopStockChanges = await applyShopStockPatches(req.body.shopStockPatches);
      if (shopStockChanges.length > 0) changes.shopStocks = shopStockChanges;
    }

    const logsToCreate = [];`;

if (!text.includes("changes.shopStocks")) {
  if (!text.includes(oldBlock)) {
    throw new Error("No se encontro el bloque exacto para insertar shopStockPatches.");
  }

  text = text.replace(oldBlock, newBlock);
}

fs.writeFileSync(filePath, text, "utf8");

console.log("turnController.js actualizado con shopStockPatches.");
