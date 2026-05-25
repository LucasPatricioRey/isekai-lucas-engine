const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const { getLocationFull } = require("../controllers/locationController");

const router = express.Router();

router.get("/:locationId/full", requireApiKey, getLocationFull);

module.exports = router;
