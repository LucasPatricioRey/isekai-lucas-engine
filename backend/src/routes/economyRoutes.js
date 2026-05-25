const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const {
  getShopStockController,
  getItemController,
  listShopsController,
  restockDailyController,
} = require("../controllers/economyController");

const router = express.Router();

router.get("/shops", requireApiKey, listShopsController);
router.get("/shops/:shopId/stock", requireApiKey, getShopStockController);
router.get("/items/:itemId", requireApiKey, getItemController);
router.post("/restock-daily", requireApiKey, restockDailyController);

module.exports = router;
