const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const { getFullContext, getCompactContext } = require("../controllers/contextController");

const router = express.Router();

router.get("/compact", requireApiKey, getCompactContext);
router.get("/full", requireApiKey, getFullContext);

module.exports = router;
