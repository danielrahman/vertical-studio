const test = require('node:test');
const assert = require('node:assert/strict');
const { detectCaptcha, mergeCaptchaSignals, applyCaptchaTokenToDom } = require('../extraction/deep/render');

function createNode() {
  return {
    value: '',
    attrs: {},
    events: [],
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
    dispatchEvent(event) {
      this.events.push(event && event.type ? event.type : 'unknown');
      return true;
    }
  };
}

function createFakeDocument(selectors = {}) {
  const appendedNodes = [];

  const doc = {
    selectors,
    body: {
      appendChild(node) {
        appendedNodes.push(node);
      }
    },
    querySelectorAll(selector) {
      return this.selectors[selector] || [];
    },
    querySelector(selector) {
      const list = this.selectors[selector] || [];
      return list[0] || null;
    },
    createElement() {
      return createNode();
    }
  };

  doc.appendedNodes = appendedNodes;
  return doc;
}

test('detectCaptcha extracts turnstile metadata from html', () => {
  const html = `
    <div
      class="cf-turnstile"
      data-sitekey="turnstile-site-key"
      data-action="managed"
      data-cdata="cdata-value"
      data-pagedata="pagedata-value"></div>
  `;

  const state = detectCaptcha(html);
  assert.equal(state.detected, true);
  assert.equal(state.type, 'turnstile');
  assert.equal(state.siteKey, 'turnstile-site-key');
  assert.equal(state.action, 'managed');
  assert.equal(state.cData, 'cdata-value');
  assert.equal(state.chlPageData, 'pagedata-value');
});

test('mergeCaptchaSignals prefers runtime turnstile metadata and callback index', () => {
  const detected = {
    detected: true,
    type: 'turnstile',
    siteKey: 'html-key',
    action: 'html-action',
    cData: null,
    chlPageData: null,
    callbackIndex: null
  };

  const runtime = {
    siteKey: 'runtime-key',
    action: 'runtime-action',
    cData: 'runtime-cdata',
    chlPageData: 'runtime-pagedata',
    callbackIndex: 2
  };

  const merged = mergeCaptchaSignals(detected, runtime);
  assert.equal(merged.siteKey, 'runtime-key');
  assert.equal(merged.action, 'runtime-action');
  assert.equal(merged.cData, 'runtime-cdata');
  assert.equal(merged.chlPageData, 'runtime-pagedata');
  assert.equal(merged.callbackIndex, 2);
});

test('applyCaptchaTokenToDom writes token to fields and invokes callback', () => {
  const recaptchaInput = createNode();
  const hcaptchaInput = createNode();
  const turnstileInput = createNode();
  const callbackTokens = [];

  const doc = createFakeDocument({
    'input[name="g-recaptcha-response"]': [recaptchaInput],
    'input[name="h-captcha-response"]': [hcaptchaInput],
    'input[name="cf-turnstile-response"]': [turnstileInput]
  });

  const result = applyCaptchaTokenToDom({
    doc,
    token: 'solve-token',
    callbackIndex: 0,
    turnstileState: {
      callbacks: [
        (token) => {
          callbackTokens.push(token);
        }
      ]
    }
  });

  assert.equal(result.applied, true);
  assert.equal(result.callbackInvoked, true);
  assert.equal(recaptchaInput.value, 'solve-token');
  assert.equal(hcaptchaInput.value, 'solve-token');
  assert.equal(turnstileInput.value, 'solve-token');
  assert.deepEqual(callbackTokens, ['solve-token']);
  assert.equal(recaptchaInput.events.includes('input'), true);
  assert.equal(recaptchaInput.events.includes('change'), true);
});

test('applyCaptchaTokenToDom adds hidden turnstile field when missing', () => {
  const recaptchaInput = createNode();
  const doc = createFakeDocument({
    'input[name="g-recaptcha-response"]': [recaptchaInput]
  });

  const result = applyCaptchaTokenToDom({
    doc,
    token: 'solve-token',
    callbackIndex: null,
    turnstileState: null
  });

  assert.equal(result.applied, true);
  assert.equal(result.callbackInvoked, false);
  assert.equal(doc.appendedNodes.length, 1);
  assert.equal(doc.appendedNodes[0].name, 'cf-turnstile-response');
  assert.equal(doc.appendedNodes[0].value, 'solve-token');
});
