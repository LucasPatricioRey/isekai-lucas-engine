const { getShopStock, restockDaily } = require("../services/economyService");

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
  restockDailyController,
};
