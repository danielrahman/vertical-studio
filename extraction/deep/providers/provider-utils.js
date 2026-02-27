function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, options = {}) {
  const timeoutMs = Number(options.timeoutMs || 10000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal
    });

    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    let payload = null;
    if (contentType.includes('application/json')) {
      payload = await res.json();
    } else {
      payload = await res.text();
    }

    return {
      ok: res.ok,
      status: res.status,
      payload
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      payload: null,
      error: error && error.name === 'AbortError' ? 'timeout' : String(error.message || error)
    };
  } finally {
    clearTimeout(timer);
  }
}

function registerEvidence(sources, source) {
  if (!source || !source.id) {
    return;
  }

  sources.push(source);
}

function appendFieldLink(fieldMap, field, sourceId) {
  if (!field || !sourceId) {
    return;
  }

  if (!fieldMap[field]) {
    fieldMap[field] = [];
  }

  if (!fieldMap[field].includes(sourceId)) {
    fieldMap[field].push(sourceId);
  }
}

module.exports = {
  sleep,
  fetchJson,
  registerEvidence,
  appendFieldLink
};
