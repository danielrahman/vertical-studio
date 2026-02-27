const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { resolveInputForJob, InputResolutionError } = require('../worker/input-resolver');

function makeJob(request, options = {}) {
  return {
    request,
    options
  };
}

test('resolver handles companyIdentifier via sample slug', () => {
  const resolved = resolveInputForJob(
    makeJob({ companyIdentifier: 'and-development' }),
    { samplesDir: path.join(__dirname, '..', 'samples') }
  );

  assert.equal(resolved.mode, 'companyIdentifier');
  assert.equal(resolved.inputObject.meta.brandSlug, 'and-development');
});

test('resolver handles input.path mode', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vertical-input-'));
  const inputPath = path.join(tempDir, 'company.json');
  fs.writeFileSync(
    inputPath,
    JSON.stringify({
      meta: {
        companyName: 'Path Company',
        brandSlug: 'path-company',
        locale: 'cs-CZ',
        industry: 'boutique_developer'
      }
    })
  );

  const resolved = resolveInputForJob(makeJob({ input: { path: inputPath } }));
  assert.equal(resolved.mode, 'input.path');
  assert.equal(resolved.inputPath, inputPath);
});

test('resolver handles input.data mode and applies option overrides', () => {
  const resolved = resolveInputForJob(
    makeJob(
      {
        input: {
          data: {
            meta: {
              companyName: 'Inline Co',
              brandSlug: 'inline-co',
              locale: 'en-US',
              industry: 'real_estate'
            }
          }
        }
      },
      {
        locale: 'cs-CZ',
        industry: 'boutique_developer'
      }
    )
  );

  assert.equal(resolved.mode, 'input.data');
  assert.equal(resolved.inputObject.meta.locale, 'cs-CZ');
  assert.equal(resolved.inputObject.meta.industry, 'boutique_developer');
});

test('resolver throws on unknown companyIdentifier', () => {
  assert.throws(
    () =>
      resolveInputForJob(
        makeJob({ companyIdentifier: 'missing-company' }),
        { samplesDir: path.join(__dirname, '..', 'samples') }
      ),
    InputResolutionError
  );
});
