const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { SecretStore } = require('../runtime/secret-store');

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

function mkPaths() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vertical-secret-'));
  const secretsDir = path.join(root, 'secrets');
  fs.mkdirSync(secretsDir, { recursive: true });
  return {
    root,
    paths: {
      secretsDir
    }
  };
}

test('secret store resolves refs from VERTICAL_SECRET_MAP_FILE', () => {
  withEnvSnapshot(() => {
    const { root, paths } = mkPaths();
    const mapPath = path.join(root, 'secrets-map.json');
    fs.writeFileSync(
      mapPath,
      JSON.stringify(
        {
          'captcha.2captcha': 'file-key'
        },
        null,
        2
      ),
      'utf8'
    );

    process.env.VERTICAL_SECRET_MAP_FILE = mapPath;

    const store = new SecretStore(paths);
    assert.equal(store.get('captcha.2captcha'), 'file-key');
  });
});

test('secret source precedence is env json > file map > encrypted store', () => {
  withEnvSnapshot(() => {
    const { root, paths } = mkPaths();
    const mapPath = path.join(root, 'secrets-map.json');
    fs.writeFileSync(
      mapPath,
      JSON.stringify(
        {
          ref: 'from-file'
        },
        null,
        2
      ),
      'utf8'
    );

    process.env.VERTICAL_SECRET_MAP_FILE = mapPath;
    process.env.VERTICAL_SECRET_MAP_JSON = JSON.stringify({
      ref: 'from-env'
    });

    const store = new SecretStore(paths);
    store.set('ref', 'from-store');

    assert.equal(store.get('ref'), 'from-env');
  });
});

test('secret store resolves per-ref environment variable fallback', () => {
  withEnvSnapshot(() => {
    const { paths } = mkPaths();
    process.env.VERTICAL_SECRET_REF_CAPTCHA_2CAPTCHA = 'from-ref-env';

    const store = new SecretStore(paths);
    assert.equal(store.get('captcha.2captcha'), 'from-ref-env');
  });
});

test('per-ref environment variable can hold JSON object values', () => {
  withEnvSnapshot(() => {
    const { paths } = mkPaths();
    process.env.VERTICAL_SECRET_REF_AUTH_CLIENT = JSON.stringify({
      username: 'user@example.com',
      password: 'secret'
    });

    const store = new SecretStore(paths);
    const value = store.get('auth.client');
    assert.deepEqual(value, {
      username: 'user@example.com',
      password: 'secret'
    });
  });
});
