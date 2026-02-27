const path = require('path');
const { loadEnvFiles } = require('../runtime/load-env');
const { getRuntimePaths, ensureRuntimeDirs } = require('../runtime/paths');
const { SecretStore } = require('../runtime/secret-store');

loadEnvFiles({
  rootDir: path.resolve(__dirname, '..')
});

function usage() {
  console.error('Usage: node scripts/set-secret.js <ref> <value-or-json>');
  console.error('Examples:');
  console.error('  node scripts/set-secret.js captcha.2captcha "my-api-key"');
  console.error('  node scripts/set-secret.js auth.client "{\\"username\\":\\"u\\",\\"password\\":\\"p\\"}"');
}

function parseValue(raw) {
  if (typeof raw !== 'string') {
    return raw;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return '';
  }

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      return raw;
    }
  }

  return raw;
}

function main() {
  const ref = process.argv[2];
  const rawValue = process.argv[3];

  if (!ref || typeof rawValue === 'undefined') {
    usage();
    process.exit(1);
  }

  const paths = getRuntimePaths();
  ensureRuntimeDirs(paths);
  const secretStore = new SecretStore(paths);

  secretStore.set(ref, parseValue(rawValue));
  console.log(`Stored secret ref "${ref}" in runtime secret store.`);
}

main();
