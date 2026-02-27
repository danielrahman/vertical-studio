const fs = require('fs');
const path = require('path');

function stripInlineComment(value) {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    const prev = i > 0 ? value[i - 1] : '';

    if (char === "'" && !inDouble && prev !== '\\') {
      inSingle = !inSingle;
      continue;
    }

    if (char === '"' && !inSingle && prev !== '\\') {
      inDouble = !inDouble;
      continue;
    }

    if (char === '#' && !inSingle && !inDouble) {
      if (i === 0 || /\s/.test(value[i - 1])) {
        return value.slice(0, i).trim();
      }
    }
  }

  return value.trim();
}

function normalizeValue(raw) {
  const value = stripInlineComment(raw || '');
  if (!value) {
    return '';
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    const quote = value[0];
    const inner = value.slice(1, -1);
    if (quote === '"') {
      return inner.replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\"/g, '"');
    }
    return inner.replace(/\\'/g, "'");
  }

  return value;
}

function parseEnvContent(content) {
  const entries = {};
  const lines = String(content || '').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    const [, key, rawValue] = match;
    entries[key] = normalizeValue(rawValue);
  }

  return entries;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function defaultCandidates(envName) {
  return unique([
    '.env',
    envName ? `.env.${envName}` : null,
    '.env.local',
    envName ? `.env.${envName}.local` : null
  ]);
}

function loadEnvFiles(options = {}) {
  const rootDir = options.rootDir ? path.resolve(options.rootDir) : process.cwd();
  const envName = options.envName || process.env.NODE_ENV || 'development';
  const files = Array.isArray(options.files) && options.files.length ? options.files : defaultCandidates(envName);

  const loaded = [];
  const applied = {};
  const initialKeys = new Set(Object.keys(process.env));

  for (const relativeFile of files) {
    const filePath = path.resolve(rootDir, relativeFile);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const parsed = parseEnvContent(fs.readFileSync(filePath, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (!initialKeys.has(key)) {
        process.env[key] = value;
        applied[key] = value;
      }
    }
    loaded.push(filePath);
  }

  return {
    rootDir,
    files: loaded,
    applied
  };
}

module.exports = {
  loadEnvFiles,
  parseEnvContent
};
