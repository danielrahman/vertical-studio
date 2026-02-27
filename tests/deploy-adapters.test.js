const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getRuntimePaths, ensureRuntimeDirs } = require('../runtime/paths');
const { LocalStorageAdapter } = require('../infrastructure/storage/local-storage-adapter');
const { LocalDeployAdapter } = require('../infrastructure/deploy/local-deploy-adapter');
const { VercelDeployAdapter } = require('../infrastructure/deploy/vercel-deploy-adapter');

function mkPaths() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vertical-deploy-'));
  const paths = getRuntimePaths({
    runtimeRoot: path.join(base, '.runtime'),
    outputRoot: path.join(base, 'out')
  });
  ensureRuntimeDirs(paths);
  return { base, paths };
}

test('local deploy adapter copies artifacts and returns preview URL', () => {
  const { paths } = mkPaths();
  const outputDir = path.join(paths.outputRoot, 'job-a');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'site-config.json'), '{"ok":true}');

  const adapter = new LocalDeployAdapter({
    paths,
    storage: new LocalStorageAdapter()
  });

  const result = adapter.deploy({
    job: {
      jobId: 'job-a',
      outputDir
    },
    deploymentId: 'dep-a',
    requestBaseUrl: 'http://localhost:3001'
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.previewUrl, 'http://localhost:3001/preview/job-a');
  assert.equal(fs.existsSync(path.join(paths.deploymentsDir, 'local', 'dep-a', 'site-config.json')), true);
});

test('vercel deploy adapter rejects missing config', () => {
  const prevToken = process.env.VERCEL_TOKEN;
  const prevProject = process.env.VERCEL_PROJECT_ID;

  delete process.env.VERCEL_TOKEN;
  delete process.env.VERCEL_PROJECT_ID;

  try {
    const adapter = new VercelDeployAdapter();
    assert.throws(
      () => adapter.deploy({ job: { jobId: 'job-x' } }),
      (error) => error && error.code === 'vercel_not_configured'
    );
  } finally {
    if (prevToken === undefined) {
      delete process.env.VERCEL_TOKEN;
    } else {
      process.env.VERCEL_TOKEN = prevToken;
    }

    if (prevProject === undefined) {
      delete process.env.VERCEL_PROJECT_ID;
    } else {
      process.env.VERCEL_PROJECT_ID = prevProject;
    }
  }
});
