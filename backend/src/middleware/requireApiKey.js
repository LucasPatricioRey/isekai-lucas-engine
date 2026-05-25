function requireApiKey(req, res, next) {
  const expectedApiKey = process.env.API_KEY;

  if (!expectedApiKey) {
    return res.status(500).json({
      ok: false,
      error: "API_KEY no configurada en el servidor",
    });
  }

  const providedApiKey = req.header("x-api-key");

  if (providedApiKey !== expectedApiKey) {
    return res.status(401).json({
      ok: false,
      error: "API key inválida",
    });
  }

  next();
}

module.exports = requireApiKey;
