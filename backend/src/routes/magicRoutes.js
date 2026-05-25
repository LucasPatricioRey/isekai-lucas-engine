const express = require("express");

const requireApiKey = require("../middleware/requireApiKey");
const {
  getMagicTechniqueController,
  listMagicDisciplinesController,
  listMagicTechniquesController,
  previewMagicPracticeController,
} = require("../controllers/magicController");

const router = express.Router();

router.get("/disciplines", requireApiKey, listMagicDisciplinesController);
router.get("/techniques", requireApiKey, listMagicTechniquesController);
router.get("/techniques/:techniqueId", requireApiKey, getMagicTechniqueController);
router.post("/practice/preview", requireApiKey, previewMagicPracticeController);

module.exports = router;
