const {
  getMagicTechnique,
  listMagicDisciplines,
  listMagicTechniques,
  previewMagicPractice,
} = require("../services/magicService");

async function listMagicDisciplinesController(req, res) {
  try {
    const disciplines = await listMagicDisciplines({
      type: req.query.type || "",
      parentDisciplineId: req.query.parentDisciplineId || "",
    });

    return res.json({
      ok: true,
      disciplines,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function listMagicTechniquesController(req, res) {
  try {
    const techniques = await listMagicTechniques({
      disciplineId: req.query.disciplineId || "",
      kind: req.query.kind || "",
      status: req.query.status || "",
    });

    return res.json({
      ok: true,
      techniques,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function getMagicTechniqueController(req, res) {
  try {
    const technique = await getMagicTechnique(req.params.techniqueId);

    return res.json({
      ok: true,
      technique,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function previewMagicPracticeController(req, res) {
  try {
    const body = req.body || {};
    const preview = await previewMagicPractice({
      gameId: body.gameId || "isekai_lucas_main",
      characterId: body.characterId || "char_lucas",
      techniqueId: body.techniqueId,
      minutes: body.minutes,
      guidedByNpcId: body.guidedByNpcId || "",
      modifiers: body.modifiers || {},
    });

    return res.json({
      ok: true,
      preview,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
      details: error.details || undefined,
    });
  }
}

module.exports = {
  getMagicTechniqueController,
  listMagicDisciplinesController,
  listMagicTechniquesController,
  previewMagicPracticeController,
};
