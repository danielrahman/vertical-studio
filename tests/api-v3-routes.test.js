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

const INTERNAL_ADMIN_HEADERS = {
  'content-type': 'application/json',
  'x-user-role': 'internal_admin'
};

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
    const forbiddenRes = await fetch(`${baseUrl}/api/v1/sites/site-1/review/transition`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-1',
        fromState: 'draft',
        toState: 'proposal_generated',
        event: 'PROPOSALS_READY'
      })
    });
    assert.equal(forbiddenRes.status, 403);

    const invalidRes = await fetch(`${baseUrl}/api/v1/sites/site-1/review/transition`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
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
      headers: INTERNAL_ADMIN_HEADERS,
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
      headers: INTERNAL_ADMIN_HEADERS,
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

test('ops review flow enforces internal_admin selection and override state gating', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const proposeRes = await fetch(`${baseUrl}/api/v1/sites/site-1/compose/propose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-ops-1',
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(proposeRes.status, 200);
    const proposeBody = await proposeRes.json();

    const forbiddenSelectRes = await fetch(`${baseUrl}/api/v1/sites/site-1/compose/select`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-ops-1',
        proposalId: proposeBody.variants[0].proposalId
      })
    });
    assert.equal(forbiddenSelectRes.status, 403);

    const blockedOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-1/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-ops-1',
        tone: ['credible']
      })
    });
    assert.equal(blockedOverrideRes.status, 409);
    const blockedOverrideBody = await blockedOverrideRes.json();
    assert.equal(blockedOverrideBody.code, 'invalid_transition');
    assert.equal(blockedOverrideBody.details.reasonCode, 'override_state_invalid');

    const toReviewRes = await fetch(`${baseUrl}/api/v1/sites/site-1/review/transition`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-ops-1',
        fromState: 'proposal_generated',
        toState: 'review_in_progress',
        event: 'REVIEW_STARTED'
      })
    });
    assert.equal(toReviewRes.status, 200);

    const storedOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-1/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-ops-1',
        tone: ['credible'],
        requiredSections: ['hero', 'contact']
      })
    });
    assert.equal(storedOverrideRes.status, 200);
    const storedOverrideBody = await storedOverrideRes.json();
    assert.equal(storedOverrideBody.version, 1);

    const invalidProposalRes = await fetch(`${baseUrl}/api/v1/sites/site-1/compose/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-ops-1',
        proposalId: 'proposal-missing'
      })
    });
    assert.equal(invalidProposalRes.status, 404);

    const selectedProposalRes = await fetch(`${baseUrl}/api/v1/sites/site-1/compose/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-ops-1',
        proposalId: proposeBody.variants[1].proposalId
      })
    });
    assert.equal(selectedProposalRes.status, 200);
    const selectedProposalBody = await selectedProposalRes.json();
    assert.equal(selectedProposalBody.reviewState, 'proposal_selected');

    const updatedOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-1/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-ops-1',
        keywords: ['trust', 'delivery']
      })
    });
    assert.equal(updatedOverrideRes.status, 200);
    const updatedOverrideBody = await updatedOverrideRes.json();
    assert.equal(updatedOverrideBody.version, 2);
  } finally {
    await stopServer(server);
  }
});

test('public runtime resolves active site version by host and serves immutable snapshots', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const firstPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-runtime-1/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-runtime-1',
        proposalId: 'proposal-runtime-a',
        host: 'runtime-tenant.example.test'
      })
    });
    assert.equal(firstPublishRes.status, 200);
    const firstPublishBody = await firstPublishRes.json();

    const firstResolveRes = await fetch(
      `${baseUrl}/api/v1/public/runtime/resolve?host=runtime-tenant.example.test`
    );
    assert.equal(firstResolveRes.status, 200);
    const firstResolveBody = await firstResolveRes.json();
    assert.equal(firstResolveBody.versionId, firstPublishBody.versionId);
    assert.equal(firstResolveBody.storageKey, firstPublishBody.storageKey);

    const firstSnapshotRes = await fetch(
      `${baseUrl}/api/v1/public/runtime/snapshot/by-storage-key?storageKey=${encodeURIComponent(firstResolveBody.storageKey)}`
    );
    assert.equal(firstSnapshotRes.status, 200);
    const firstSnapshotBody = await firstSnapshotRes.json();
    assert.equal(firstSnapshotBody.immutable, true);
    assert.equal(firstSnapshotBody.snapshot.proposalId, 'proposal-runtime-a');

    const secondPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-runtime-1/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-runtime-2',
        proposalId: 'proposal-runtime-b',
        host: 'runtime-tenant.example.test'
      })
    });
    assert.equal(secondPublishRes.status, 200);
    const secondPublishBody = await secondPublishRes.json();

    const secondResolveRes = await fetch(
      `${baseUrl}/api/v1/public/runtime/resolve?host=runtime-tenant.example.test`
    );
    assert.equal(secondResolveRes.status, 200);
    const secondResolveBody = await secondResolveRes.json();
    assert.equal(secondResolveBody.versionId, secondPublishBody.versionId);
    assert.notEqual(secondResolveBody.versionId, firstPublishBody.versionId);

    const immutableFirstSnapshotRes = await fetch(
      `${baseUrl}/api/v1/public/runtime/snapshot/by-storage-key?storageKey=${encodeURIComponent(firstPublishBody.storageKey)}`
    );
    assert.equal(immutableFirstSnapshotRes.status, 200);
    const immutableFirstSnapshotBody = await immutableFirstSnapshotRes.json();
    assert.equal(immutableFirstSnapshotBody.snapshot.proposalId, 'proposal-runtime-a');

    const latestSnapshotRes = await fetch(
      `${baseUrl}/api/v1/public/runtime/snapshot/by-storage-key?storageKey=${encodeURIComponent(secondResolveBody.storageKey)}`
    );
    assert.equal(latestSnapshotRes.status, 200);
    const latestSnapshotBody = await latestSnapshotRes.json();
    assert.equal(latestSnapshotBody.snapshot.proposalId, 'proposal-runtime-b');
  } finally {
    await stopServer(server);
  }
});

test('rollback repoints active runtime version to exact prior immutable version', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const firstPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-runtime-rollback/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-rollback-1',
        proposalId: 'proposal-rollback-a',
        host: 'rollback-tenant.example.test'
      })
    });
    assert.equal(firstPublishRes.status, 200);
    const firstPublish = await firstPublishRes.json();

    const secondPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-runtime-rollback/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-rollback-2',
        proposalId: 'proposal-rollback-b',
        host: 'rollback-tenant.example.test'
      })
    });
    assert.equal(secondPublishRes.status, 200);
    const secondPublish = await secondPublishRes.json();

    const beforeRollbackResolveRes = await fetch(
      `${baseUrl}/api/v1/public/runtime/resolve?host=rollback-tenant.example.test`
    );
    assert.equal(beforeRollbackResolveRes.status, 200);
    const beforeRollbackResolve = await beforeRollbackResolveRes.json();
    assert.equal(beforeRollbackResolve.versionId, secondPublish.versionId);

    const rollbackRes = await fetch(
      `${baseUrl}/api/v1/sites/site-runtime-rollback/rollback/${firstPublish.versionId}`,
      {
        method: 'POST',
        headers: INTERNAL_ADMIN_HEADERS
      }
    );
    assert.equal(rollbackRes.status, 200);
    const rollbackBody = await rollbackRes.json();
    assert.equal(rollbackBody.status, 'rolled_back');
    assert.equal(rollbackBody.activeVersionId, firstPublish.versionId);

    const afterRollbackResolveRes = await fetch(
      `${baseUrl}/api/v1/public/runtime/resolve?host=rollback-tenant.example.test`
    );
    assert.equal(afterRollbackResolveRes.status, 200);
    const afterRollbackResolve = await afterRollbackResolveRes.json();
    assert.equal(afterRollbackResolve.versionId, firstPublish.versionId);

    const missingRollbackRes = await fetch(
      `${baseUrl}/api/v1/sites/site-runtime-rollback/rollback/version-missing`,
      {
        method: 'POST',
        headers: INTERNAL_ADMIN_HEADERS
      }
    );
    assert.equal(missingRollbackRes.status, 404);
    const missingRollback = await missingRollbackRes.json();
    assert.equal(missingRollback.code, 'runtime_version_not_found');
  } finally {
    await stopServer(server);
  }
});

test('post-publish draft edits do not affect live runtime snapshot pointer', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const publishRes = await fetch(`${baseUrl}/api/v1/sites/site-live-immutable/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-live-v1',
        proposalId: 'proposal-live-v1',
        host: 'live-immutable.example.test'
      })
    });
    assert.equal(publishRes.status, 200);
    const publishBody = await publishRes.json();

    const beforeResolveRes = await fetch(`${baseUrl}/api/v1/public/runtime/resolve?host=live-immutable.example.test`);
    assert.equal(beforeResolveRes.status, 200);
    const beforeResolve = await beforeResolveRes.json();
    assert.equal(beforeResolve.versionId, publishBody.versionId);

    const beforeSnapshotRes = await fetch(
      `${baseUrl}/api/v1/public/runtime/snapshot/by-storage-key?storageKey=${encodeURIComponent(beforeResolve.storageKey)}`
    );
    assert.equal(beforeSnapshotRes.status, 200);
    const beforeSnapshot = await beforeSnapshotRes.json();
    assert.equal(beforeSnapshot.snapshot.proposalId, 'proposal-live-v1');

    const proposeRes = await fetch(`${baseUrl}/api/v1/sites/site-live-immutable/compose/propose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-live-v2',
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(proposeRes.status, 200);

    const toReviewRes = await fetch(`${baseUrl}/api/v1/sites/site-live-immutable/review/transition`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-live-v2',
        fromState: 'proposal_generated',
        toState: 'review_in_progress',
        event: 'REVIEW_STARTED'
      })
    });
    assert.equal(toReviewRes.status, 200);

    const overrideRes = await fetch(`${baseUrl}/api/v1/sites/site-live-immutable/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-live-v2',
        tone: ['credible', 'precise']
      })
    });
    assert.equal(overrideRes.status, 200);

    const afterResolveRes = await fetch(`${baseUrl}/api/v1/public/runtime/resolve?host=live-immutable.example.test`);
    assert.equal(afterResolveRes.status, 200);
    const afterResolve = await afterResolveRes.json();
    assert.equal(afterResolve.versionId, beforeResolve.versionId);

    const afterSnapshotRes = await fetch(
      `${baseUrl}/api/v1/public/runtime/snapshot/by-storage-key?storageKey=${encodeURIComponent(afterResolve.storageKey)}`
    );
    assert.equal(afterSnapshotRes.status, 200);
    const afterSnapshot = await afterSnapshotRes.json();
    assert.equal(afterSnapshot.snapshot.proposalId, 'proposal-live-v1');
  } finally {
    await stopServer(server);
  }
});

