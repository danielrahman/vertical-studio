const test = require('node:test');
const assert = require('node:assert/strict');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const schema = require('../api/validation/generate-request.schema.json');
const extractSchema = require('../api/validation/extract-request.schema.json');

function buildValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(schema);
}

function buildExtractValidator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv.compile(extractSchema);
}

test('generate request schema accepts companyIdentifier mode', () => {
  const validate = buildValidator();
  const valid = validate({
    companyIdentifier: 'and-development',
    options: {
      customizationLevel: 'standard'
    }
  });

  assert.equal(valid, true);
});

test('generate request schema rejects multiple input modes', () => {
  const validate = buildValidator();
  const valid = validate({
    companyIdentifier: 'and-development',
    input: {
      path: 'samples/all-new-development-input.json'
    }
  });

  assert.equal(valid, false);
  assert.ok((validate.errors || []).length > 0);
});

test('generate request schema rejects input.path + input.data together', () => {
  const validate = buildValidator();
  const valid = validate({
    input: {
      path: 'samples/all-new-development-input.json',
      data: { meta: { companyName: 'X' } }
    }
  });

  assert.equal(valid, false);
});

test('extract request schema accepts forensic payload', () => {
  const validate = buildExtractValidator();
  const valid = validate({
    url: 'https://example.com',
    mode: 'forensic',
    ignoreRobots: true,
    maxDurationMs: 1800000,
    budgetUsd: 5,
    localeHints: ['cs-CZ', 'en-US'],
    auth: {
      mode: 'none'
    },
    captcha: {
      enabled: true,
      provider: '2captcha',
      apiKeyRef: 'captcha-key'
    },
    offsite: {
      enabled: true,
      providers: ['exa', 'serp', 'company_data', 'social_enrichment', 'maps_reviews', 'tech_intel', 'pr_reputation']
    }
  });

  assert.equal(valid, true);
});

test('extract request schema rejects unknown fields and invalid enums', () => {
  const validate = buildExtractValidator();
  const valid = validate({
    url: 'https://example.com',
    mode: 'ultra',
    unknown: true
  });

  assert.equal(valid, false);
  assert.ok((validate.errors || []).length > 0);
});
