const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function deriveMasterKey() {
  const explicit = process.env.VERTICAL_SECRET_MASTER_KEY;
  if (explicit && explicit.trim()) {
    const raw = explicit.trim();
    if (/^[a-f0-9]{64}$/i.test(raw)) {
      return Buffer.from(raw, 'hex');
    }

    try {
      const decoded = Buffer.from(raw, 'base64');
      if (decoded.length >= 32) {
        return decoded.subarray(0, 32);
      }
    } catch (_error) {
      // Continue to deterministic fallback.
    }
  }

  return crypto.createHash('sha256').update('vertical-studio-default-master-key').digest();
}

function encrypt(masterKey, payload) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const body = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    body: body.toString('base64')
  };
}

function decrypt(masterKey, envelope) {
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const body = Buffer.from(envelope.body, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(body), decipher.final()]);
  return plain.toString('utf8');
}

function parseSecretEnvValue(value) {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch (_error) {
      return value;
    }
  }

  return value;
}

function toSecretRefEnvName(ref) {
  const normalized = String(ref || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase();

  if (!normalized) {
    return null;
  }

  return `VERTICAL_SECRET_REF_${normalized}`;
}

class SecretStore {
  constructor(paths) {
    this.filePath = path.join(paths.secretsDir, 'secrets.enc.json');
    this.masterKey = deriveMasterKey();
    this.secretMapFileCache = null;
  }

  loadAll() {
    if (!fs.existsSync(this.filePath)) {
      return {};
    }

    try {
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      const plain = decrypt(this.masterKey, raw);
      return JSON.parse(plain);
    } catch (_error) {
      return {};
    }
  }

  saveAll(records) {
    const payload = JSON.stringify(records || {});
    const envelope = encrypt(this.masterKey, payload);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(envelope, null, 2), 'utf8');
  }

  set(ref, value) {
    const key = String(ref || '').trim();
    if (!key) {
      throw new Error('Secret ref is required');
    }

    const records = this.loadAll();
    records[key] = value;
    this.saveAll(records);
  }

  loadMapFromEnvJson() {
    const envMapRaw = process.env.VERTICAL_SECRET_MAP_JSON;
    if (!envMapRaw) {
      return null;
    }

    try {
      const parsed = JSON.parse(envMapRaw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch (_error) {
      return null;
    }
  }

  loadMapFromFile() {
    const filePathRaw = process.env.VERTICAL_SECRET_MAP_FILE;
    if (!filePathRaw) {
      return null;
    }

    const resolvedPath = path.isAbsolute(filePathRaw) ? filePathRaw : path.resolve(process.cwd(), filePathRaw);
    try {
      const stat = fs.statSync(resolvedPath);
      if (
        this.secretMapFileCache &&
        this.secretMapFileCache.path === resolvedPath &&
        this.secretMapFileCache.mtimeMs === stat.mtimeMs
      ) {
        return this.secretMapFileCache.value;
      }

      const raw = fs.readFileSync(resolvedPath, 'utf8');
      const parsed = JSON.parse(raw);
      const value = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;

      this.secretMapFileCache = {
        path: resolvedPath,
        mtimeMs: stat.mtimeMs,
        value
      };

      return value;
    } catch (_error) {
      return null;
    }
  }

  loadRefFromEnv(ref) {
    const envName = toSecretRefEnvName(ref);
    if (!envName) {
      return null;
    }

    if (Object.prototype.hasOwnProperty.call(process.env, envName)) {
      return parseSecretEnvValue(process.env[envName]);
    }

    return null;
  }

  get(ref) {
    const key = String(ref || '').trim();
    if (!key) {
      return null;
    }

    const envMap = this.loadMapFromEnvJson();
    if (envMap && Object.prototype.hasOwnProperty.call(envMap, key)) {
      return envMap[key];
    }

    const fileMap = this.loadMapFromFile();
    if (fileMap && Object.prototype.hasOwnProperty.call(fileMap, key)) {
      return fileMap[key];
    }

    const refEnvValue = this.loadRefFromEnv(key);
    if (refEnvValue !== null) {
      return refEnvValue;
    }

    const records = this.loadAll();
    return Object.prototype.hasOwnProperty.call(records, key) ? records[key] : null;
  }
}

module.exports = {
  SecretStore
};
