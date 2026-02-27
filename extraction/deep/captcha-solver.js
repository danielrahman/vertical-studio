const { fetchJson, sleep } = require('./providers/provider-utils');

async function postJson(url, body, timeoutMs) {
  return fetchJson(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(body || {}),
    timeoutMs: timeoutMs || 20000
  });
}

function normalizeCaptchaType(value) {
  const type = String(value || 'recaptcha').toLowerCase();
  if (type === 'hcaptcha' || type === 'turnstile') {
    return type;
  }
  return 'recaptcha';
}

function firstString(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function asSolveResult(token, userAgent) {
  const normalizedToken = firstString([token]);
  if (!normalizedToken) {
    return null;
  }

  return {
    token: normalizedToken,
    userAgent: firstString([userAgent]) || null
  };
}

function parse2CaptchaReadyPayload(payload) {
  if (!payload || payload.status !== 1) {
    return null;
  }

  if (typeof payload.request === 'string') {
    return asSolveResult(payload.request, firstString([payload.useragent, payload.userAgent]));
  }

  if (payload.request && typeof payload.request === 'object') {
    return asSolveResult(
      firstString([payload.request.token, payload.request.request, payload.token]),
      firstString([payload.request.useragent, payload.request.userAgent, payload.useragent, payload.userAgent])
    );
  }

  return asSolveResult(payload.token, firstString([payload.useragent, payload.userAgent]));
}

function parseTaskSolutionPayload(payload) {
  if (!payload || payload.status !== 'ready' || !payload.solution) {
    return null;
  }

  return asSolveResult(
    firstString([payload.solution.gRecaptchaResponse, payload.solution.token, payload.solution.response]),
    firstString([payload.solution.userAgent, payload.solution.useragent, payload.userAgent, payload.useragent])
  );
}

async function solveWith2Captcha({
  apiKey,
  siteKey,
  pageUrl,
  captchaType = 'recaptcha',
  timeoutMs = 120000,
  pollIntervalMs = 4500,
  action,
  cData,
  chlPageData
}) {
  const normalizedType = normalizeCaptchaType(captchaType);
  const submitUrl = new URL('https://2captcha.com/in.php');
  submitUrl.searchParams.set('key', apiKey);
  submitUrl.searchParams.set(
    'method',
    normalizedType === 'hcaptcha' ? 'hcaptcha' : normalizedType === 'turnstile' ? 'turnstile' : 'userrecaptcha'
  );
  if (normalizedType === 'hcaptcha' || normalizedType === 'turnstile') {
    submitUrl.searchParams.set('sitekey', siteKey);
  } else {
    submitUrl.searchParams.set('googlekey', siteKey);
  }
  if (normalizedType === 'turnstile') {
    if (action) {
      submitUrl.searchParams.set('action', String(action));
    }
    if (cData) {
      submitUrl.searchParams.set('data', String(cData));
    }
    if (chlPageData) {
      submitUrl.searchParams.set('pagedata', String(chlPageData));
    }
  }
  submitUrl.searchParams.set('pageurl', pageUrl);
  submitUrl.searchParams.set('json', '1');

  const submit = await fetchJson(submitUrl.toString(), { timeoutMs: 20000 });
  if (!submit.ok || !submit.payload || submit.payload.status !== 1) {
    throw new Error('2captcha submit failed');
  }

  const requestId = submit.payload.request;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(Math.max(0, Number(pollIntervalMs || 0)));

    const pollUrl = new URL('https://2captcha.com/res.php');
    pollUrl.searchParams.set('key', apiKey);
    pollUrl.searchParams.set('action', 'get');
    pollUrl.searchParams.set('id', requestId);
    pollUrl.searchParams.set('json', '1');

    const poll = await fetchJson(pollUrl.toString(), { timeoutMs: 15000 });
    if (!poll.ok || !poll.payload) {
      continue;
    }

    const ready = parse2CaptchaReadyPayload(poll.payload);
    if (ready) {
      return ready;
    }

    if (poll.payload.request !== 'CAPCHA_NOT_READY') {
      throw new Error(`2captcha solve failed: ${poll.payload.request}`);
    }
  }

  throw new Error('2captcha solve timeout');
}

