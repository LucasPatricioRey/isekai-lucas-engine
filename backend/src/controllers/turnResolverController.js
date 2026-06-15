const { applyTurn } = require("./turnController");
const { buildResolveTurnPayload } = require("../services/turnResolverService");

function mergeResolverPlanIntoResponse(res, resolverPlan, includeResolvedPayload, applyTurnPayload) {
  let statusCode = 200;

  return {
    status(code) {
      statusCode = code;
      return this;
    },

    json(payload) {
      const response = payload && typeof payload === "object"
        ? {
            ...payload,
            resolverPlan,
          }
        : payload;

      if (response && typeof response === "object" && includeResolvedPayload) {
        response.resolvedApplyTurnPayload = applyTurnPayload;
      }

      return res.status(statusCode).json(response);
    },
  };
}

async function resolveTurnWithMode(req, res, { dryRun }) {
  try {
    const { applyTurnPayload, resolverPlan } = await buildResolveTurnPayload(req.body || {}, {
      forceDryRun: dryRun,
    });
    const originalBody = req.body;
    req.body = applyTurnPayload;
    const includeResolvedPayload = Boolean(originalBody?.includeResolvedPayload);
    const wrappedRes = mergeResolverPlanIntoResponse(
      res,
      resolverPlan,
      includeResolvedPayload,
      applyTurnPayload
    );

    return await applyTurn(req, wrappedRes);
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
      details: error.details || undefined,
    });
  }
}

async function previewResolvedTurn(req, res) {
  return resolveTurnWithMode(req, res, { dryRun: true });
}

async function applyResolvedTurn(req, res) {
  return resolveTurnWithMode(req, res, { dryRun: false });
}

module.exports = {
  applyResolvedTurn,
  previewResolvedTurn,
};
