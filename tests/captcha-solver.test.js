const test = require('node:test');
const assert = require('node:assert/strict');
const { solveCaptcha } = require('../extraction/deep/captcha-solver');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        if (String(name || '').toLowerCase() === 'content-type') {
          return 'application/json';
        }
        return null;
      }
    },
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

test('2captcha turnstile sends full challenge fields and returns token+userAgent', async () => {
  const originalFetch = global.fetch;
  const seenUrls = [];
  let pollCount = 0;

  global.fetch = async (url) => {
    const urlValue = String(url);
    seenUrls.push(urlValue);

    if (urlValue.includes('2captcha.com/in.php')) {
      return jsonResponse({ status: 1, request: 'req-123' });
    }

    if (urlValue.includes('2captcha.com/res.php')) {
      pollCount += 1;
      if (pollCount === 1) {
        return jsonResponse({ status: 0, request: 'CAPCHA_NOT_READY' });
      }
      return jsonResponse({ status: 1, request: 'token-turnstile', useragent: 'ua-turnstile' });
    }

    throw new Error(`Unexpected URL: ${urlValue}`);
  };

  try {
    const result = await solveCaptcha({
      provider: '2captcha',
      apiKey: 'api-key',
      siteKey: 'site-key',
      pageUrl: 'https://example.com',
      captchaType: 'turnstile',
      action: 'managed',
      cData: 'cdata-value',
      chlPageData: 'pagedata-value',
      timeoutMs: 5000,
      pollIntervalMs: 0
    });

    assert.deepEqual(result, {
      token: 'token-turnstile',
      userAgent: 'ua-turnstile'
    });

    const submitUrl = new URL(seenUrls.find((entry) => entry.includes('2captcha.com/in.php')));
    assert.equal(submitUrl.searchParams.get('method'), 'turnstile');
    assert.equal(submitUrl.searchParams.get('sitekey'), 'site-key');
    assert.equal(submitUrl.searchParams.get('action'), 'managed');
    assert.equal(submitUrl.searchParams.get('data'), 'cdata-value');
    assert.equal(submitUrl.searchParams.get('pagedata'), 'pagedata-value');
  } finally {
    global.fetch = originalFetch;
  }
});

test('anticaptcha turnstile maps optional challenge metadata', async () => {
  const originalFetch = global.fetch;
  const calls = [];

  global.fetch = async (url, options = {}) => {
    const urlValue = String(url);
    calls.push({ url: urlValue, body: options.body });

    if (urlValue.includes('createTask')) {
      return jsonResponse({ errorId: 0, taskId: 789 });
    }

    if (urlValue.includes('getTaskResult')) {
      return jsonResponse({
        errorId: 0,
        status: 'ready',
        solution: {
          token: 'anti-token',
          userAgent: 'anti-ua'
        }
      });
    }

    throw new Error(`Unexpected URL: ${urlValue}`);
  };

  try {
    const result = await solveCaptcha({
      provider: 'anticaptcha',
      apiKey: 'api-key',
      siteKey: 'site-key',
      pageUrl: 'https://example.com',
      captchaType: 'turnstile',
      action: 'managed',
      cData: 'cdata-value',
      chlPageData: 'pagedata-value',
      timeoutMs: 5000,
      pollIntervalMs: 0
    });

    assert.deepEqual(result, {
      token: 'anti-token',
      userAgent: 'anti-ua'
    });

    const createTaskCall = calls.find((call) => call.url.includes('createTask'));
    const createPayload = JSON.parse(createTaskCall.body);
    assert.equal(createPayload.task.type, 'TurnstileTaskProxyless');
    assert.equal(createPayload.task.action, 'managed');
    assert.equal(createPayload.task.cData, 'cdata-value');
    assert.equal(createPayload.task.chlPageData, 'pagedata-value');
  } finally {
    global.fetch = originalFetch;
  }
});

test('capsolver turnstile uses metadata and warns when chlPageData is ignored', async () => {
  const originalFetch = global.fetch;
  const calls = [];
  const warnings = [];

  global.fetch = async (url, options = {}) => {
    const urlValue = String(url);
    calls.push({ url: urlValue, body: options.body });

    if (urlValue.includes('createTask')) {
      return jsonResponse({ errorId: 0, taskId: 456 });
    }

    if (urlValue.includes('getTaskResult')) {
      return jsonResponse({
        errorId: 0,
        status: 'ready',
        solution: {
          token: 'cap-token'
        }
      });
    }

    throw new Error(`Unexpected URL: ${urlValue}`);
  };

  try {
    const result = await solveCaptcha({
      provider: 'capsolver',
      apiKey: 'api-key',
      siteKey: 'site-key',
      pageUrl: 'https://example.com',
      captchaType: 'turnstile',
      action: 'managed',
      cData: 'cdata-value',
      chlPageData: 'pagedata-value',
      timeoutMs: 5000,
      pollIntervalMs: 0,
      warnings
    });

    assert.deepEqual(result, {
      token: 'cap-token',
      userAgent: null
    });

    const createTaskCall = calls.find((call) => call.url.includes('createTask'));
    const createPayload = JSON.parse(createTaskCall.body);
    assert.equal(createPayload.task.type, 'AntiTurnstileTaskProxyLess');
    assert.equal(createPayload.task.metadata.action, 'managed');
    assert.equal(createPayload.task.metadata.cdata, 'cdata-value');
    assert.equal(createPayload.task.chlPageData, undefined);
    assert.equal(
      warnings.includes('Capsolver turnstile solver does not accept chlPageData; value was ignored'),
      true
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test('recaptcha flow remains compatible with string token results', async () => {
  const originalFetch = global.fetch;
  let submitUrl = null;

  global.fetch = async (url) => {
    const urlValue = String(url);
    if (urlValue.includes('2captcha.com/in.php')) {
      submitUrl = new URL(urlValue);
      return jsonResponse({ status: 1, request: 'req-001' });
    }

    if (urlValue.includes('2captcha.com/res.php')) {
      return jsonResponse({ status: 1, request: 'recaptcha-token' });
    }

    throw new Error(`Unexpected URL: ${urlValue}`);
  };

  try {
    const result = await solveCaptcha({
      provider: '2captcha',
      apiKey: 'api-key',
      siteKey: 'recaptcha-site-key',
      pageUrl: 'https://example.com',
      captchaType: 'recaptcha',
      timeoutMs: 5000,
      pollIntervalMs: 0
    });

    assert.deepEqual(result, {
      token: 'recaptcha-token',
      userAgent: null
    });
    assert.equal(submitUrl.searchParams.get('method'), 'userrecaptcha');
    assert.equal(submitUrl.searchParams.get('googlekey'), 'recaptcha-site-key');
  } finally {
    global.fetch = originalFetch;
  }
});
