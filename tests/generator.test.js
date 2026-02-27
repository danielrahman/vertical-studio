const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { GeneratorEngine } = require('../engine/generator');
const { Pipeline } = require('../engine/pipeline');

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vertical-studio-'));
}

test('generator produces expected artifacts for valid input', () => {
  const prevBase = process.env.VERTICAL_PREVIEW_BASE_URL;
  process.env.VERTICAL_PREVIEW_BASE_URL = 'https://preview.local';

  try {
    const engine = new GeneratorEngine();
    const outDir = mkTmpDir();
    const input = path.join(__dirname, '..', 'samples', 'all-new-development-input.json');

    const result = engine.generate(input, outDir);
    assert.equal(result.success, true);
    assert.equal(result.previewUrl, 'https://preview.local/and-development');

    const expectedFiles = [
      'site-config.json',
      'theme-config.json',
      'Site.jsx',
      'sales-email.txt',
      'SPEC.md',
      'manifest.json'
    ];

    for (const file of expectedFiles) {
      assert.equal(fs.existsSync(path.join(outDir, file)), true, `Missing ${file}`);
    }
  } finally {
    if (prevBase === undefined) {
      delete process.env.VERTICAL_PREVIEW_BASE_URL;
    } else {
      process.env.VERTICAL_PREVIEW_BASE_URL = prevBase;
    }
  }
});

test('generator returns schema errors for invalid input', () => {
  const engine = new GeneratorEngine();
  const outDir = mkTmpDir();
  const baseInputPath = path.join(__dirname, '..', 'samples', 'all-new-development-input.json');
  const invalidPath = path.join(outDir, 'invalid.json');

  const data = JSON.parse(fs.readFileSync(baseInputPath, 'utf8'));
  delete data.meta.companyName;
  fs.writeFileSync(invalidPath, JSON.stringify(data, null, 2));

  const result = engine.generate(invalidPath, outDir);
  assert.equal(result.success, false);
  assert.ok(Array.isArray(result.errors));
  assert.ok(result.errors.length > 0);
});

test('individualization applies formal tone defaults', () => {
  const engine = new GeneratorEngine();
  const outDir = mkTmpDir();
  const input = path.join(__dirname, '..', 'samples', 'castle-rock-input.json');

  const result = engine.generate(input, outDir);
  assert.equal(result.success, true);
  assert.equal(result.individualization.tone, 'formal');
  assert.equal(result.individualization.heroAlign, 'center');
  assert.equal(result.individualization.borderRadius, 6);
});

test('pipeline processes all sample files and writes a report', () => {
  const pipeline = new Pipeline();
  const outDir = mkTmpDir();
  const inputDir = path.join(__dirname, '..', 'samples');

  const result = pipeline.run(inputDir, outDir);
  assert.equal(result.total >= 2, true);
  assert.equal(result.failed, 0);
  assert.equal(fs.existsSync(result.reportPath), true);
});

test('generator does not invent preview URL without deployment configuration', () => {
  const prevBase = process.env.VERTICAL_PREVIEW_BASE_URL;
  delete process.env.VERTICAL_PREVIEW_BASE_URL;

  try {
    const engine = new GeneratorEngine();
    const outDir = mkTmpDir();
    const input = path.join(__dirname, '..', 'samples', 'all-new-development-input.json');

    const result = engine.generate(input, outDir);
    assert.equal(result.success, true);
    assert.equal('previewUrl' in result, false);

    const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
    assert.equal(manifest.preview.status, 'not_configured');
    assert.equal('url' in manifest.preview, false);
  } finally {
    if (prevBase === undefined) {
      delete process.env.VERTICAL_PREVIEW_BASE_URL;
    } else {
      process.env.VERTICAL_PREVIEW_BASE_URL = prevBase;
    }
  }
});

test('generateFromObject supports direct object input', () => {
  const engine = new GeneratorEngine();
  const outDir = mkTmpDir();
  const inputPath = path.join(__dirname, '..', 'samples', 'all-new-development-input.json');
  const inputObject = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  const result = engine.generateFromObject(inputObject, outDir);
  assert.equal(result.success, true);
  assert.equal(fs.existsSync(path.join(outDir, 'site-config.json')), true);
});

test('preview URL option takes precedence over env variable', () => {
  const prevBase = process.env.VERTICAL_PREVIEW_BASE_URL;
  process.env.VERTICAL_PREVIEW_BASE_URL = 'https://env-preview.example.com';

  try {
    const engine = new GeneratorEngine();
    const outDir = mkTmpDir();
    const inputPath = path.join(__dirname, '..', 'samples', 'all-new-development-input.json');

    const result = engine.generate(inputPath, outDir, {
      previewBaseUrl: 'https://opt-preview.example.com'
    });

    assert.equal(result.success, true);
    assert.equal(result.previewUrl, 'https://opt-preview.example.com/and-development');
  } finally {
    if (prevBase === undefined) {
      delete process.env.VERTICAL_PREVIEW_BASE_URL;
    } else {
      process.env.VERTICAL_PREVIEW_BASE_URL = prevBase;
    }
  }
});
