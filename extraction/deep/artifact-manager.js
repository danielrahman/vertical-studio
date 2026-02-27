const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

class ArtifactManager {
  constructor(options) {
    this.jobId = options.jobId;
    this.root = options.root;
    this.repo = options.repo || null;
    this.items = [];

    this.ensureStructure();
  }

  ensureStructure() {
    const dirs = [
      this.root,
      path.join(this.root, 'raw-html'),
      path.join(this.root, 'rendered'),
      path.join(this.root, 'screenshots'),
      path.join(this.root, 'network'),
      path.join(this.root, 'evidence'),
      path.join(this.root, 'markdown'),
      path.join(this.root, 'markdown', 'local'),
      path.join(this.root, 'markdown', 'remote'),
      path.join(this.root, 'markdown', 'canonical'),
      path.join(this.root, 'markdown', 'meta')
    ];

    for (const dir of dirs) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  sanitizeName(name) {
    return String(name || 'artifact')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 120) || 'artifact';
  }

  relativePath(absPath) {
    return path.relative(this.root, absPath).replace(/\\/g, '/');
  }

  writeText({ type, directory, fileName, content, metadata = {} }) {
    const cleanFile = this.sanitizeName(fileName);
    const abs = path.join(this.root, directory, cleanFile);
    fs.writeFileSync(abs, String(content || ''), 'utf8');
    return this.register({ type, absPath: abs, metadata });
  }

  writeJson({ type, directory, fileName, data, metadata = {} }) {
    return this.writeText({
      type,
      directory,
      fileName,
      content: JSON.stringify(data, null, 2),
      metadata: {
        ...metadata,
        format: 'json'
      }
    });
  }

  register({ type, absPath, metadata = {} }) {
    const id = randomUUID();
    const relative = this.relativePath(absPath);
    const item = {
      id,
      type,
      path: relative,
      metadata
    };

    this.items.push(item);

    if (this.repo) {
      this.repo.create({
        id,
        jobId: this.jobId,
        type,
        path: absPath,
        metadata
      });
    }

    return item;
  }

  list() {
    return [...this.items];
  }
}

module.exports = {
  ArtifactManager
};
