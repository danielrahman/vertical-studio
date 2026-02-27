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
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vertical-v3-api-'));
  const paths = getRuntimePaths({
    runtimeRoot: path.join(base, '.runtime'),
    outputRoot: path.join(base, 'out')
  });
  ensureRuntimeDirs(paths);

  const logger = createLogger('v3-api-test');
  const jobStore = new JobStore(paths, logger);
  const queue = new FSQueue(paths, logger);

  return {
    paths,
    logger,
    jobStore,
    queue
  };
}

async function startServer() {
  const runtime = mkIsolatedRuntime();
  const app = createApp({
    paths: runtime.paths,
    logger: runtime.logger,
    jobStore: runtime.jobStore,
    queue: runtime.queue,
    auth: {
      required: false,
      apiKeys: []
    }
  });

  const server = app.listen(0);
  await once(server, 'listening');

  const address = server.address();
  return {
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

test('vertical research build enforces competitor minimum and exposes latest output', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const invalidRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetCompetitorCount: 14,
        sources: ['public_web']
      })
    });

    assert.equal(invalidRes.status, 400);
    const invalidBody = await invalidRes.json();
    assert.equal(invalidBody.code, 'insufficient_competitor_sample');

    const validRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings'],
        sourceDomains: ['example-1.com', 'example-2.com']
      })
    });

    assert.equal(validRes.status, 202);

    const latestRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/latest`);
    assert.equal(latestRes.status, 200);
    const latest = await latestRes.json();
    assert.equal(latest.competitorCount, 15);

    const standardRes = await fetch(
      `${baseUrl}/api/v1/verticals/boutique-developers/standards/${latest.version}`
    );
    assert.equal(standardRes.status, 200);
    const standard = await standardRes.json();
    assert.equal(standard.standard.sourcePolicy, 'public_web_legal_selected_listings');
  } finally {
    await stopServer(server);
  }
});

test('compose propose returns deterministic three-variant envelope', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-1/compose/propose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-1',
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.variants.length, 3);
    assert.deepEqual(
      payload.variants.map((variant) => variant.variantKey),
      ['A', 'B', 'C']
    );
  } finally {
    await stopServer(server);
  }
});

test('review transition validates allowed state movement and returns invalid_transition on mismatch', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const invalidRes = await fetch(`${baseUrl}/api/v1/sites/site-1/review/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-1',
        fromState: 'draft',
        toState: 'published',
        event: 'SECURITY_PASSED'
      })
    });

    assert.equal(invalidRes.status, 409);
    const invalidBody = await invalidRes.json();
    assert.equal(invalidBody.code, 'invalid_transition');
    assert.equal(invalidBody.details.reasonCode, 'transition_not_allowed');

    const validRes = await fetch(`${baseUrl}/api/v1/sites/site-1/review/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-1',
        fromState: 'draft',
        toState: 'proposal_generated',
        event: 'PROPOSALS_READY'
      })
    });

    assert.equal(validRes.status, 200);

    const staleStateRes = await fetch(`${baseUrl}/api/v1/sites/site-1/review/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-1',
        fromState: 'draft',
        toState: 'proposal_generated',
        event: 'PROPOSALS_READY'
      })
    });

    assert.equal(staleStateRes.status, 409);
    const staleBody = await staleStateRes.json();
    assert.equal(staleBody.code, 'invalid_transition');
    assert.equal(staleBody.details.reasonCode, 'state_mismatch');
  } finally {
    await stopServer(server);
  }
});

