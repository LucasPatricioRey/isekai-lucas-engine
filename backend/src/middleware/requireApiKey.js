const SCOPE_KEYS = {
  read: ["API_KEY", "GAMEPLAY_API_KEY", "ADMIN_READONLY_API_KEY", "ADMIN_WRITE_API_KEY"],
  gameplay: ["API_KEY", "GAMEPLAY_API_KEY", "ADMIN_WRITE_API_KEY"],
  "admin-readonly": ["API_KEY", "ADMIN_READONLY_API_KEY", "ADMIN_WRITE_API_KEY"],
  "admin-write": ["API_KEY", "ADMIN_WRITE_API_KEY"],
};

function getExpectedKeys(scope) {
  const envKeys = SCOPE_KEYS[scope] || SCOPE_KEYS.read;
  return envKeys.map((name) => process.env[name]).filter(Boolean);
}

function buildMiddleware(scope = "read") {
  return function requireApiKeyMiddleware(req, res, next) {
    const expectedApiKeys = getExpectedKeys(scope);

    if (expectedApiKeys.length === 0) {
      return res.status(500).json({
        ok: false,
        error: "API key no configurada en el servidor",
      });
    }

    const providedApiKey = req.header("x-api-key");

    if (!expectedApiKeys.includes(providedApiKey)) {
      return res.status(401).json({
        ok: false,
        error: "API key invalida para este scope",
        scope,
      });
    }

    req.apiKeyScope = scope;
    return next();
  };
}

function requireApiKey(scopeOrReq, res, next) {
  if (typeof scopeOrReq === "string") {
    return buildMiddleware(scopeOrReq);
  }

  if (scopeOrReq && typeof scopeOrReq === "object") {
    return buildMiddleware("read")(scopeOrReq, res, next);
  }

  return buildMiddleware("read");
}

requireApiKey.getExpectedKeys = getExpectedKeys;

module.exports = requireApiKey;
