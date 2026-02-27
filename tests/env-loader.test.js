const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadEnvFiles } = require('../runtime/load-env');

function withEnvSnapshot(fn) {
  const snapshot = { ...process.env };
  try {
    fn();
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!Object.prototype.hasOwnProperty.call(snapshot, key)) {
        delete process.env[key];
      }
    }

    for (const [key, value] of Object.entries(snapshot)) {
      process.env[key] = value;
    }
  }
}

test('env loader applies local and environment-specific precedence', () => {
  withEnvSnapshot(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vertical-env-'));

    fs.writeFileSync(path.join(root, '.env'), 'KEY=base\nBASE_ONLY=yes\n', 'utf8');
    fs.writeFileSync(path.join(root, '.env.test'), 'KEY=env-test\n', 'utf8');
    fs.writeFileSync(path.join(root, '.env.local'), 'KEY=local\nLOCAL_ONLY=yes\n', 'utf8');
    fs.writeFileSync(path.join(root, '.env.test.local'), 'KEY=env-local\n', 'utf8');

    const result = loadEnvFiles({
      rootDir: root,
      envName: 'test'
    });

    assert.equal(result.files.length, 4);
    assert.equal(process.env.KEY, 'env-local');
    assert.equal(process.env.BASE_ONLY, 'yes');
    assert.equal(process.env.LOCAL_ONLY, 'yes');
  });
});

test('env loader does not overwrite variables already set by shell env', () => {
  withEnvSnapshot(() => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vertical-env-shell-'));
    fs.writeFileSync(path.join(root, '.env'), 'KEY=from-file\n', 'utf8');

    process.env.KEY = 'from-shell';

    loadEnvFiles({
      rootDir: root,
      envName: 'development'
    });

    assert.equal(process.env.KEY, 'from-shell');
  });
});