test('publish and rollback endpoints require internal_admin role', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const publishForbiddenRes = await fetch(`${baseUrl}/api/v1/sites/site-acl/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-acl-1',
        proposalId: 'proposal-acl-1'
      })
    });
    assert.equal(publishForbiddenRes.status, 403);
    const publishForbiddenBody = await publishForbiddenRes.json();
    assert.equal(publishForbiddenBody.code, 'forbidden');

    const publishOkRes = await fetch(`${baseUrl}/api/v1/sites/site-acl/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-acl-1',
        proposalId: 'proposal-acl-1'
      })
    });
    assert.equal(publishOkRes.status, 200);
    const publishOk = await publishOkRes.json();

    const rollbackForbiddenRes = await fetch(
      `${baseUrl}/api/v1/sites/site-acl/rollback/${publishOk.versionId}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' }
      }
    );
    assert.equal(rollbackForbiddenRes.status, 403);
    const rollbackForbiddenBody = await rollbackForbiddenRes.json();
    assert.equal(rollbackForbiddenBody.code, 'forbidden');
  } finally {
    await stopServer(server);
  }
});

test('public runtime snapshot by storage key returns immutable payload and 404 for unknown key', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const publishRes = await fetch(`${baseUrl}/api/v1/sites/site-storage-key/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-storage-key-1',
        proposalId: 'proposal-storage-key-1',
        host: 'storage-key.example.test'
      })
    });
    assert.equal(publishRes.status, 200);
    const publishBody = await publishRes.json();

    const snapshotRes = await fetch(
      `${baseUrl}/api/v1/public/runtime/snapshot/by-storage-key?storageKey=${encodeURIComponent(publishBody.storageKey)}`
    );
    assert.equal(snapshotRes.status, 200);
    const snapshotBody = await snapshotRes.json();
    assert.equal(snapshotBody.storageKey, publishBody.storageKey);
    assert.equal(snapshotBody.immutable, true);
    assert.equal(snapshotBody.snapshot.proposalId, 'proposal-storage-key-1');

    const missingRes = await fetch(
      `${baseUrl}/api/v1/public/runtime/snapshot/by-storage-key?storageKey=${encodeURIComponent('site-versions/site-storage-key/missing.json')}`
    );
    assert.equal(missingRes.status, 404);
    const missingBody = await missingRes.json();
    assert.equal(missingBody.code, 'runtime_snapshot_not_found');
  } finally {
    await stopServer(server);
  }
});

