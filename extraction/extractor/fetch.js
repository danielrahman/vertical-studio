const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_CSS_BYTES = 512 * 1024;
const MAX_OTHER_TEXT_BYTES = 512 * 1024;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(max) {
  if (!max || max <= 0) {
    return 0;
  }
  return Math.floor(Math.random() * (max + 1));
}

function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

function getContentLimitBytes(contentType) {
  const lower = String(contentType || '').toLowerCase();
  if (lower.includes('text/html')) {
    return MAX_HTML_BYTES;
  }
  if (lower.includes('text/css')) {
    return MAX_CSS_BYTES;
  }
  return MAX_OTHER_TEXT_BYTES;
}

async function readBodyWithLimit(response, limitBytes) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    const bytes = Buffer.byteLength(text || '', 'utf8');
    if (bytes <= limitBytes) {
      return { text, bytes, truncated: false };
    }
    const truncated = Buffer.from(text, 'utf8').subarray(0, limitBytes).toString('utf8');
    return { text: truncated, bytes: limitBytes, truncated: true };
  }

  const reader = response.body.getReader();
  const chunks = [];
  let bytesRead = 0;
  let truncated = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    if (bytesRead + value.byteLength <= limitBytes) {
      chunks.push(Buffer.from(value));
      bytesRead += value.byteLength;
      continue;
    }

    const remaining = Math.max(0, limitBytes - bytesRead);
    if (remaining > 0) {
      chunks.push(Buffer.from(value.subarray(0, remaining)));
      bytesRead += remaining;
    }

    truncated = true;
    break;
  }

  if (truncated) {
    try {
      await reader.cancel();
    } catch (_error) {
      // Ignore stream cancellation errors.
    }
  }

  const buffer = chunks.length ? Buffer.concat(chunks, bytesRead) : Buffer.alloc(0);
  return {
    text: buffer.toString('utf8'),
    bytes: bytesRead,
    truncated
  };
}

class FetchClient {
  constructor(options = {}) {
    this.timeoutMs = Number(options.timeoutMs || process.env.VERTICAL_SCRAPER_TIMEOUT_MS || 8000);
    this.maxRetries = Number(options.maxRetries || 3);
    this.userAgent = options.userAgent || 'VerticalStudioBot/3.0 (+https://verticalstudio.local)';
  }

  async fetchUrl(url, options = {}) {
    const timeoutMs = Number(options.timeoutMs || this.timeoutMs);
    const acceptHtmlOnly = options.acceptHtmlOnly !== false;
    const maxRetries = Number(options.maxRetries || this.maxRetries);

    let attempts = 0;
    let lastError = null;
    const attemptWarnings = [];

    while (attempts < maxRetries) {
      attempts += 1;

      const controller = new AbortController();
      const started = Date.now();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'user-agent': this.userAgent,
            accept: acceptHtmlOnly ? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' : '*/*'
          }
        });

        clearTimeout(timer);

        const contentType = String(response.headers.get('content-type') || '').toLowerCase() || null;
        if (acceptHtmlOnly && contentType && !contentType.includes('text/html')) {
          return {
            ok: false,
            status: response.status,
            url,
            finalUrl: response.url || url,
            redirected: Boolean(response.redirected),
            contentType,
            bytes: 0,
            durationMs: Date.now() - started,
            retries: attempts - 1,
            text: '',
            errorCode: 'non_html',
            errorMessage: 'Response is not HTML',
            warnings: attemptWarnings
          };
        }

        if (isRetryableStatus(response.status)) {
          const statusWarning = {
            code: 'retryable_status',
            message: `Retrying after HTTP ${response.status}`
          };
          attemptWarnings.push(statusWarning);

          if (attempts < maxRetries) {
            try {
              if (response.body) {
                await response.body.cancel();
              }
            } catch (_error) {
              // Ignore response cancellation errors.
            }

            const backoffMs = 250 * 2 ** (attempts - 1) + jitter(120);
            await sleep(backoffMs);
            continue;
          }
        }

        const limitBytes = getContentLimitBytes(contentType);
        const contentLength = Number.parseInt(response.headers.get('content-length') || '', 10);
        if (Number.isFinite(contentLength) && contentLength > limitBytes) {
          const message = `Body too large by content-length (${contentLength} bytes)`;
          return {
            ok: false,
            status: response.status,
            url,
            finalUrl: response.url || url,
            redirected: Boolean(response.redirected),
            contentType,
            bytes: 0,
            durationMs: Date.now() - started,
            retries: attempts - 1,
            text: '',
            errorCode: 'body_too_large_header',
            errorMessage: message,
            warnings: [...attemptWarnings, { code: 'body_too_large_header', message }]
          };
        }

        const body = await readBodyWithLimit(response, limitBytes);
        const warnings = [...attemptWarnings];
        if (body.truncated) {
          warnings.push({
            code: 'body_truncated',
            message: `Body exceeded ${limitBytes} bytes and was truncated`
          });
        }

        return {
          ok: response.ok,
          status: response.status,
          url,
          finalUrl: response.url || url,
          redirected: Boolean(response.redirected),
          contentType,
          bytes: body.bytes,
          durationMs: Date.now() - started,
          retries: attempts - 1,
          text: body.text,
          errorCode: response.ok ? undefined : 'fetch_error',
          errorMessage: response.ok ? undefined : `HTTP ${response.status}`,
          warnings
        };
      } catch (error) {
        clearTimeout(timer);

        const isTimeout = error && error.name === 'AbortError';
        const rawMessage = String((error && error.message) || 'Fetch failed');
        const isRedirectLimit = /redirect/i.test(rawMessage) && /exceed|limit|max/i.test(rawMessage);
        const code = isTimeout ? 'timeout' : isRedirectLimit ? 'redirect_limit' : 'fetch_error';
        const message = isTimeout ? 'Request timed out' : rawMessage;

        lastError = {
          ok: false,
          status: 0,
          url,
          finalUrl: url,
          redirected: false,
          contentType: null,
          bytes: 0,
          durationMs: Date.now() - started,
          retries: attempts - 1,
          text: '',
          errorCode: code,
          errorMessage: message,
          warnings: attemptWarnings
        };

        if (attempts >= maxRetries) {
          return lastError;
        }

        const backoffMs = 250 * 2 ** (attempts - 1) + jitter(120);
        await sleep(backoffMs);
      }
    }

    return (
      lastError || {
        ok: false,
        status: 0,
        url,
        finalUrl: url,
        redirected: false,
        contentType: null,
        bytes: 0,
        durationMs: timeoutMs,
        retries: maxRetries - 1,
        text: '',
        errorCode: 'fetch_error',
        errorMessage: 'Request failed',
        warnings: []
      }
    );
  }
}

module.exports = {
  FetchClient,
  MAX_HTML_BYTES,
  MAX_CSS_BYTES
};
