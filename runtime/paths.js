const fs = require('fs');
const path = require('path');

function resolveFromCwd(value, fallback) {
  const raw = value || fallback;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function getRuntimePaths(overrides = {}) {
  const runtimeRoot = resolveFromCwd(overrides.runtimeRoot || process.env.VERTICAL_RUNTIME_DIR, '.runtime');
  const outputRoot = resolveFromCwd(overrides.outputRoot || process.env.VERTICAL_OUTPUT_ROOT, 'build-output/jobs');

  const jobsDir = path.join(runtimeRoot, 'jobs');
  const queueDir = path.join(runtimeRoot, 'queue');
  const queuePendingDir = path.join(queueDir, 'pending');
  const queueInflightDir = path.join(queueDir, 'inflight');
  const deploymentsDir = path.join(runtimeRoot, 'deployments');
  const storageDir = path.join(runtimeRoot, 'storage');
  const extractionDir = path.join(runtimeRoot, 'extraction');
  const secretsDir = path.join(runtimeRoot, 'secrets');
  const databasePath = resolveFromCwd(
    overrides.databasePath || process.env.VERTICAL_SQLITE_PATH,
    path.join(runtimeRoot, 'vertical-studio.sqlite')
  );

  return {
    runtimeRoot,
    outputRoot,
    databasePath,
    jobsDir,
    queueDir,
    queuePendingDir,
    queueInflightDir,
    deploymentsDir,
    extractionDir,
    secretsDir,
    storageDir
  };
}

function ensureRuntimeDirs(paths) {
  const dirs = [
    paths.runtimeRoot,
    paths.outputRoot,
    paths.jobsDir,
    paths.queueDir,
    paths.queuePendingDir,
    paths.queueInflightDir,
    paths.deploymentsDir,
    paths.extractionDir,
    paths.secretsDir,
    paths.storageDir
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  getRuntimePaths,
  ensureRuntimeDirs
};