test('quality latest endpoint returns required COPY/LAYOUT/MEDIA/LEGAL gate outcomes', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-quality/quality/latest`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'pending');
    assert.equal(Array.isArray(payload.gateOutcomes), true);
    assert.deepEqual(
      payload.gateOutcomes.map((item) => item.family),
      ['COPY', 'LAYOUT', 'MEDIA', 'LEGAL']
    );
    assert.equal(payload.gateOutcomes.every((item) => item.status === 'pending'), true);
  } finally {
    await stopServer(server);
  }
});

test('security latest endpoint returns artifact references and deterministic gate decision fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-security/security/latest`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'pending');
    assert.equal(payload.gateDecision.reasonCode, 'security_pass_non_blocking_only');
    assert.equal(payload.gateDecision.blocked, false);
    assert.equal(payload.severityCounts.critical, 0);
    assert.equal(typeof payload.artifacts.findingsJsonPath, 'string');
    assert.equal(typeof payload.artifacts.reportMarkdownPath, 'string');
    assert.equal(typeof payload.artifacts.gateResultJsonPath, 'string');
    assert.equal(payload.artifacts.findingsJsonPath.includes('docs/security/findings/'), true);
    assert.equal(payload.artifacts.reportMarkdownPath.includes('docs/security/reports/'), true);
    assert.equal(payload.artifacts.gateResultJsonPath.includes('docs/security/gates/'), true);
  } finally {
    await stopServer(server);
  }
});

