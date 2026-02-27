const crypto = require('crypto');

function parseBoolean(value) {
  if (typeof value === 'undefined' || value === null) {
    return null;
  }

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return null;
}

function readApiKeysFromEnv() {
  const raw = process.env.VERTICAL_API_KEYS || process.env.VERTICAL_API_KEY || '';

  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isAuthRequiredByDefault() {
  const explicit = parseBoolean(process.env.VERTICAL_REQUIRE_AUTH);
  if (explicit !== null) {
    return explicit;
  }

  return process.env.NODE_ENV === 'production';
}

function constantTimeEqual(a, b) {
  const aBuf = Buffer.from(String(a || ''), 'utf8');
  const bBuf = Buffer.from(String(b || ''), 'utf8');

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuf, bBuf);
}

function extractApiKey(req) {
  const direct = req.headers['x-api-key'];
  if (typeof direct === 'string' && direct.trim()) {
    return direct.trim();
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1] && match[1].trim()) {
      return match[1].trim();
    }
  }

  return null;
}

function apiKeyAuthMiddleware(options = {}) {
  const configuredKeys = Array.isArray(options.apiKeys) ? options.apiKeys.filter(Boolean) : readApiKeysFromEnv();
  const required = typeof options.required === 'boolean' ? options.required : isAuthRequiredByDefault();
  const enforce = required || configuredKeys.length > 0;

  return (req, _res, next) => {
    if (!enforce) {
      next();
      return;
    }

    if (!configuredKeys.length) {
      const error = new Error('API authentication is required but no API keys are configured');
      error.statusCode = 503;
      error.code = 'auth_not_configured';
      next(error);
      return;
    }

    const providedKey = extractApiKey(req);
    if (!providedKey) {
      const error = new Error('Authentication required');
      error.statusCode = 401;
      error.code = 'unauthorized';
      next(error);
      return;
    }

    const authorized = configuredKeys.some((key) => constantTimeEqual(providedKey, key));
    if (!authorized) {
      const error = new Error('Authentication required');
      error.statusCode = 401;
      error.code = 'unauthorized';
      next(error);
      return;
    }

    next();
  };
}

module.exports = {
  apiKeyAuthMiddleware,
  extractApiKey,
  parseBoolean,
  readApiKeysFromEnv,
  isAuthRequiredByDefault
};
