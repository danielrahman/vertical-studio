const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getRuntimePaths, ensureRuntimeDirs } = require('../runtime/paths');
const { createLogger } = require('../runtime/logger');
const { JobStore } = require('../runtime/job-store');

function mkStore() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vertical-store-'));
  const paths = getRuntimePaths({
    runtimeRoot: path.join(base, '.runtime'),
    outputRoot: path.join(base, 'out')
  });
  ensureRuntimeDirs(paths);
  const logger = createLogger('test-store');
  const store = new JobStore(paths, logger);
  return { store, paths, base };
}

test('job store enforces valid transitions', () => {
  const { store } = mkStore();
  const created = store.create({
    jobId: 'job-1',
    status: 'pending',
    request: {},
    inputSource: { mode: 'input.data' },
    outputDir: '/tmp/out/job-1'
  });

  assert.equal(created.status, 'pending');
  assert.throws(() => store.transition('job-1', 'completed'));

  const processing = store.transition('job-1', 'processing');
  assert.equal(processing.status, 'processing');
  assert.ok(processing.startedAt);

  const completed = store.transition('job-1', 'completed');
  assert.equal(completed.status, 'completed');
  assert.ok(typeof completed.durationMs === 'number');
});

test('job store supports recovery transition processing -> pending', () => {
  const { store } = mkStore();
  store.create({
    jobId: 'job-2',
    status: 'pending',
    request: {},
    inputSource: { mode: 'input.data' },
    outputDir: '/tmp/out/job-2'
  });

  store.transition('job-2', 'processing');
  const recovered = store.transition('job-2', 'pending', { reason: 'recovery' });
  assert.equal(recovered.status, 'pending');

  assert.throws(() => store.transition('job-2', 'pending'));
});