test('secret refs endpoint enforces internal_admin ACL, naming policy, and metadata-only payloads', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const nonAdminRes = await fetch(`${baseUrl}/api/v1/secrets/refs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tenantId: 'tenant-1',
        ref: 'tenant.tenant-1.openai.api',
        provider: 'openai',
        key: 'api'
      })
    });

    assert.equal(nonAdminRes.status, 403);
    const nonAdminBody = await nonAdminRes.json();
    assert.equal(nonAdminBody.code, 'forbidden');

    const internalAdminHeaders = {
      'content-type': 'application/json',
      'x-user-role': 'internal_admin'
    };

    const invalidRes = await fetch(`${baseUrl}/api/v1/secrets/refs`, {
      method: 'POST',
      headers: internalAdminHeaders,
      body: JSON.stringify({
        tenantId: 'tenant-1',
        ref: 'captcha.2captcha',
        provider: '2captcha',
        key: 'api'
      })
    });

    assert.equal(invalidRes.status, 400);
    const invalidBody = await invalidRes.json();
    assert.equal(invalidBody.code, 'validation_error');

    const plaintextRes = await fetch(`${baseUrl}/api/v1/secrets/refs`, {
      method: 'POST',
      headers: internalAdminHeaders,
      body: JSON.stringify({
        tenantId: 'tenant-1',
        ref: 'tenant.tenant-1.openai.api',
        provider: 'openai',
        key: 'api',
        value: 'top-secret'
      })
    });

    assert.equal(plaintextRes.status, 400);
    const plaintextBody = await plaintextRes.json();
    assert.equal(plaintextBody.code, 'validation_error');
    assert.equal(plaintextBody.details.field, 'value');

    const mismatchRes = await fetch(`${baseUrl}/api/v1/secrets/refs`, {
      method: 'POST',
      headers: internalAdminHeaders,
      body: JSON.stringify({
        tenantId: 'tenant-1',
        tenantSlug: 'tenant-1',
        ref: 'tenant.tenant-1.openai.api',
        provider: 'openai',
        key: 'other'
      })
    });

    assert.equal(mismatchRes.status, 400);
    const mismatchBody = await mismatchRes.json();
    assert.equal(mismatchBody.code, 'validation_error');
    assert.equal(mismatchBody.details.field, 'key');

    const validRes = await fetch(`${baseUrl}/api/v1/secrets/refs`, {
      method: 'POST',
      headers: internalAdminHeaders,
      body: JSON.stringify({
        tenantId: 'tenant-1',
        tenantSlug: 'tenant-1',
        ref: 'tenant.tenant-1.openai.api',
        provider: 'openai',
        key: 'api',
        label: 'OpenAI API Key'
      })
    });

    assert.equal(validRes.status, 201);
    const payload = await validRes.json();
    assert.equal(payload.secretRefId.length > 0, true);
    assert.equal(payload.tenantSlug, 'tenant-1');
    assert.equal(payload.ref, 'tenant.tenant-1.openai.api');
    assert.equal(payload.label, 'OpenAI API Key');
    assert.equal('value' in payload, false);

    const updatedRes = await fetch(`${baseUrl}/api/v1/secrets/refs`, {
      method: 'POST',
      headers: internalAdminHeaders,
      body: JSON.stringify({
        tenantId: 'tenant-1',
        tenantSlug: 'tenant-1',
        ref: 'tenant.tenant-1.openai.api',
        provider: 'openai',
        key: 'api',
        description: 'Primary OpenAI tenant key'
      })
    });

    assert.equal(updatedRes.status, 200);
    const updatedPayload = await updatedRes.json();
    assert.equal(updatedPayload.secretRefId, payload.secretRefId);
    assert.equal(updatedPayload.description, 'Primary OpenAI tenant key');
    assert.equal(updatedPayload.tenantId, 'tenant-1');
    assert.equal(updatedPayload.provider, 'openai');
    assert.equal(updatedPayload.key, 'api');
  } finally {
    await stopServer(server);
  }
});

test('component contract endpoint returns contract and typed not-found code', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const existingRes = await fetch(`${baseUrl}/api/v1/component-contracts/hero/1.0.0`);
    assert.equal(existingRes.status, 200);

    const missingRes = await fetch(`${baseUrl}/api/v1/component-contracts/missing/1.0.0`);
    assert.equal(missingRes.status, 404);
    const missingBody = await missingRes.json();
    assert.equal(missingBody.code, 'component_contract_not_found');
  } finally {
    await stopServer(server);
  }
});
