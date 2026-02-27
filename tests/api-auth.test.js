const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { once } = require('events');
const { createApp } = require('../api/server');
const { getRuntimePaths, ensureRuntimeDirs } = require('../runtime/paths');
const { createLogger } = require('../runtime/logger');
const { JobStore } = require('../runtime/job-store');
const { FSQueue } = require('../runtime/fs-queue');

function mkIsolatedRuntime() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vertical-auth-'));
  const paths = getRuntimePaths({
    runtimeRoot: path.join(base, '.runtime'),
    outputRoot: path.join(base, 'out')
  });
  ensureRuntimeDirs(paths);

  const logger = createLogger('auth-test');
  const jobStore = new JobStore(paths, logger);
  const queue = new FSQueue(paths, logger);

  return {
    paths,
    logger,
    jobStore,
    queue
  };
}

async function startServer(auth) {
  const runtime = mkIsolatedRuntime();
  const app = createApp({
    paths: runtime.paths,
    logger: runtime.logger,
    jobStore: runtime.jobStore,
    queue: runtime.queue,
    auth
  });

  const server = app.listen(0);
  await once(server, 'listening');

  const address = server.address();
  return {
    app,
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

async function stopServer(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

test('api auth returns 503 when auth is required but no keys are configured', async () => {
  const { server, baseUrl } = await startServer({ required: true, apiKeys: [] });

  try {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.code, 'auth_not_configured');
  } finally {
    await stopServer(server);
  }
});

test('api auth rejects unauthenticated requests when keys are configured', async () => {
  const { server, baseUrl } = await startServer({ required: true, apiKeys: ['top-secret'] });

  try {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(response.status, 401);
    const payload = await response.json();
    assert.equal(payload.code, 'unauthorized');
  } finally {
    await stopServer(server);
  }
});

test('api auth accepts x-api-key and bearer token', async () => {
  const { server, baseUrl } = await startServer({ required: true, apiKeys: ['top-secret'] });

  try {
    const keyResponse = await fetch(`${baseUrl}/api/v1/health`, {
      headers: {
        'x-api-key': 'top-secret'
      }
    });
    assert.equal(keyResponse.status, 200);

    const bearerResponse = await fetch(`${baseUrl}/api/v1/health`, {
      headers: {
        authorization: 'Bearer top-secret'
      }
    });
    assert.equal(bearerResponse.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('api auth can be disabled explicitly (local development mode)', async () => {
  const { server, baseUrl } = await startServer({ required: false, apiKeys: [] });

  try {
    const response = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(response.status, 200);
  } finally {
    await stopServer(server);
  }
});
