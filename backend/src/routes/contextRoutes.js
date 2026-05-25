const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const { getFullContext } = require("../controllers/contextController");

const router = express.Router();

router.get("/full", requireApiKey, getFullContext);

module.exports = router;
