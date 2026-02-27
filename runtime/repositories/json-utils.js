function serializeJson(value) {
  if (value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return fallback;
  }
}

function isoNow() {
  return new Date().toISOString();
}

module.exports = {
  serializeJson,
  parseJson,
  isoNow
};
