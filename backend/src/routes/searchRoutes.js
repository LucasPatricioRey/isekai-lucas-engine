const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const { searchDb, searchDocs } = require("../controllers/searchController");

const router = express.Router();

router.get("/db", requireApiKey, searchDb);
router.get("/docs", requireApiKey, searchDocs);

module.exports = router;
