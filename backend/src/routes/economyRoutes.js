const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const {
  getShopStockController,
  restockDailyController,
} = require("../controllers/economyController");

const router = express.Router();

router.get("/shops/:shopId/stock", requireApiKey, getShopStockController);
router.post("/restock-daily", requireApiKey, restockDailyController);

module.exports = router;
