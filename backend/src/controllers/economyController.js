const { getShopStock, getItem, listShops, restockDaily } = require("../services/economyService");

async function getShopStockController(req, res) {
  try {
    const { shopId } = req.params;

    const result = await getShopStock(shopId);

    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function listShopsController(req, res) {
  try {
    const result = await listShops({
      locationId: String(req.query.locationId || ""),
      regionId: String(req.query.regionId || ""),
      status: String(req.query.status || ""),
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function getItemController(req, res) {
  try {
    const { itemId } = req.params;

    const result = await getItem(itemId);

    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function restockDailyController(req, res) {
  try {
    const body = req.body || {};

    const result = await restockDaily({
      gameId: body.gameId || "isekai_lucas_main",
      dryRun: body.dryRun !== false,
      force: Boolean(body.force),
    });

    return res.json({
      ok: true,
      message: result.dryRun
        ? "Vista previa de reposicion diaria calculada."
        : "Reposicion diaria aplicada.",
      result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

module.exports = {
  getShopStockController,
  listShopsController,
  getItemController,
  restockDailyController,
};
