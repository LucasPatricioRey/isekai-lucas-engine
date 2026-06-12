const { getRoute, listRoutes, previewTravel } = require("../services/travelService");

async function listRoutesController(req, res) {
  try {
    const result = await listRoutes({
      fromLocationId: String(req.query.fromLocationId || ""),
      toLocationId: String(req.query.toLocationId || ""),
      routeType: String(req.query.routeType || ""),
      dangerLevel: String(req.query.dangerLevel || ""),
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function getRouteController(req, res) {
  try {
    const result = await getRoute(req.params.routeId);

    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

async function previewTravelController(req, res) {
  try {
    const body = req.body || {};
    const conditions = {
      ...(body.conditions || {}),
    };
    if (body.allowMultiSegment !== undefined) conditions.allowMultiSegment = Boolean(body.allowMultiSegment);
    if (body.maxSegments !== undefined) conditions.maxSegments = Number(body.maxSegments);

    const preview = await previewTravel({
      gameId: body.gameId || "isekai_lucas_main",
      routeId: body.routeId || "",
      fromLocationId: body.fromLocationId || "",
      toLocationId: body.toLocationId || "",
      conditions,
    });

    return res.json({
      ok: true,
      preview,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      ok: false,
      error: error.message,
    });
  }
}

module.exports = {
  listRoutesController,
  getRouteController,
  previewTravelController,
};