async function solveWithAntiCaptcha({
  apiKey,
  siteKey,
  pageUrl,
  captchaType = 'recaptcha',
  timeoutMs = 120000,
  pollIntervalMs = 3500,
  action,
  cData,
  chlPageData
}) {
  const normalizedType = normalizeCaptchaType(captchaType);
  const taskType =
    normalizedType === 'hcaptcha'
      ? 'HCaptchaTaskProxyless'
      : normalizedType === 'turnstile'
      ? 'TurnstileTaskProxyless'
      : 'RecaptchaV2TaskProxyless';

  const task = {
    type: taskType,
    websiteURL: pageUrl,
    websiteKey: siteKey
  };

  if (normalizedType === 'turnstile') {
    if (action) {
      task.action = String(action);
    }
    if (cData) {
      task.cData = String(cData);
    }
    if (chlPageData) {
      task.chlPageData = String(chlPageData);
    }
  }

  const create = await postJson(
    'https://api.anti-captcha.com/createTask',
    {
      clientKey: apiKey,
      task
    },
    20000
  );

  if (!create.ok || !create.payload || create.payload.errorId !== 0 || !create.payload.taskId) {
    const detail = create.payload && create.payload.errorDescription ? create.payload.errorDescription : 'unknown';
    throw new Error(`anticaptcha createTask failed: ${detail}`);
  }

  const taskId = create.payload.taskId;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(Math.max(0, Number(pollIntervalMs || 0)));

    const poll = await postJson(
      'https://api.anti-captcha.com/getTaskResult',
      {
        clientKey: apiKey,
        taskId
      },
      15000
    );

    if (!poll.ok || !poll.payload) {
      continue;
    }

    if (poll.payload.errorId && poll.payload.errorId !== 0) {
      throw new Error(`anticaptcha getTaskResult failed: ${poll.payload.errorDescription || 'unknown'}`);
    }

    const ready = parseTaskSolutionPayload(poll.payload);
    if (ready) {
      return ready;
    }
  }

  throw new Error('anticaptcha solve timeout');
}

async function solveWithCapsolver({
  apiKey,
  siteKey,
  pageUrl,
  captchaType = 'recaptcha',
  timeoutMs = 120000,
  pollIntervalMs = 3500,
  action,
  cData,
  chlPageData,
  warnings
}) {
  const normalizedType = normalizeCaptchaType(captchaType);
  const taskType =
    normalizedType === 'hcaptcha'
      ? 'HCaptchaTaskProxyLess'
      : normalizedType === 'turnstile'
      ? 'AntiTurnstileTaskProxyLess'
      : 'ReCaptchaV2TaskProxyLess';

  const task = {
    type: taskType,
    websiteURL: pageUrl,
    websiteKey: siteKey
  };

  if (normalizedType === 'turnstile') {
    const metadata = {};
    if (action) {
      metadata.action = String(action);
    }
    if (cData) {
      metadata.cdata = String(cData);
    }
    if (Object.keys(metadata).length > 0) {
      task.metadata = metadata;
    }
    if (chlPageData && Array.isArray(warnings)) {
      warnings.push('Capsolver turnstile solver does not accept chlPageData; value was ignored');
    }
  }

  const create = await postJson(
    'https://api.capsolver.com/createTask',
    {
      clientKey: apiKey,
      task
    },
    20000
  );

  if (!create.ok || !create.payload || create.payload.errorId !== 0 || !create.payload.taskId) {
    const detail = create.payload && create.payload.errorDescription ? create.payload.errorDescription : 'unknown';
    throw new Error(`capsolver createTask failed: ${detail}`);
  }

  const taskId = create.payload.taskId;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(Math.max(0, Number(pollIntervalMs || 0)));

    const poll = await postJson(
      'https://api.capsolver.com/getTaskResult',
      {
        clientKey: apiKey,
        taskId
      },
      15000
    );

    if (!poll.ok || !poll.payload) {
      continue;
    }

    if (poll.payload.errorId && poll.payload.errorId !== 0) {
      throw new Error(`capsolver getTaskResult failed: ${poll.payload.errorDescription || 'unknown'}`);
    }

    const ready = parseTaskSolutionPayload(poll.payload);
    if (ready) {
      return ready;
    }
  }

  throw new Error('capsolver solve timeout');
}

async function solveCaptcha({
  provider,
  apiKey,
  siteKey,
  pageUrl,
  captchaType,
  timeoutMs,
  pollIntervalMs,
  action,
  cData,
  chlPageData,
  warnings
}) {
  if (!provider || !apiKey || !siteKey || !pageUrl) {
    return null;
  }

  if (provider === '2captcha') {
    return solveWith2Captcha({
      apiKey,
      siteKey,
      pageUrl,
      captchaType,
      timeoutMs,
      pollIntervalMs,
      action,
      cData,
      chlPageData
    });
  }

  if (provider === 'anticaptcha') {
    return solveWithAntiCaptcha({
      apiKey,
      siteKey,
      pageUrl,
      captchaType,
      timeoutMs,
      pollIntervalMs,
      action,
      cData,
      chlPageData
    });
  }

  if (provider === 'capsolver') {
    return solveWithCapsolver({
      apiKey,
      siteKey,
      pageUrl,
      captchaType,
      timeoutMs,
      pollIntervalMs,
      action,
      cData,
      chlPageData,
      warnings
    });
  }

  if (provider === 'custom') {
    throw new Error('Custom captcha provider is not implemented');
  }

  throw new Error(`Unsupported captcha provider: ${provider}`);
}

module.exports = {
  solveCaptcha
};
