const path = require('path');
const { solveCaptcha } = require('./captcha-solver');

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractDataAttr(html, attrName) {
  const pattern = new RegExp(`${escapeRegExp(attrName)}=["']([^"']+)["']`, 'i');
  const match = String(html || '').match(pattern);
  return match ? match[1] : null;
}

function firstString(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function detectCaptcha(html) {
  const low = String(html || '').toLowerCase();
  const hasCaptcha =
    low.includes('g-recaptcha') ||
    low.includes('hcaptcha') ||
    low.includes('recaptcha') ||
    low.includes('cf-turnstile') ||
    low.includes('turnstile') ||
    low.includes('cf-challenge') ||
    low.includes('captcha');

  const siteKey = extractDataAttr(html, 'data-sitekey');
  const action = extractDataAttr(html, 'data-action');
  const cData = firstString([extractDataAttr(html, 'data-cdata'), extractDataAttr(html, 'data-cData')]);
  const chlPageData = firstString([
    extractDataAttr(html, 'data-pagedata'),
    extractDataAttr(html, 'data-page-data'),
    extractDataAttr(html, 'data-chl-pagedata'),
    extractDataAttr(html, 'data-chl-page-data')
  ]);

  const type = low.includes('hcaptcha')
    ? 'hcaptcha'
    : low.includes('g-recaptcha') || low.includes('recaptcha')
    ? 'recaptcha'
    : low.includes('cf-turnstile') || low.includes('turnstile')
    ? 'turnstile'
    : 'unknown';

  return {
    detected: Boolean(hasCaptcha),
    siteKey,
    action,
    cData,
    chlPageData,
    callbackIndex: null,
    type
  };
}

function getSecretValue(secretStore, ref) {
  if (!secretStore || !ref) {
    return null;
  }

  return secretStore.get(ref);
}

function toApiKey(secretValue) {
  if (!secretValue) {
    return null;
  }

  if (typeof secretValue === 'string') {
    return secretValue;
  }

  if (typeof secretValue === 'object') {
    if (typeof secretValue.apiKey === 'string') {
      return secretValue.apiKey;
    }

    if (typeof secretValue.key === 'string') {
      return secretValue.key;
    }
  }

  return null;
}

function mergeCaptchaSignals(captchaState, runtimeState) {
  const merged = {
    ...captchaState,
    callbackIndex: null
  };

  if (!runtimeState || typeof runtimeState !== 'object') {
    return merged;
  }

  merged.siteKey = firstString([runtimeState.siteKey, merged.siteKey]);
  merged.action = firstString([runtimeState.action, merged.action]);
  merged.cData = firstString([runtimeState.cData, merged.cData]);
  merged.chlPageData = firstString([runtimeState.chlPageData, merged.chlPageData]);

  if (Number.isInteger(runtimeState.callbackIndex)) {
    merged.callbackIndex = runtimeState.callbackIndex;
  }

  return merged;
}

function applyCaptchaTokenToDom({ doc, token, callbackIndex, turnstileState }) {
  if (!doc || !token) {
    return {
      applied: false,
      callbackInvoked: false
    };
  }

  const selectors = [
    'textarea[name="g-recaptcha-response"]',
    'textarea[name="h-captcha-response"]',
    'input[name="g-recaptcha-response"]',
    'input[name="h-captcha-response"]',
    'textarea[name="cf-turnstile-response"]',
    'input[name="cf-turnstile-response"]'
  ];

  const createEvent = (type) => {
    if (typeof Event === 'function') {
      try {
        return new Event(type, { bubbles: true });
      } catch (_error) {
        return { type, bubbles: true };
      }
    }
    return { type, bubbles: true };
  };

  const seen = new Set();
  let applied = false;
  let hasTurnstileField = false;

  for (const selector of selectors) {
    let matches = [];
    if (typeof doc.querySelectorAll === 'function') {
      const list = doc.querySelectorAll(selector);
      if (list && typeof list[Symbol.iterator] === 'function') {
        matches = Array.from(list);
      }
    } else if (typeof doc.querySelector === 'function') {
      const one = doc.querySelector(selector);
      if (one) {
        matches = [one];
      }
    }

    if (selector.includes('cf-turnstile-response') && matches.length) {
      hasTurnstileField = true;
    }

    for (const node of matches) {
      if (!node || typeof node !== 'object' || seen.has(node)) {
        continue;
      }

      seen.add(node);
      node.value = token;
      if (typeof node.setAttribute === 'function') {
        node.setAttribute('value', token);
      }

      if (typeof node.dispatchEvent === 'function') {
        node.dispatchEvent(createEvent('input'));
        node.dispatchEvent(createEvent('change'));
      }

      applied = true;
    }
  }

  if (!hasTurnstileField && typeof doc.createElement === 'function' && doc.body && typeof doc.body.appendChild === 'function') {
    const hidden = doc.createElement('input');
    if (hidden && typeof hidden === 'object') {
      hidden.type = 'hidden';
      hidden.name = 'cf-turnstile-response';
      hidden.value = token;
      if (typeof hidden.setAttribute === 'function') {
        hidden.setAttribute('type', 'hidden');
        hidden.setAttribute('name', 'cf-turnstile-response');
        hidden.setAttribute('value', token);
      }
      doc.body.appendChild(hidden);
      applied = true;
    }
  }

  let callbackInvoked = false;
  if (
    Number.isInteger(callbackIndex) &&
    turnstileState &&
    Array.isArray(turnstileState.callbacks) &&
    typeof turnstileState.callbacks[callbackIndex] === 'function'
  ) {
    try {
      turnstileState.callbacks[callbackIndex](token);
      callbackInvoked = true;
    } catch (_error) {
      callbackInvoked = false;
    }
  }

  return {
    applied,
    callbackInvoked
  };
}

async function applyCaptchaTokenOnPage(page, token, callbackIndex) {
  return page.evaluate(
    ({ captchaToken, callbackRef }) => {
      const selectors = [
        'textarea[name="g-recaptcha-response"]',
        'textarea[name="h-captcha-response"]',
        'input[name="g-recaptcha-response"]',
        'input[name="h-captcha-response"]',
        'textarea[name="cf-turnstile-response"]',
        'input[name="cf-turnstile-response"]'
      ];

      const createEvent = (type) => {
        try {
          return new Event(type, { bubbles: true });
        } catch (_error) {
          return { type, bubbles: true };
        }
      };

      const seen = new Set();
      let applied = false;
      let hasTurnstileField = false;

      for (const selector of selectors) {
        const list = document.querySelectorAll(selector);
        const matches = list && typeof list[Symbol.iterator] === 'function' ? Array.from(list) : [];

        if (selector.includes('cf-turnstile-response') && matches.length) {
          hasTurnstileField = true;
        }

        for (const node of matches) {
          if (!node || typeof node !== 'object' || seen.has(node)) {
            continue;
          }

          seen.add(node);
          node.value = captchaToken;
          node.setAttribute('value', captchaToken);
          node.dispatchEvent(createEvent('input'));
          node.dispatchEvent(createEvent('change'));
          applied = true;
        }
      }

      if (!hasTurnstileField && document.body && typeof document.body.appendChild === 'function') {
        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.name = 'cf-turnstile-response';
        hidden.value = captchaToken;
        hidden.setAttribute('type', 'hidden');
        hidden.setAttribute('name', 'cf-turnstile-response');
        hidden.setAttribute('value', captchaToken);
        document.body.appendChild(hidden);
        applied = true;
      }

      const turnstileState = window.__verticalTurnstileState || null;
      let callbackInvoked = false;
      if (
        Number.isInteger(callbackRef) &&
        turnstileState &&
        Array.isArray(turnstileState.callbacks) &&
        typeof turnstileState.callbacks[callbackRef] === 'function'
      ) {
        try {
          turnstileState.callbacks[callbackRef](captchaToken);
          callbackInvoked = true;
        } catch (_error) {
          callbackInvoked = false;
        }
      }

      return {
        applied,
        callbackInvoked
      };
    },
    {
      captchaToken: token,
      callbackRef: Number.isInteger(callbackIndex) ? callbackIndex : null
    }
  );
}

async function installTurnstileHook(page, warnings) {
  try {
    await page.addInitScript(() => {
      const stateKey = '__verticalTurnstileState';
      const instanceKey = '__verticalTurnstileInstance';
      const installedKey = '__verticalTurnstileSetterInstalled';

      const ensureState = () => {
        if (!window[stateKey] || typeof window[stateKey] !== 'object') {
          window[stateKey] = {
            callbacks: [],
            captures: [],
            latest: null
          };
        }

        if (!Array.isArray(window[stateKey].callbacks)) {
          window[stateKey].callbacks = [];
        }

        if (!Array.isArray(window[stateKey].captures)) {
          window[stateKey].captures = [];
        }

        return window[stateKey];
      };

      const captureRenderParams = (params) => {
        const state = ensureState();
        const payload = params && typeof params === 'object' ? params : {};

        const entry = {
          siteKey: typeof payload.sitekey === 'string' ? payload.sitekey : null,
          action: typeof payload.action === 'string' ? payload.action : null,
          cData: typeof payload.cData === 'string' ? payload.cData : typeof payload.cdata === 'string' ? payload.cdata : null,
          chlPageData:
            typeof payload.chlPageData === 'string'
              ? payload.chlPageData
              : typeof payload.pagedata === 'string'
              ? payload.pagedata
              : null,
          callbackIndex: null,
          capturedAt: Date.now()
        };

        if (typeof payload.callback === 'function') {
          entry.callbackIndex = state.callbacks.push(payload.callback) - 1;
        }

        state.latest = entry;
        state.captures.push(entry);
      };

      const patchTurnstileInstance = (value) => {
        if (!value || typeof value !== 'object' || typeof value.render !== 'function' || value.__verticalPatched) {
          return;
        }

        const originalRender = value.render.bind(value);
        value.render = function patchedTurnstileRender(container, params) {
          captureRenderParams(params);
          return originalRender(container, params);
        };
        value.__verticalPatched = true;
      };

      const existing = window.turnstile;

      if (!window[installedKey]) {
        try {
          Object.defineProperty(window, 'turnstile', {
            configurable: true,
            enumerable: true,
            get() {
              return window[instanceKey];
            },
            set(value) {
              window[instanceKey] = value;
              patchTurnstileInstance(value);
            }
          });
          window[installedKey] = true;
        } catch (_error) {
          patchTurnstileInstance(existing);
        }
      }

      if (window[installedKey] && existing) {
        window.turnstile = existing;
      } else if (existing) {
        patchTurnstileInstance(existing);
      }

      ensureState();
    });
  } catch (error) {
    if (Array.isArray(warnings)) {
      warnings.push(`Turnstile hook install failed: ${error.message}`);
    }
  }
}

async function collectTurnstileRuntimeData(page) {
  try {
    return await page.evaluate(() => {
      const state = window.__verticalTurnstileState;
      if (!state || typeof state !== 'object') {
        return null;
      }

      const latest = state.latest && typeof state.latest === 'object' ? state.latest : null;
      if (!latest) {
        return null;
      }

      return {
        siteKey: typeof latest.siteKey === 'string' ? latest.siteKey : null,
        action: typeof latest.action === 'string' ? latest.action : null,
        cData: typeof latest.cData === 'string' ? latest.cData : null,
        chlPageData: typeof latest.chlPageData === 'string' ? latest.chlPageData : null,
        callbackIndex: Number.isInteger(latest.callbackIndex) ? latest.callbackIndex : null
      };
    });
  } catch (_error) {
    return null;
  }
}

async function applySolverUserAgent(page, userAgent, warnings) {
  if (!userAgent) {
    return;
  }

  try {
    await page.setExtraHTTPHeaders({
      'user-agent': String(userAgent)
    });
  } catch (error) {
    if (Array.isArray(warnings)) {
      warnings.push(`Captcha solver returned userAgent, but runtime could not apply it: ${error.message}`);
    }
  }
}

async function applyAuthIfNeeded({ context, page, auth, secretStore, warnings, artifactManager }) {
  if (!auth || auth.mode === 'none') {
    return;
  }

  const credentials = getSecretValue(secretStore, auth.credentialRef);
  if (!credentials) {
    warnings.push('Auth requested but credentialRef is missing in secret store');
    return;
  }

  if (auth.mode === 'cookie') {
    if (Array.isArray(credentials.cookies) && credentials.cookies.length) {
      await context.addCookies(credentials.cookies);
      artifactManager.writeJson({
        type: 'auth_event',
        directory: 'evidence',
        fileName: `auth-cookie-${Date.now()}.json`,
        data: {
          mode: 'cookie',
          appliedAt: new Date().toISOString(),
          cookieCount: credentials.cookies.length
        }
      });
    } else {
      warnings.push('Cookie auth selected but secret payload has no cookies[]');
    }
    return;
  }

  if (auth.mode === 'form') {
    const loginUrl = credentials.loginUrl || credentials.url;
    if (!loginUrl) {
      warnings.push('Form auth selected but loginUrl is missing');
      return;
    }

    await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    const usernameSelector = credentials.usernameSelector || 'input[type="email"], input[name="email"], input[name="username"]';
    const passwordSelector = credentials.passwordSelector || 'input[type="password"]';
    const submitSelector = credentials.submitSelector || 'button[type="submit"], input[type="submit"]';

    if (credentials.username) {
      await page.fill(usernameSelector, String(credentials.username));
    }
    if (credentials.password) {
      await page.fill(passwordSelector, String(credentials.password));
    }

    await Promise.all([
      page.waitForLoadState('networkidle').catch(() => null),
      page.click(submitSelector).catch(() => null)
    ]);

    artifactManager.writeJson({
      type: 'auth_event',
      directory: 'evidence',
      fileName: `auth-form-${Date.now()}.json`,
      data: {
        mode: 'form',
        loginUrl,
        appliedAt: new Date().toISOString()
      }
    });
  }
}

async function renderWithBrowser({ pages, finalUrl, auth, captcha, artifactManager, secretStore, warnings, maxDurationMs }) {
  let playwright;
  try {
    playwright = require('playwright');
  } catch (_error) {
    warnings.push('Render phase skipped: playwright dependency is missing');
    return {
      renderedPages: [],
      networkSummary: []
    };
  }

  const renderedPages = [];
  const networkSummary = [];
  const startedAt = Date.now();
  const renderBudgetMs = Math.max(20000, Number(maxDurationMs || 180000));

  const httpCredentialsPayload =
    auth && auth.mode === 'http_basic' && auth.credentialRef ? getSecretValue(secretStore, auth.credentialRef) : null;

  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true });
  } catch (error) {
    warnings.push(`Render phase skipped: playwright browser launch failed (${error.message})`);
    return {
      renderedPages: [],
      networkSummary: []
    };
  }
  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    ...(httpCredentialsPayload && httpCredentialsPayload.username && httpCredentialsPayload.password
      ? {
          httpCredentials: {
            username: String(httpCredentialsPayload.username),
            password: String(httpCredentialsPayload.password)
          }
        }
      : {})
  });

  const page = await context.newPage();
  await installTurnstileHook(page, warnings);

  page.on('response', async (response) => {
    const req = response.request();
    networkSummary.push({
      url: req.url(),
      resourceType: req.resourceType(),
      status: response.status(),
      from: response.url()
    });
  });

  await applyAuthIfNeeded({
    context,
    page,
    auth,
    secretStore,
    warnings,
    artifactManager
  });

  const list = Array.isArray(pages) && pages.length ? pages.slice(0, 6) : [{ url: finalUrl || '' }];

  for (const pageItem of list) {
    if (Date.now() - startedAt > renderBudgetMs) {
      warnings.push('Render phase budget reached; remaining pages skipped');
      break;
    }

    const pageUrl = pageItem.url;
    if (!pageUrl) continue;

    try {
      const remainingMs = Math.max(6000, renderBudgetMs - (Date.now() - startedAt));
      await page.goto(pageUrl, {
        waitUntil: 'networkidle',
        timeout: Math.min(45000, remainingMs)
      });

      let html = await page.content();
      const detectedCaptchaState = detectCaptcha(html);
      const runtimeTurnstileData =
        detectedCaptchaState.type === 'turnstile' ? await collectTurnstileRuntimeData(page) : null;
      const captchaState = mergeCaptchaSignals(detectedCaptchaState, runtimeTurnstileData);
      let captchaSolved = false;

      if (captchaState.detected && captcha && captcha.enabled) {
        try {
          const apiKey = toApiKey(
            captcha.apiKeyRef ? getSecretValue(secretStore, captcha.apiKeyRef) : process.env.CAPTCHA_API_KEY || null
          );

          if (captcha.provider && apiKey && captchaState.siteKey) {
            const solveResult = await solveCaptcha({
              provider: captcha.provider,
              apiKey,
              siteKey: captchaState.siteKey,
              captchaType: captchaState.type,
              pageUrl,
              timeoutMs: 120000,
              action: captchaState.action,
              cData: captchaState.cData,
              chlPageData: captchaState.chlPageData,
              warnings
            });

            if (solveResult && solveResult.token) {
              await applySolverUserAgent(page, solveResult.userAgent, warnings);
              const applyResult = await applyCaptchaTokenOnPage(page, solveResult.token, captchaState.callbackIndex);
              captchaSolved = Boolean(applyResult && (applyResult.applied || applyResult.callbackInvoked));

              if (!captchaSolved) {
                warnings.push(`Captcha token was obtained at ${pageUrl}, but could not be applied to the page`);
              } else {
                await page.waitForTimeout(1500);
                html = await page.content();
              }
            }
          } else {
            warnings.push(`Captcha detected at ${pageUrl}, but provider/apiKeyRef/sitekey is missing`);
          }
        } catch (error) {
          warnings.push(`Captcha solve failed at ${pageUrl}: ${error.message}`);
        }
      }

      const baseName = pageUrl
        .replace(/^https?:\/\//, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .slice(0, 100);

      const htmlArtifact = artifactManager.writeText({
        type: 'rendered_html',
        directory: 'rendered',
        fileName: `${baseName}.html`,
        content: html,
        metadata: {
          url: pageUrl,
          captchaDetected: captchaState.detected,
          captchaSolved
        }
      });

      const screenshotPath = path.join(artifactManager.root, 'screenshots', `${baseName}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      const screenshotArtifact = artifactManager.register({
        type: 'screenshot',
        absPath: screenshotPath,
        metadata: {
          url: pageUrl
        }
      });

      renderedPages.push({
        url: pageUrl,
        htmlArtifactId: htmlArtifact.id,
        screenshotArtifactId: screenshotArtifact.id,
        captchaDetected: captchaState.detected,
        captchaSolved
      });
    } catch (error) {
      warnings.push(`Render failed for ${pageUrl}: ${error.message}`);
    }
  }

  artifactManager.writeJson({
    type: 'network_log',
    directory: 'network',
    fileName: `network-${Date.now()}.json`,
    data: networkSummary.slice(0, 3000)
  });

  await context.close();
  await browser.close();

  return {
    renderedPages,
    networkSummary
  };
}

module.exports = {
  renderWithBrowser,
  detectCaptcha,
  mergeCaptchaSignals,
  applyCaptchaTokenToDom
};
