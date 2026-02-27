function parseJsonSafe(value) {
  try {
    return JSON.parse(value);
  } catch (_error) {
    return null;
  }
}

async function convertViaMarkdownNew({
  url,
  method = 'auto',
  retainImages = false,
  timeoutMs = 15000,
  endpoint = 'https://markdown.new/'
}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        url,
        method,
        retain_images: Boolean(retainImages)
      })
    });

    const raw = await response.text();
    const payload = parseJsonSafe(raw);

    if (!response.ok || !payload) {
      return {
        ok: false,
        error: `markdown.new request failed (${response.status})`,
        durationMs: Date.now() - started
      };
    }

    if (payload.success !== true) {
      return {
        ok: false,
        error: payload.error || 'markdown.new conversion failed',
        durationMs: Date.now() - started
      };
    }

    return {
      ok: true,
      title: payload.title || null,
      content: String(payload.content || ''),
      method: payload.method || method,
      tokens: Number(payload.tokens || 0) || null,
      durationMs: Number(payload.duration_ms || Date.now() - started)
    };
  } catch (error) {
    const isTimeout = error && error.name === 'AbortError';
    return {
      ok: false,
      error: isTimeout ? 'markdown.new timeout' : String(error.message || error),
      durationMs: Date.now() - started
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  convertViaMarkdownNew
};
