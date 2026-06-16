const { executeActionPlan } = require("../services/turnActionPlanService");

async function executeActionPlanController(req, res) {
  try {
    const result = await executeActionPlan(req.body || {});
    return res.json(result);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.statusCode === 500 ? "Error ejecutando action plan." : error.message,
      details: error.details || undefined,
    });
  }
}

module.exports = {
  executeActionPlanController,
};