test('audit events endpoint is internal-admin scoped and returns privileged action trail', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const forbiddenRes = await fetch(`${baseUrl}/api/v1/audit/events`);
    assert.equal(forbiddenRes.status, 403);

    const createSecretRefRes = await fetch(`${baseUrl}/api/v1/secrets/refs`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        tenantId: 'tenant-audit',
        tenantSlug: 'tenant-audit',
        ref: 'tenant.tenant-audit.openai.api',
        provider: 'openai',
        key: 'api'
      })
    });
    assert.equal(createSecretRefRes.status, 201);

    const auditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=secret_ref_created&limit=20`,
      {
        headers: {
          'x-user-role': 'internal_admin'
        }
      }
    );
    assert.equal(auditRes.status, 200);
    const auditPayload = await auditRes.json();
    assert.equal(auditPayload.count >= 1, true);
    assert.equal(auditPayload.items[0].action, 'secret_ref_created');
    assert.equal(auditPayload.items[0].entityType, 'secret_ref');
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

    const invalidRes = await fetch(`${baseUrl}/api/v1/secrets/refs`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
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
      headers: INTERNAL_ADMIN_HEADERS,
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
      headers: INTERNAL_ADMIN_HEADERS,
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
      headers: INTERNAL_ADMIN_HEADERS,
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
      headers: INTERNAL_ADMIN_HEADERS,
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
