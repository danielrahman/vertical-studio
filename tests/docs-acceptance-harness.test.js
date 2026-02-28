const test = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { once } = require('events');
const { performance } = require('perf_hooks');
const { createApp } = require('../api/server');
const { getRuntimePaths, ensureRuntimeDirs } = require('../runtime/paths');
const { createLogger } = require('../runtime/logger');
const { JobStore } = require('../runtime/job-store');
const { FSQueue } = require('../runtime/fs-queue');

const REPO_ROOT = path.resolve(__dirname, '..');
const INTERNAL_ADMIN_HEADERS = {
  'content-type': 'application/json',
  'x-user-role': 'internal_admin'
};
const TENANT_MEMBER_HEADERS = {
  'x-user-role': 'viewer'
};
const CMS_WEBHOOK_SECRET = 'test-cms-webhook-secret';

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function mustContain(content, expected, message) {
  assert.equal(content.includes(expected), true, message || `Expected content to include: ${expected}`);
}

function listSectionStatesFromArchitecture(content) {
  const marker = '## 6. Approval State Machine';
  const fromMarker = content.slice(content.indexOf(marker));
  const statesBlock = fromMarker
    .split('Canonical states:')[1]
    .split('Allowed transitions:')[0]
    .split('\n');

  return statesBlock
    .map((line) => line.match(/`([^`]+)`/))
    .filter(Boolean)
    .map((match) => match[1]);
}

function listReviewStateUnionFromApi(content) {
  const unionBlock = content.split('type ReviewState =')[1].split('type ReviewTransitionRequest =')[0];
  return Array.from(unionBlock.matchAll(/"([^"]+)"/g)).map((match) => match[1]);
}

function mkIsolatedRuntime() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'vertical-doc-acceptance-'));
  const paths = getRuntimePaths({
    runtimeRoot: path.join(base, '.runtime'),
    outputRoot: path.join(base, 'out')
  });
  ensureRuntimeDirs(paths);

  const logger = createLogger('docs-acceptance-test');
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
  app.locals.cmsWebhookSecret = CMS_WEBHOOK_SECRET;

  const server = app.listen(0);
  await once(server, 'listening');

  const address = server.address();
  return {
    app,
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

function signCmsWebhookPayload(payload, secret = CMS_WEBHOOK_SECRET) {
  return `sha256=${createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')}`;
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

test('docs completion Test 1: state names are consistent between architecture and API contracts', () => {
  const architecture = readRepoFile('docs/plan/10-architecture.md');
  const apiContract = readRepoFile('docs/plan/30-api.md');

  const architectureStates = listSectionStatesFromArchitecture(architecture);
  const apiStates = listReviewStateUnionFromApi(apiContract);
  assert.deepEqual(new Set(apiStates), new Set(architectureStates));
});

test('docs completion Test 2: locked decisions are represented in concrete contracts', () => {
  const summary = readRepoFile('docs/plan/00-summary.md');
  const dataModel = readRepoFile('docs/plan/20-data-model.md');
  const apiContract = readRepoFile('docs/plan/30-api.md');
  const copySystem = readRepoFile('docs/plan/60-copy-system.md');

  mustContain(summary, 'Composition engine outputs exactly 3 curated variants.');
  mustContain(apiContract, 'Exactly three variants must always be returned.');
  mustContain(copySystem, 'Exactly three candidates (`A/B/C`) per high-impact slot and locale.');
  mustContain(dataModel, 'competitorCount: number; // minimum 15');
});

test('docs completion Test 3: quality and security gates define blocking semantics and reasons', () => {
  const qualityStart = readRepoFile('docs/quality/00_START_HERE.md');
  const securityGate = readRepoFile('docs/security/RELEASE_SECURITY_GATE.md');

  mustContain(qualityStart, 'Publish is blocked on any `P0` quality failure.');
  mustContain(securityGate, 'Block publish if any unresolved finding has severity:');
  mustContain(securityGate, '`security_blocked_critical`');
  mustContain(securityGate, '`security_blocked_high`');
});

test('docs completion Test 4/5/6: component, copy, and research contracts are explicit', () => {
  const components = readRepoFile('docs/plan/50-component-contracts.md');
  const copySystem = readRepoFile('docs/plan/60-copy-system.md');
  const research = readRepoFile('docs/plan/70-vertical-research-standard.md');

  mustContain(components, 'type ComponentContract = {');
  mustContain(components, 'fallbackPolicy');
  mustContain(copySystem, '| `hero.h1` | hero | 80 | 2 | cs-CZ,en-US |');
  mustContain(copySystem, 'maxChars');
  mustContain(copySystem, 'maxLines');
  mustContain(research, 'Minimum competitor sample: `15` domains.');
  mustContain(research, 'IA patterns.');
  mustContain(research, 'CTA patterns.');
  mustContain(research, 'Trust signal patterns.');
  mustContain(research, 'Tone and messaging pattern classes.');
});

test('docs completion Test 7/8: rollout checklists and status tracking files are present and aligned', () => {
  const rollout = readRepoFile('docs/plan/40-rollout.md');
  const projectState = readRepoFile('docs/status/PROJECT_STATE.md');
  const backlog = readRepoFile('docs/status/BACKLOG.md');
  const sessionLog = readRepoFile('docs/status/SESSION_LOG.md');

  for (const ws of ['WS-A', 'WS-B', 'WS-C', 'WS-D', 'WS-E', 'WS-F', 'WS-G']) {
    mustContain(rollout, `## ${ws}`);
    mustContain(rollout, 'Signoff owners:');
    mustContain(rollout, '- [ ]');
  }

  mustContain(projectState, '## In Progress');
  mustContain(backlog, 'VS3-IMP-011');
  mustContain(sessionLog, 'documentation-revision-vertical-orchestrator');
});

test('WS-G contract: secret rotation runbook and audit trail path are documented', () => {
  const securityReadme = readRepoFile('docs/security/README.md');
  const runbook = readRepoFile('docs/security/SECRET_ROTATION_RUNBOOK.md');
  const rollout = readRepoFile('docs/plan/40-rollout.md');

  mustContain(securityReadme, 'SECRET_ROTATION_RUNBOOK.md');
  mustContain(rollout, 'rotation runbook and audit trail are present');
  mustContain(runbook, 'tenant.<slug>.<provider>.<key>');
  mustContain(runbook, 'internal_admin');
  mustContain(runbook, 'GET /api/v1/audit/events');
  mustContain(runbook, 'Never store plaintext secret values in app tables.');
});

test('WS-A contract: API error envelope includes code, message, requestId, and details object', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const requestId = 'docs-envelope-not-found';
    const response = await fetch(`${baseUrl}/api/v1/unknown-endpoint`, {
      headers: { 'x-request-id': requestId }
    });
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.code, 'not_found');
    assert.equal(typeof payload.message, 'string');
    assert.equal(payload.requestId, requestId);
    assert.deepEqual(payload.details, {});
  } finally {
    await stopServer(server);
  }
});

test('WS-C contract: cms publish webhook requires a valid signature and enqueues an audited job', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const payload = {
      siteId: 'site-wsc-webhook',
      event: 'publish_requested'
    };

    const missingSignatureRes = await fetch(`${baseUrl}/api/v1/cms/webhooks/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(missingSignatureRes.status, 401);

    const validRes = await fetch(`${baseUrl}/api/v1/cms/webhooks/publish`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': signCmsWebhookPayload(payload)
      },
      body: JSON.stringify(payload)
    });
    assert.equal(validRes.status, 202);
    const validBody = await validRes.json();
    assert.equal(validBody.status, 'queued');

    const auditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=cms_publish_webhook_queued&siteId=site-wsc-webhook&limit=10`,
      { headers: { 'x-user-role': 'internal_admin' } }
    );
    assert.equal(auditRes.status, 200);
    const auditPayload = await auditRes.json();
    assert.equal(auditPayload.count >= 1, true);
  } finally {
    await stopServer(server);
  }
});

test('WS-C contract: cms publish webhook rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const payload = {
      siteId: 'site-wsc-webhook-unknown',
      event: 'publish_requested',
      dryRun: true
    };

    const response = await fetch(`${baseUrl}/api/v1/cms/webhooks/publish`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': signCmsWebhookPayload(payload)
      },
      body: JSON.stringify(payload)
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.code, 'validation_error');
    assert.deepEqual(body.details.unknownFields, ['dryRun']);
  } finally {
    await stopServer(server);
  }
});

test('WS-G contract: secret refs endpoint rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/secrets/refs`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        tenantId: 'tenant-wsg-secret-unknown',
        tenantSlug: 'tenant-wsg-secret-unknown',
        ref: 'tenant.tenant-wsg-secret-unknown.openai.api',
        provider: 'openai',
        key: 'api',
        rotationWindowDays: 30
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.deepEqual(payload.details.unknownFields, ['rotationWindowDays']);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: non-public read endpoints require tenant-member or internal_admin role', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const publishRes = await fetch(`${baseUrl}/api/v1/sites/site-wsb-auth/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-auth-1',
        proposalId: 'proposal-wsb-auth-1'
      })
    });
    assert.equal(publishRes.status, 200);

    const qualityForbiddenRes = await fetch(`${baseUrl}/api/v1/sites/site-wsb-auth/quality/latest`);
    assert.equal(qualityForbiddenRes.status, 403);

    const qualityAllowedRes = await fetch(`${baseUrl}/api/v1/sites/site-wsb-auth/quality/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(qualityAllowedRes.status, 200);

    const contractsForbiddenRes = await fetch(`${baseUrl}/api/v1/component-contracts`);
    assert.equal(contractsForbiddenRes.status, 403);

    const contractsAllowedRes = await fetch(`${baseUrl}/api/v1/component-contracts`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(contractsAllowedRes.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: tenant create rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/tenants`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        tenantId: 'tenant-wsb-unknown-fields',
        name: 'Tenant WSB Unknown',
        provisioningMode: 'manual'
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.deepEqual(payload.details.unknownFields, ['provisioningMode']);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: bootstrap-from-extraction rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap-unknown/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-unknown-1',
        previewOnly: true
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.deepEqual(payload.details.unknownFields, ['previewOnly']);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: bootstrap-from-extraction requires extractedFields array type when provided', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap-shape/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-shape-1',
        extractedFields: 'not-an-array'
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'extractedFields must be an array when provided');
    assert.equal(payload.details.invalidField, 'extractedFields');
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: bootstrap-from-extraction requires lowConfidence boolean type when provided', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap-shape/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-shape-2',
        lowConfidence: 'true'
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'lowConfidence must be a boolean when provided');
    assert.equal(payload.details.invalidField, 'lowConfidence');
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: bootstrap-from-extraction requires sitePolicy object type when provided', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap-shape/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-shape-3',
        sitePolicy: 'not-an-object'
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'sitePolicy must be an object when provided');
    assert.equal(payload.details.invalidField, 'sitePolicy');
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: bootstrap-from-extraction rejects unknown nested sitePolicy fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap-shape/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-shape-4',
        sitePolicy: {
          allowOwnerDraftCopyEdits: true,
          policyVersion: 'v1'
        }
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'sitePolicy contains unknown fields');
    assert.equal(payload.details.invalidField, 'sitePolicy');
    assert.deepEqual(payload.details.unknownFields, ['policyVersion']);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: bootstrap-from-extraction requires object items inside extractedFields array', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap-shape/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-shape-5',
        extractedFields: [null, 'invalid-item', { fieldPath: 'brand.tagline' }]
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'extractedFields must contain only object items');
    assert.equal(payload.details.invalidField, 'extractedFields');
    assert.deepEqual(payload.details.invalidItemIndexes, [0, 1]);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: bootstrap-from-extraction rejects unknown nested extractedFields item keys', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap-shape/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-shape-6',
        extractedFields: [
          {
            fieldPath: 'brand.tagline',
            value: 'Premium development team',
            sourceUrl: 'https://example.test/about',
            method: 'dom',
            confidence: 0.91,
            legacyConfidence: 91
          }
        ]
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'extractedFields items contain unknown fields');
    assert.equal(payload.details.invalidField, 'extractedFields');
    assert.deepEqual(payload.details.invalidItemFields, [{ index: 0, unknownFields: ['legacyConfidence'] }]);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: bootstrap-from-extraction enforces non-empty fieldPath type when provided', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap-shape/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-shape-7',
        extractedFields: [
          {
            fieldPath: '   ',
            value: 'Premium development team',
            sourceUrl: 'https://example.test/about',
            method: 'dom',
            confidence: 0.91
          }
        ]
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'extractedFields.fieldPath must be a non-empty string when provided');
    assert.equal(payload.details.invalidField, 'extractedFields.fieldPath');
    assert.deepEqual(payload.details.invalidItemIndexes, [0]);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: bootstrap-from-extraction enforces sourceUrl type when provided', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap-shape/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-shape-8',
        extractedFields: [
          {
            fieldPath: 'brand.tagline',
            value: 'Premium development team',
            sourceUrl: '   ',
            method: 'dom',
            confidence: 0.91
          }
        ]
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'extractedFields.sourceUrl must be a non-empty string or null when provided');
    assert.equal(payload.details.invalidField, 'extractedFields.sourceUrl');
    assert.deepEqual(payload.details.invalidItemIndexes, [0]);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: bootstrap-from-extraction enforces method allow-list when provided', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap-shape/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-shape-9',
        extractedFields: [
          {
            fieldPath: 'brand.tagline',
            value: 'Premium development team',
            sourceUrl: 'https://example.test/about',
            method: 'api',
            confidence: 0.91
          }
        ]
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'extractedFields.method must be one of dom, ocr, inference, manual when provided');
    assert.equal(payload.details.invalidField, 'extractedFields.method');
    assert.deepEqual(payload.details.invalidItemIndexes, [0]);
    assert.deepEqual(payload.details.allowedMethods, ['dom', 'inference', 'manual', 'ocr']);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: bootstrap-from-extraction enforces required boolean type when provided', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap-shape/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-shape-10',
        extractedFields: [
          {
            fieldPath: 'brand.tagline',
            value: 'Premium development team',
            sourceUrl: 'https://example.test/about',
            method: 'dom',
            confidence: 0.91,
            required: 'true'
          }
        ]
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'extractedFields.required must be a boolean when provided');
    assert.equal(payload.details.invalidField, 'extractedFields.required');
    assert.deepEqual(payload.details.invalidItemIndexes, [0]);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: bootstrap-from-extraction enforces confidence numeric type when provided', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap-shape/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-shape-11',
        extractedFields: [
          {
            fieldPath: 'brand.tagline',
            value: 'Premium development team',
            sourceUrl: 'https://example.test/about',
            method: 'dom',
            confidence: '0.91',
            required: true
          }
        ]
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'extractedFields.confidence must be a number when provided');
    assert.equal(payload.details.invalidField, 'extractedFields.confidence');
    assert.deepEqual(payload.details.invalidItemIndexes, [0]);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: bootstrap-from-extraction enforces confidence range when provided', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap-shape/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-shape-12',
        extractedFields: [
          {
            fieldPath: 'brand.tagline',
            value: 'Premium development team',
            sourceUrl: 'https://example.test/about',
            method: 'dom',
            confidence: 1.2,
            required: true
          }
        ]
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'extractedFields.confidence must be between 0 and 1 when provided');
    assert.equal(payload.details.invalidField, 'extractedFields.confidence');
    assert.deepEqual(payload.details.invalidItemIndexes, [0]);
    assert.deepEqual(payload.details.allowedRange, [0, 1]);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: bootstrap-from-extraction enforces extractedAt non-empty string type when provided', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap-shape/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-shape-13',
        extractedFields: [
          {
            fieldPath: 'brand.tagline',
            value: 'Premium development team',
            sourceUrl: 'https://example.test/about',
            method: 'dom',
            confidence: 0.91,
            required: true,
            extractedAt: '   '
          }
        ]
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'extractedFields.extractedAt must be a non-empty string when provided');
    assert.equal(payload.details.invalidField, 'extractedFields.extractedAt');
    assert.deepEqual(payload.details.invalidItemIndexes, [0]);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: bootstrap-from-extraction enforces extractedAt ISO-8601 format when provided', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap-shape/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-shape-14',
        extractedFields: [
          {
            fieldPath: 'brand.tagline',
            value: 'Premium development team',
            sourceUrl: 'https://example.test/about',
            method: 'dom',
            confidence: 0.91,
            required: true,
            extractedAt: '2026/02/28 10:00:00'
          }
        ]
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'extractedFields.extractedAt must be an ISO-8601 datetime string when provided');
    assert.equal(payload.details.invalidField, 'extractedFields.extractedAt');
    assert.deepEqual(payload.details.invalidItemIndexes, [0]);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: vertical research build rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings'],
        crawlDepth: 2
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.deepEqual(payload.details.unknownFields, ['crawlDepth']);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: vertical research build requires numeric targetCompetitorCount type', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: '15',
        sources: ['public_web', 'legal_pages', 'selected_listings']
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'insufficient_competitor_sample');
    assert.equal(payload.message, 'targetCompetitorCount must be >= 15');
    assert.deepEqual(payload.details, {
      minimumTargetCompetitorCount: 15,
      receivedTargetCompetitorCount: '15'
    });

    const minimumResponse = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 14,
        sources: ['public_web', 'legal_pages', 'selected_listings']
      })
    });
    assert.equal(minimumResponse.status, 400);
    const minimumPayload = await minimumResponse.json();
    assert.equal(minimumPayload.code, 'insufficient_competitor_sample');
    assert.equal(minimumPayload.message, 'targetCompetitorCount must be >= 15');
    assert.deepEqual(minimumPayload.details, {
      minimumTargetCompetitorCount: 15,
      receivedTargetCompetitorCount: 14
    });
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: vertical research build enforces supported source classes', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const nonArrayResponse = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: 'public_web'
      })
    });
    assert.equal(nonArrayResponse.status, 400);
    const nonArrayPayload = await nonArrayResponse.json();
    assert.equal(nonArrayPayload.code, 'validation_error');
    assert.equal(nonArrayPayload.message, 'sources must be an array when provided');
    assert.equal(nonArrayPayload.details.invalidField, 'sources');

    const response = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'community_forums']
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'sources must use allowed research classes');
    assert.deepEqual(payload.details.invalidSources, ['community_forums']);
    assert.deepEqual(payload.details.allowedSources, ['legal_pages', 'public_web', 'selected_listings']);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: vertical research build rejects duplicate source classes', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'public_web']
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'sources must not contain duplicate values');
    assert.deepEqual(payload.details.duplicateSources, ['public_web']);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: vertical research build validates and normalizes sourceDomains', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const nonArrayResponse = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings'],
        sourceDomains: 'example-1.com'
      })
    });
    assert.equal(nonArrayResponse.status, 400);
    const nonArrayPayload = await nonArrayResponse.json();
    assert.equal(nonArrayPayload.code, 'validation_error');
    assert.equal(nonArrayPayload.message, 'sourceDomains must be an array when provided');
    assert.equal(nonArrayPayload.details.invalidField, 'sourceDomains');

    const invalidResponse = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings'],
        sourceDomains: ['example-1.com', '', 123]
      })
    });
    assert.equal(invalidResponse.status, 400);
    const invalidPayload = await invalidResponse.json();
    assert.equal(invalidPayload.code, 'validation_error');
    assert.equal(invalidPayload.message, 'sourceDomains must contain valid domain hostnames when provided');
    assert.deepEqual(invalidPayload.details.invalidSourceDomains, ['', 123]);

    const malformedResponse = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings'],
        sourceDomains: ['https://example-1.com', 'example']
      })
    });
    assert.equal(malformedResponse.status, 400);
    const malformedPayload = await malformedResponse.json();
    assert.equal(malformedPayload.code, 'validation_error');
    assert.equal(malformedPayload.message, 'sourceDomains must contain valid domain hostnames when provided');
    assert.deepEqual(malformedPayload.details.invalidSourceDomains, ['https://example-1.com', 'example']);

    const duplicateResponse = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings'],
        sourceDomains: [' EXAMPLE-1.com ', 'example-1.com']
      })
    });
    assert.equal(duplicateResponse.status, 400);
    const duplicatePayload = await duplicateResponse.json();
    assert.equal(duplicatePayload.code, 'validation_error');
    assert.equal(duplicatePayload.message, 'sourceDomains must not contain duplicate values');
    assert.deepEqual(duplicatePayload.details.duplicateSourceDomains, ['example-1.com']);

    const validResponse = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings'],
        sourceDomains: [' EXAMPLE-1.com ', 'example-2.com']
      })
    });
    assert.equal(validResponse.status, 202);

    const latestResponse = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(latestResponse.status, 200);
    const latestPayload = await latestResponse.json();
    assert.deepEqual(latestPayload.sourceDomains, ['example-1.com', 'example-2.com']);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: low-confidence required extraction fields are stored as TODO and mark draft lowConfidence', async () => {
  const { app, server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsb-bootstrap/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsb-bootstrap-1',
        extractedFields: [
          {
            fieldPath: 'meta.companyName',
            value: 'Studio One',
            sourceUrl: 'https://example.test',
            method: 'dom',
            confidence: 0.95,
            required: true
          },
          {
            fieldPath: 'contact.email',
            value: 'hello@example.test',
            sourceUrl: 'https://example.test/contact',
            method: 'dom',
            confidence: 0.33,
            required: true
          }
        ]
      })
    });
    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.equal(payload.lowConfidence, true);
    assert.equal(payload.requiredTodoCount, 1);

    const storedFields = app.locals.v3State.extractedFieldsByDraft.get('draft-wsb-bootstrap-1');
    assert.equal(Array.isArray(storedFields), true);
    assert.equal(storedFields.length, 2);
    const todoField = storedFields.find((field) => field.fieldPath === 'contact.email');
    assert.equal(todoField.todo, true);
    assert.equal(todoField.value, null);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: owner copy selection is blocked unless site policy allows draft copy edits', async () => {
  const { app, server, baseUrl } = await startServer();

  try {
    const siteId = 'site-wsb-owner-copy';
    const draftId = 'draft-wsb-owner-copy';

    const generateRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(generateRes.status, 200);

    const ownerDeniedRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/select`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-role': 'owner'
      },
      body: JSON.stringify({
        draftId,
        selections: [{ slotId: 'hero.h1', locale: 'cs-CZ', candidateId: `missing-${draftId}` }]
      })
    });
    assert.equal(ownerDeniedRes.status, 403);

    const policySetRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        sitePolicy: {
          allowOwnerDraftCopyEdits: true
        }
      })
    });
    assert.equal(policySetRes.status, 202);

    const ownerAllowedRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/select`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-role': 'owner'
      },
      body: JSON.stringify({
        draftId,
        selections: [
          {
            slotId: app.locals.v3State.copyCandidatesByDraft.get(draftId)[0].slotId,
            locale: app.locals.v3State.copyCandidatesByDraft.get(draftId)[0].locale,
            candidateId: app.locals.v3State.copyCandidatesByDraft.get(draftId)[0].candidateId
          }
        ]
      })
    });
    assert.equal(ownerAllowedRes.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('WS-B contract: publish is blocked when required low-confidence extraction TODOs remain', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const siteId = 'site-wsb-low-confidence-publish';
    const draftId = 'draft-wsb-low-confidence-publish';

    const bootstrapRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        extractedFields: [
          {
            fieldPath: 'contact.phone',
            value: '+420123456789',
            sourceUrl: 'https://example.test/contact',
            method: 'dom',
            confidence: 0.12,
            required: true
          }
        ]
      })
    });
    assert.equal(bootstrapRes.status, 202);

    const publishRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        proposalId: 'proposal-wsb-low-confidence'
      })
    });
    assert.equal(publishRes.status, 409);
    const payload = await publishRes.json();
    assert.equal(payload.code, 'low_confidence_review_required');
    assert.equal(payload.requiredTodoCount, 1);
  } finally {
    await stopServer(server);
  }
});

test('WS-F contract: publish rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const publishRes = await fetch(`${baseUrl}/api/v1/sites/site-wsf-publish-unknown/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsf-publish-unknown-1',
        proposalId: 'proposal-wsf-publish-unknown-1',
        dryRun: true
      })
    });
    assert.equal(publishRes.status, 400);
    const payload = await publishRes.json();
    assert.equal(payload.code, 'validation_error');
    assert.deepEqual(payload.details.unknownFields, ['dryRun']);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: compose requires loaded component contracts for requested catalogVersion', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const missingContractsRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-compose/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-compose-1',
        rulesVersion: '1.0.0',
        catalogVersion: '9.9.9',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(missingContractsRes.status, 404);
    const missingContractsPayload = await missingContractsRes.json();
    assert.equal(missingContractsPayload.code, 'component_contract_not_found');

    const validContractsRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-compose/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-compose-1',
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(validContractsRes.status, 200);
    const validContractsPayload = await validContractsRes.json();
    assert.deepEqual(
      validContractsPayload.variants.map((variant) => variant.variantKey),
      ['A', 'B', 'C']
    );
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: compose rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const unknownFieldRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-compose-unknown/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-compose-unknown-1',
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02',
        promptMode: 'fast'
      })
    });
    assert.equal(unknownFieldRes.status, 400);
    const unknownFieldPayload = await unknownFieldRes.json();
    assert.equal(unknownFieldPayload.code, 'validation_error');
    assert.deepEqual(unknownFieldPayload.details.unknownFields, ['promptMode']);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: compose select rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const siteId = 'site-wsd-compose-select-unknown';
    const draftId = 'draft-wsd-compose-select-unknown-1';
    const proposeRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(proposeRes.status, 200);
    const proposePayload = await proposeRes.json();
    const proposalId = proposePayload.variants[0].proposalId;

    const toReviewRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/review/transition`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        fromState: 'proposal_generated',
        toState: 'review_in_progress',
        event: 'REVIEW_STARTED'
      })
    });
    assert.equal(toReviewRes.status, 200);

    const selectRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/compose/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        proposalId,
        unknownField: true
      })
    });
    assert.equal(selectRes.status, 400);
    const selectPayload = await selectRes.json();
    assert.equal(selectPayload.code, 'validation_error');
    assert.deepEqual(selectPayload.details.unknownFields, ['unknownField']);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: review transition rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsd-review-unknown/review/transition`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-review-unknown-1',
        fromState: 'draft',
        toState: 'proposal_generated',
        event: 'PROPOSALS_READY',
        dryRun: true
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.deepEqual(payload.details.unknownFields, ['dryRun']);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: overrides requiredComponents must reference loaded component contracts', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-wsd-overrides-components';
    const composeRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(composeRes.status, 200);

    const toReviewRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides/review/transition`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        fromState: 'proposal_generated',
        toState: 'review_in_progress',
        event: 'REVIEW_STARTED'
      })
    });
    assert.equal(toReviewRes.status, 200);

    const invalidOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        requiredComponents: ['missing-component']
      })
    });
    assert.equal(invalidOverrideRes.status, 400);
    const invalidOverridePayload = await invalidOverrideRes.json();
    assert.equal(invalidOverridePayload.code, 'invalid_override_payload');
    assert.deepEqual(invalidOverridePayload.details.unknownComponentIds, ['missing-component']);

    const validOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        requiredComponents: ['cards-3up']
      })
    });
    assert.equal(validOverrideRes.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: override section arrays must use allowed section keys', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-wsd-overrides-sections';
    const composeRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-sections/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(composeRes.status, 200);

    const toReviewRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-sections/review/transition`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        fromState: 'proposal_generated',
        toState: 'review_in_progress',
        event: 'REVIEW_STARTED'
      })
    });
    assert.equal(toReviewRes.status, 200);

    const invalidOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-sections/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        excludedSections: ['invalid-section']
      })
    });
    assert.equal(invalidOverrideRes.status, 400);
    const invalidOverridePayload = await invalidOverrideRes.json();
    assert.equal(invalidOverridePayload.code, 'invalid_override_payload');
    assert.equal(invalidOverridePayload.details.field, 'excludedSections');
    assert.deepEqual(invalidOverridePayload.details.unknownSections, ['invalid-section']);

    const validOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-sections/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        requiredSections: ['hero', 'contact'],
        excludedSections: ['timeline'],
        pinnedSections: ['hero']
      })
    });
    assert.equal(validOverrideRes.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: override section directives cannot conflict across arrays', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-wsd-overrides-section-conflicts';
    const composeRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-section-conflicts/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(composeRes.status, 200);

    const toReviewRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-section-conflicts/review/transition`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        fromState: 'proposal_generated',
        toState: 'review_in_progress',
        event: 'REVIEW_STARTED'
      })
    });
    assert.equal(toReviewRes.status, 200);

    const requiredExcludedConflictRes = await fetch(
      `${baseUrl}/api/v1/sites/site-wsd-overrides-section-conflicts/overrides`,
      {
        method: 'POST',
        headers: INTERNAL_ADMIN_HEADERS,
        body: JSON.stringify({
          draftId,
          requiredSections: ['hero'],
          excludedSections: ['hero']
        })
      }
    );
    assert.equal(requiredExcludedConflictRes.status, 400);
    const requiredExcludedConflictPayload = await requiredExcludedConflictRes.json();
    assert.equal(requiredExcludedConflictPayload.code, 'invalid_override_payload');

    const pinnedExcludedConflictRes = await fetch(
      `${baseUrl}/api/v1/sites/site-wsd-overrides-section-conflicts/overrides`,
      {
        method: 'POST',
        headers: INTERNAL_ADMIN_HEADERS,
        body: JSON.stringify({
          draftId,
          pinnedSections: ['contact'],
          excludedSections: ['contact']
        })
      }
    );
    assert.equal(pinnedExcludedConflictRes.status, 400);
    const pinnedExcludedConflictPayload = await pinnedExcludedConflictRes.json();
    assert.equal(pinnedExcludedConflictPayload.code, 'invalid_override_payload');

    const validOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-section-conflicts/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        requiredSections: ['hero', 'contact'],
        excludedSections: ['timeline'],
        pinnedSections: ['hero']
      })
    });
    assert.equal(validOverrideRes.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: override arrays must not contain duplicate values', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-wsd-overrides-duplicates';
    const composeRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-duplicates/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(composeRes.status, 200);

    const toReviewRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-duplicates/review/transition`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        fromState: 'proposal_generated',
        toState: 'review_in_progress',
        event: 'REVIEW_STARTED'
      })
    });
    assert.equal(toReviewRes.status, 200);

    const duplicateOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-duplicates/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        requiredComponents: ['cards-3up', 'cards-3up']
      })
    });
    assert.equal(duplicateOverrideRes.status, 400);
    const duplicateOverridePayload = await duplicateOverrideRes.json();
    assert.equal(duplicateOverridePayload.code, 'invalid_override_payload');
    assert.equal(duplicateOverridePayload.details.field, 'requiredComponents');
    assert.deepEqual(duplicateOverridePayload.details.duplicateValues, ['cards-3up']);

    const validOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-duplicates/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        requiredComponents: ['cards-3up'],
        keywords: ['trust', 'delivery']
      })
    });
    assert.equal(validOverrideRes.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: overrides require at least one non-empty directive array', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-wsd-overrides-non-empty';
    const composeRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-non-empty/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(composeRes.status, 200);

    const toReviewRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-non-empty/review/transition`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        fromState: 'proposal_generated',
        toState: 'review_in_progress',
        event: 'REVIEW_STARTED'
      })
    });
    assert.equal(toReviewRes.status, 200);

    const emptyOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-non-empty/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId
      })
    });
    assert.equal(emptyOverrideRes.status, 400);
    const emptyOverridePayload = await emptyOverrideRes.json();
    assert.equal(emptyOverridePayload.code, 'invalid_override_payload');

    const emptyArraysRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-non-empty/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        requiredSections: []
      })
    });
    assert.equal(emptyArraysRes.status, 400);

    const validOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-non-empty/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        requiredSections: ['hero']
      })
    });
    assert.equal(validOverrideRes.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: override string arrays reject blanks and persist trimmed values', async () => {
  const { app, server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-wsd-overrides-string-normalization';
    const composeRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-string-normalization/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(composeRes.status, 200);

    const toReviewRes = await fetch(
      `${baseUrl}/api/v1/sites/site-wsd-overrides-string-normalization/review/transition`,
      {
        method: 'POST',
        headers: INTERNAL_ADMIN_HEADERS,
        body: JSON.stringify({
          draftId,
          fromState: 'proposal_generated',
          toState: 'review_in_progress',
          event: 'REVIEW_STARTED'
        })
      }
    );
    assert.equal(toReviewRes.status, 200);

    const blankValueRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-string-normalization/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        keywords: ['trust', '']
      })
    });
    assert.equal(blankValueRes.status, 400);
    const blankValuePayload = await blankValueRes.json();
    assert.equal(blankValuePayload.code, 'invalid_override_payload');

    const storedOverrideRes = await fetch(
      `${baseUrl}/api/v1/sites/site-wsd-overrides-string-normalization/overrides`,
      {
        method: 'POST',
        headers: INTERNAL_ADMIN_HEADERS,
        body: JSON.stringify({
          draftId,
          keywords: [' trust ', 'delivery'],
          tone: [' calm ']
        })
      }
    );
    assert.equal(storedOverrideRes.status, 200);
    const storedOverrides = app.locals.v3State.overridesByDraft.get(draftId);
    assert.deepEqual(storedOverrides.keywords, ['trust', 'delivery']);
    assert.deepEqual(storedOverrides.tone, ['calm']);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: override payload rejects unknown top-level fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-wsd-overrides-unknown-fields';
    const composeRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-unknown-fields/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(composeRes.status, 200);

    const toReviewRes = await fetch(
      `${baseUrl}/api/v1/sites/site-wsd-overrides-unknown-fields/review/transition`,
      {
        method: 'POST',
        headers: INTERNAL_ADMIN_HEADERS,
        body: JSON.stringify({
          draftId,
          fromState: 'proposal_generated',
          toState: 'review_in_progress',
          event: 'REVIEW_STARTED'
        })
      }
    );
    assert.equal(toReviewRes.status, 200);

    const invalidOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-overrides-unknown-fields/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        tone: ['credible'],
        unexpectedField: ['x']
      })
    });
    assert.equal(invalidOverrideRes.status, 400);
    const invalidOverridePayload = await invalidOverrideRes.json();
    assert.equal(invalidOverridePayload.code, 'invalid_override_payload');
    assert.deepEqual(invalidOverridePayload.details.unknownFields, ['unexpectedField']);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy generation rejects unsupported high-impact variant modes', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const invalidModeRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-copy/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-copy-1',
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02',
        highImpactOnlyThreeVariants: false
      })
    });
    assert.equal(invalidModeRes.status, 400);
    const invalidMode = await invalidModeRes.json();
    assert.equal(invalidMode.code, 'validation_error');
    assert.equal(invalidMode.details.invalidField, 'highImpactOnlyThreeVariants');

    const validModeRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-copy/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-copy-1',
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02',
        highImpactOnlyThreeVariants: true
      })
    });
    assert.equal(validModeRes.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy generation accepts only supported locales and rejects duplicates', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const nonArrayLocalesRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-locales/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-locales-1',
        locales: 'cs-CZ,en-US',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(nonArrayLocalesRes.status, 400);
    const nonArrayLocalesPayload = await nonArrayLocalesRes.json();
    assert.equal(nonArrayLocalesPayload.code, 'validation_error');
    assert.equal(nonArrayLocalesPayload.message, 'locales must be an array when provided');
    assert.equal(nonArrayLocalesPayload.details.invalidField, 'locales');

    const nonStringLocalesRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-locales/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-locales-1',
        locales: ['cs-CZ', 42, 'en-US'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(nonStringLocalesRes.status, 400);
    const nonStringLocalesPayload = await nonStringLocalesRes.json();
    assert.equal(nonStringLocalesPayload.code, 'validation_error');
    assert.equal(nonStringLocalesPayload.message, 'locales must contain only string items');
    assert.equal(nonStringLocalesPayload.details.invalidField, 'locales');
    assert.deepEqual(nonStringLocalesPayload.details.invalidItemIndexes, [1]);

    const invalidLocaleRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-locales/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-locales-1',
        locales: ['cs-CZ', 'en-US', 'de-DE'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(invalidLocaleRes.status, 400);
    const invalidLocalePayload = await invalidLocaleRes.json();
    assert.equal(invalidLocalePayload.code, 'validation_error');
    assert.equal(invalidLocalePayload.details.invalidField, 'locales');
    assert.deepEqual(invalidLocalePayload.details.unsupportedLocales, ['de-DE']);

    const missingLocaleRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-locales/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-locales-1',
        locales: ['cs-CZ'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(missingLocaleRes.status, 400);
    const missingLocalePayload = await missingLocaleRes.json();
    assert.equal(missingLocalePayload.code, 'validation_error');
    assert.equal(missingLocalePayload.message, 'locales must include cs-CZ and en-US');
    assert.equal(missingLocalePayload.details.invalidField, 'locales');
    assert.deepEqual(missingLocalePayload.details.missingLocales, ['en-US']);

    const duplicateLocaleRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-locales/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-locales-1',
        locales: ['cs-CZ', 'en-US', 'cs-CZ'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(duplicateLocaleRes.status, 400);
    const duplicateLocalePayload = await duplicateLocaleRes.json();
    assert.equal(duplicateLocalePayload.code, 'validation_error');
    assert.equal(duplicateLocalePayload.message, 'locales must not contain duplicate values');
    assert.equal(duplicateLocalePayload.details.invalidField, 'locales');
    assert.deepEqual(duplicateLocalePayload.details.duplicateLocales, ['cs-CZ']);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy generation requires verticalStandardVersion', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const missingVersionRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-version/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-version-1',
        locales: ['cs-CZ', 'en-US']
      })
    });
    assert.equal(missingVersionRes.status, 400);
    const missingVersionPayload = await missingVersionRes.json();
    assert.equal(missingVersionPayload.code, 'validation_error');
    assert.equal(missingVersionPayload.message, 'verticalStandardVersion is required');
    assert.equal(missingVersionPayload.details.invalidField, 'verticalStandardVersion');
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy generation rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const unknownFieldRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-copy-generate-unknown/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-copy-generate-unknown-1',
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02',
        promptMode: 'fast'
      })
    });
    assert.equal(unknownFieldRes.status, 400);
    const unknownFieldPayload = await unknownFieldRes.json();
    assert.equal(unknownFieldPayload.code, 'validation_error');
    assert.deepEqual(unknownFieldPayload.details.unknownFields, ['promptMode']);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy selection missing-candidate errors expose deterministic tuple and selection-index details', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsd-select-missing-candidate/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-select-missing-candidate-1',
        selections: [{ slotId: 'hero.h1', locale: 'cs-CZ', candidateId: 'candidate-missing-1' }]
      })
    });
    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.code, 'copy_candidate_not_found');
    assert.equal(payload.message, 'copy candidate not found');
    assert.equal(payload.details.invalidField, 'selections');
    assert.equal(payload.details.selectionIndex, 0);
    assert.equal(payload.details.candidateId, 'candidate-missing-1');
    assert.equal(payload.details.requestedSlotId, 'hero.h1');
    assert.equal(payload.details.requestedLocale, 'cs-CZ');
    assert.equal(payload.details.slotId, 'hero.h1');
    assert.equal(payload.details.locale, 'cs-CZ');
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy selection mismatch errors expose deterministic candidate tuple comparison and selection-index details', async () => {
  const { app, server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-wsd-select-mismatch-1';
    const generateRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-select-mismatch/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(generateRes.status, 200);
    const candidate = app.locals.v3State.copyCandidatesByDraft
      .get(draftId)
      .find((entry) => entry.slotId === 'hero.h1' && entry.locale === 'cs-CZ' && entry.variantKey === 'B');
    assert.equal(Boolean(candidate), true);

    const mismatchRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-select-mismatch/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        selections: [{ slotId: 'about.intro', locale: 'en-US', candidateId: candidate.candidateId }]
      })
    });
    assert.equal(mismatchRes.status, 400);
    const mismatchPayload = await mismatchRes.json();
    assert.equal(mismatchPayload.code, 'validation_error');
    assert.equal(mismatchPayload.message, 'selection must match candidate slotId and locale');
    assert.equal(mismatchPayload.details.invalidField, 'selections');
    assert.equal(mismatchPayload.details.selectionIndex, 0);
    assert.equal(mismatchPayload.details.candidateId, candidate.candidateId);
    assert.equal(mismatchPayload.details.candidateSlotId, 'hero.h1');
    assert.equal(mismatchPayload.details.candidateLocale, 'cs-CZ');
    assert.equal(mismatchPayload.details.requestedSlotId, 'about.intro');
    assert.equal(mismatchPayload.details.requestedLocale, 'en-US');
    assert.equal(mismatchPayload.details.slotId, 'about.intro');
    assert.equal(mismatchPayload.details.locale, 'en-US');
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy selection enforces unique slot-locale tuples and duplicate-index details', async () => {
  const { app, server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-wsd-select-unique-1';
    const generateRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-select-unique/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(generateRes.status, 200);
    const generatedCandidates = app.locals.v3State.copyCandidatesByDraft.get(draftId);
    const candidateA = generatedCandidates.find(
      (candidate) => candidate.slotId === 'hero.h1' && candidate.locale === 'cs-CZ' && candidate.variantKey === 'A'
    );
    const candidateB = generatedCandidates.find(
      (candidate) => candidate.slotId === 'hero.h1' && candidate.locale === 'cs-CZ' && candidate.variantKey === 'B'
    );
    assert.equal(Boolean(candidateA), true);
    assert.equal(Boolean(candidateB), true);

    const duplicateRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-select-unique/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        selections: [
          { slotId: 'hero.h1', locale: 'cs-CZ', candidateId: candidateA.candidateId },
          { slotId: 'hero.h1', locale: 'cs-CZ', candidateId: candidateB.candidateId }
        ]
      })
    });
    assert.equal(duplicateRes.status, 400);
    const duplicatePayload = await duplicateRes.json();
    assert.equal(duplicatePayload.code, 'validation_error');
    assert.equal(duplicatePayload.message, 'selection tuple must be unique per slotId and locale');
    assert.equal(duplicatePayload.details.invalidField, 'selections');
    assert.equal(duplicatePayload.details.firstSelectionIndex, 0);
    assert.equal(duplicatePayload.details.duplicateSelectionIndex, 1);
    assert.equal(duplicatePayload.details.slotId, 'hero.h1');
    assert.equal(duplicatePayload.details.locale, 'cs-CZ');
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy selection rejects empty selection arrays with deterministic cardinality metadata', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const emptySelectRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-select-empty/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-select-empty-1',
        selections: []
      })
    });
    assert.equal(emptySelectRes.status, 400);
    const emptySelectPayload = await emptySelectRes.json();
    assert.equal(emptySelectPayload.code, 'validation_error');
    assert.equal(emptySelectPayload.message, 'selections array must contain at least one item');
    assert.equal(emptySelectPayload.details.invalidField, 'selections');
    assert.equal(emptySelectPayload.details.minimumSelections, 1);
    assert.equal(emptySelectPayload.details.receivedSelections, 0);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy selection requires selections array with deterministic type metadata details', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const missingSelectionsRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-select-required/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-select-required-1'
      })
    });
    assert.equal(missingSelectionsRes.status, 400);
    const missingSelectionsPayload = await missingSelectionsRes.json();
    assert.equal(missingSelectionsPayload.code, 'validation_error');
    assert.equal(missingSelectionsPayload.message, 'selections array is required');
    assert.equal(missingSelectionsPayload.details.invalidField, 'selections');
    assert.equal(missingSelectionsPayload.details.expectedType, 'array');
    assert.equal(missingSelectionsPayload.details.receivedType, 'undefined');

    const nonArraySelectionsRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-select-required/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-select-required-1',
        selections: 'hero.h1'
      })
    });
    assert.equal(nonArraySelectionsRes.status, 400);
    const nonArraySelectionsPayload = await nonArraySelectionsRes.json();
    assert.equal(nonArraySelectionsPayload.code, 'validation_error');
    assert.equal(nonArraySelectionsPayload.message, 'selections array is required');
    assert.equal(nonArraySelectionsPayload.details.invalidField, 'selections');
    assert.equal(nonArraySelectionsPayload.details.expectedType, 'array');
    assert.equal(nonArraySelectionsPayload.details.receivedType, 'string');
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy selection requires draftId with deterministic type metadata details', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const missingDraftIdRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-select-draft-id/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        selections: [{ slotId: 'hero.h1', locale: 'cs-CZ', candidateId: 'candidate-1' }]
      })
    });
    assert.equal(missingDraftIdRes.status, 400);
    const missingDraftIdPayload = await missingDraftIdRes.json();
    assert.equal(missingDraftIdPayload.code, 'validation_error');
    assert.equal(missingDraftIdPayload.message, 'draftId is required');
    assert.equal(missingDraftIdPayload.details.invalidField, 'draftId');
    assert.equal(missingDraftIdPayload.details.expectedType, 'string');
    assert.equal(missingDraftIdPayload.details.receivedType, 'undefined');

    const nonStringDraftIdRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-select-draft-id/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 123,
        selections: [{ slotId: 'hero.h1', locale: 'cs-CZ', candidateId: 'candidate-1' }]
      })
    });
    assert.equal(nonStringDraftIdRes.status, 400);
    const nonStringDraftIdPayload = await nonStringDraftIdRes.json();
    assert.equal(nonStringDraftIdPayload.code, 'validation_error');
    assert.equal(nonStringDraftIdPayload.message, 'draftId is required');
    assert.equal(nonStringDraftIdPayload.details.invalidField, 'draftId');
    assert.equal(nonStringDraftIdPayload.details.expectedType, 'string');
    assert.equal(nonStringDraftIdPayload.details.receivedType, 'number');
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy selection selectedBy mismatch exposes deterministic selection-index and role-metadata details', async () => {
  const { app, server, baseUrl } = await startServer();

  try {
    const siteId = 'site-wsd-selected-by';
    const draftId = 'draft-wsd-selected-by-1';
    const generateRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(generateRes.status, 200);
    const candidateId = app.locals.v3State.copyCandidatesByDraft.get(draftId)[0].candidateId;

    const mismatchRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        selections: [{ slotId: 'hero.h1', locale: 'cs-CZ', candidateId, selectedBy: 'owner' }]
      })
    });
    assert.equal(mismatchRes.status, 400);
    const mismatchPayload = await mismatchRes.json();
    assert.equal(mismatchPayload.code, 'validation_error');
    assert.equal(mismatchPayload.message, 'selection selectedBy must match authenticated actor role');
    assert.equal(mismatchPayload.details.invalidField, 'selections');
    assert.equal(mismatchPayload.details.selectionIndex, 0);
    assert.equal(mismatchPayload.details.expectedSelectedBy, 'internal_admin');
    assert.equal(mismatchPayload.details.receivedSelectedBy, 'owner');

    const matchingRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        selections: [{ slotId: 'hero.h1', locale: 'cs-CZ', candidateId, selectedBy: 'internal_admin' }]
      })
    });
    assert.equal(matchingRes.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy selection rejects unknown payload fields', async () => {
  const { app, server, baseUrl } = await startServer();

  try {
    const siteId = 'site-wsd-select-unknown-fields';
    const draftId = 'draft-wsd-select-unknown-fields-1';
    const generateRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(generateRes.status, 200);
    const candidateId = app.locals.v3State.copyCandidatesByDraft.get(draftId)[0].candidateId;

    const unknownTopLevelRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        selections: [{ slotId: 'hero.h1', locale: 'cs-CZ', candidateId }],
        zetaField: true,
        alphaField: true
      })
    });
    assert.equal(unknownTopLevelRes.status, 400);
    const unknownTopLevelPayload = await unknownTopLevelRes.json();
    assert.equal(unknownTopLevelPayload.code, 'validation_error');
    assert.equal(unknownTopLevelPayload.details.invalidField, 'payload');
    assert.deepEqual(unknownTopLevelPayload.details.unknownFields, ['alphaField', 'zetaField']);
    assert.deepEqual(unknownTopLevelPayload.details.allowedTopLevelFields, [
      'actorRole',
      'draftId',
      'selections',
    ]);

    const unknownSelectionFieldRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        selections: [
          {
            slotId: 'hero.h1',
            locale: 'cs-CZ',
            candidateId,
            zetaNote: 'unexpected',
            alphaNote: 'unexpected'
          }
        ]
      })
    });
    assert.equal(unknownSelectionFieldRes.status, 400);
    const unknownSelectionFieldPayload = await unknownSelectionFieldRes.json();
    assert.equal(unknownSelectionFieldPayload.code, 'validation_error');
    assert.equal(unknownSelectionFieldPayload.details.invalidField, 'selections[0]');
    assert.equal(unknownSelectionFieldPayload.details.selectionIndex, 0);
    assert.deepEqual(unknownSelectionFieldPayload.details.unknownFields, ['alphaNote', 'zetaNote']);
    assert.deepEqual(unknownSelectionFieldPayload.details.allowedSelectionFields, [
      'candidateId',
      'locale',
      'selectedBy',
      'slotId'
    ]);
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy selection per-item validation failures report invalidField and selection-index details', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const siteId = 'site-wsd-select-item-errors';
    const draftId = 'draft-wsd-select-item-errors-1';
    const assertInvalidSelectionField = async (selections, message, invalidField, extraDetails) => {
      const response = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/select`, {
        method: 'POST',
        headers: INTERNAL_ADMIN_HEADERS,
        body: JSON.stringify({
          draftId,
          selections
        })
      });
      assert.equal(response.status, 400);
      const payload = await response.json();
      assert.equal(payload.code, 'validation_error');
      assert.equal(payload.message, message);
      assert.equal(payload.details.invalidField, invalidField);
      assert.equal(payload.details.selectionIndex, 0);
      if (extraDetails) {
        assert.deepEqual(extraDetails(payload.details), true);
      }
    };

    await assertInvalidSelectionField(
      [null],
      'selection item must be an object',
      'selections[0]',
      (details) => details.expectedType === 'object' && details.receivedType === 'null'
    );
    await assertInvalidSelectionField(
      [{ slotId: '', locale: 'cs-CZ', candidateId: 'candidate-1' }],
      'selection slotId is required',
      'selections[0].slotId',
      (details) => details.expectedType === 'string' && details.receivedType === 'string'
    );
    await assertInvalidSelectionField(
      [{ slotId: 'hero.h1', locale: 'de-DE', candidateId: 'candidate-1' }],
      'selection locale must be one of cs-CZ or en-US',
      'selections[0].locale',
      (details) =>
        Array.isArray(details.allowedLocales) &&
        details.allowedLocales.length === 2 &&
        details.allowedLocales[0] === 'cs-CZ' &&
        details.allowedLocales[1] === 'en-US'
    );
    await assertInvalidSelectionField(
      [{ slotId: 'hero.h1', locale: 'cs-CZ', candidateId: '' }],
      'selection candidateId is required',
      'selections[0].candidateId'
    );
    await assertInvalidSelectionField(
      [{ slotId: 'hero.h1', locale: 'cs-CZ', candidateId: 'candidate-1', selectedBy: 'editor' }],
      'selection selectedBy must be one of internal_admin or owner',
      'selections[0].selectedBy',
      (details) =>
        Array.isArray(details.allowedSelectedByRoles) &&
        details.allowedSelectedByRoles.length === 2 &&
        details.allowedSelectedByRoles[0] === 'internal_admin' &&
        details.allowedSelectedByRoles[1] === 'owner'
    );
  } finally {
    await stopServer(server);
  }
});

test('acceptance scenario 4.1: bounded copy generation enforces candidate policy and limits', async () => {
  const { app, server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-acceptance/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-copy-1',
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02'
      })
    });

    assert.equal(response.status, 200);
    const summary = await response.json();
    assert.deepEqual(summary.candidateCounts, {
      A: 12,
      B: 12,
      C: 12,
      SINGLE: 6
    });

    const candidates = app.locals.v3State.copyCandidatesByDraft.get('draft-copy-1');
    assert.equal(Array.isArray(candidates), true);
    assert.equal(candidates.length > 0, true);
    assert.equal(candidates.every((candidate) => candidate.withinLimits), true);

    const generateAuditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=ops_copy_generated&siteId=site-acceptance&limit=10`,
      { headers: { 'x-user-role': 'internal_admin' } }
    );
    assert.equal(generateAuditRes.status, 200);
    const generateAuditPayload = await generateAuditRes.json();
    assert.equal(generateAuditPayload.count >= 1, true);

    const selectRes = await fetch(`${baseUrl}/api/v1/sites/site-acceptance/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-copy-1',
        selections: [{ slotId: candidates[0].slotId, locale: candidates[0].locale, candidateId: candidates[0].candidateId }]
      })
    });
    assert.equal(selectRes.status, 200);

    const auditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=ops_copy_selected&siteId=site-acceptance&limit=10`,
      { headers: { 'x-user-role': 'internal_admin' } }
    );
    assert.equal(auditRes.status, 200);
    const auditPayload = await auditRes.json();
    assert.equal(auditPayload.count >= 1, true);
  } finally {
    await stopServer(server);
  }
});

test('acceptance scenario 4.2: manual overrides are state-gated, stored, and audit-logged', async () => {
  const { app, server, baseUrl } = await startServer();

  try {
    const proposeRes = await fetch(`${baseUrl}/api/v1/sites/site-acceptance/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-override-1',
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(proposeRes.status, 200);

    const toReviewRes = await fetch(`${baseUrl}/api/v1/sites/site-acceptance/review/transition`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-override-1',
        fromState: 'proposal_generated',
        toState: 'review_in_progress',
        event: 'REVIEW_STARTED'
      })
    });
    assert.equal(toReviewRes.status, 200);

    const overridesRes = await fetch(`${baseUrl}/api/v1/sites/site-acceptance/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-override-1',
        tone: ['credible', 'calm'],
        keywords: ['trust', 'delivery'],
        requiredSections: ['hero', 'contact'],
        excludedSections: ['timeline'],
        pinnedSections: ['hero'],
        requiredComponents: ['cards-3up'],
        excludedCompetitorPatterns: ['aggressive-discount-banner']
      })
    });
    assert.equal(overridesRes.status, 200);

    const reRunComposeRes = await fetch(`${baseUrl}/api/v1/sites/site-acceptance/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-override-1',
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(reRunComposeRes.status, 200);

    const reRunCopyRes = await fetch(`${baseUrl}/api/v1/sites/site-acceptance/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-override-1',
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(reRunCopyRes.status, 200);

    const storedOverrides = app.locals.v3State.overridesByDraft.get('draft-override-1');
    assert.equal(storedOverrides.version, 1);
    assert.deepEqual(storedOverrides.tone, ['credible', 'calm']);
    assert.deepEqual(storedOverrides.requiredSections, ['hero', 'contact']);

    const overrideAuditEvents = app.locals.v3State.auditEvents.filter((item) => item.action === 'ops_overrides_stored');
    assert.equal(overrideAuditEvents.length >= 1, true);

    const proposalPromptAudit = app.locals.v3State.auditEvents
      .filter((item) => item.action === 'ops_proposals_generated')
      .at(-1);
    assert.equal(typeof proposalPromptAudit?.promptPayload?.verticalStandardVersion, 'string');
    assert.equal(
      Array.isArray(proposalPromptAudit?.promptPayload?.componentContractVersions),
      true
    );
    assert.equal(Array.isArray(proposalPromptAudit?.promptPayload?.slotDefinitions), true);

    const copyPromptAudit = app.locals.v3State.auditEvents
      .filter((item) => item.action === 'ops_copy_generated')
      .at(-1);
    assert.equal(copyPromptAudit?.promptPayload?.verticalStandardVersion, '2026.02');
    assert.deepEqual(copyPromptAudit?.promptPayload?.disallowedPatterns, ['aggressive-discount-banner']);
  } finally {
    await stopServer(server);
  }
});

test('acceptance scenario 4.3: vertical standard version is reusable across multiple companies', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const buildRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings'],
        sourceDomains: ['example-1.com', 'example-2.com']
      })
    });
    assert.equal(buildRes.status, 202);

    const latestRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(latestRes.status, 200);
    const latest = await latestRes.json();

    const composeOneRes = await fetch(`${baseUrl}/api/v1/sites/company-a/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-reuse-a',
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: latest.version
      })
    });
    assert.equal(composeOneRes.status, 200);
    const composeOne = await composeOneRes.json();

    const composeTwoRes = await fetch(`${baseUrl}/api/v1/sites/company-b/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-reuse-b',
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: latest.version
      })
    });
    assert.equal(composeTwoRes.status, 200);
    const composeTwo = await composeTwoRes.json();

    assert.deepEqual(
      composeOne.variants.map((variant) => variant.variantKey),
      ['A', 'B', 'C']
    );
    assert.deepEqual(
      composeTwo.variants.map((variant) => variant.variantKey),
      ['A', 'B', 'C']
    );
    assert.notEqual(composeOne.variants[0].proposalId, composeTwo.variants[0].proposalId);
  } finally {
    await stopServer(server);
  }
});

test('acceptance scenario 4.4: publish gate blocks on synthetic quality/security failures and passes non-blocking findings', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const qualityBlockedRes = await fetch(`${baseUrl}/api/v1/sites/site-gate/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-gate-1',
        proposalId: 'proposal-gate-1',
        simulateQualityP0Fail: true
      })
    });
    assert.equal(qualityBlockedRes.status, 409);
    const qualityBlocked = await qualityBlockedRes.json();
    assert.equal(qualityBlocked.code, 'publish_blocked_quality');
    assert.deepEqual(qualityBlocked.securityReasonCodes, ['security_pass_non_blocking_only']);

    const securityBlockedRes = await fetch(`${baseUrl}/api/v1/sites/site-gate/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-gate-2',
        proposalId: 'proposal-gate-2',
        simulateSecurityHigh: true
      })
    });
    assert.equal(securityBlockedRes.status, 409);
    const securityBlocked = await securityBlockedRes.json();
    assert.equal(securityBlocked.code, 'publish_blocked_security');
    assert.deepEqual(securityBlocked.securityReasonCodes, ['security_blocked_high']);

    const nonBlockingPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-gate/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-gate-3',
        proposalId: 'proposal-gate-3',
        qualityFindings: [{ severity: 'P1', ruleId: 'UX-P1-001' }],
        securityFindings: [{ severity: 'medium', status: 'open' }]
      })
    });
    assert.equal(nonBlockingPublishRes.status, 200);
    const nonBlockingPublish = await nonBlockingPublishRes.json();
    assert.equal(nonBlockingPublish.blocked, false);
    assert.deepEqual(nonBlockingPublish.securityReasonCodes, ['security_pass_non_blocking_only']);

    const blockedAuditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=ops_publish_blocked&siteId=site-gate&limit=10`,
      { headers: { 'x-user-role': 'internal_admin' } }
    );
    assert.equal(blockedAuditRes.status, 200);
    const blockedAudit = await blockedAuditRes.json();
    assert.equal(blockedAudit.count >= 2, true);

    const successAuditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=ops_publish_succeeded&siteId=site-gate&limit=10`,
      { headers: { 'x-user-role': 'internal_admin' } }
    );
    assert.equal(successAuditRes.status, 200);
    const successAudit = await successAuditRes.json();
    assert.equal(successAudit.count >= 1, true);
  } finally {
    await stopServer(server);
  }
});

test('WS-E invariant: post-publish draft edits do not alter live immutable runtime version', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const publishRes = await fetch(`${baseUrl}/api/v1/sites/site-wse-live/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wse-v1',
        proposalId: 'proposal-wse-v1',
        host: 'wse-live.example.test'
      })
    });
    assert.equal(publishRes.status, 200);
    const publishBody = await publishRes.json();

    const preEditResolveRes = await fetch(`${baseUrl}/api/v1/public/runtime/resolve?host=wse-live.example.test`);
    assert.equal(preEditResolveRes.status, 200);
    const preEditResolve = await preEditResolveRes.json();
    assert.equal(preEditResolve.versionId, publishBody.versionId);

    const preEditSnapshotRes = await fetch(
      `${baseUrl}/api/v1/public/runtime/snapshot/by-storage-key?storageKey=${encodeURIComponent(preEditResolve.storageKey)}`
    );
    assert.equal(preEditSnapshotRes.status, 200);
    const preEditSnapshot = await preEditSnapshotRes.json();
    assert.equal(preEditSnapshot.snapshot.proposalId, 'proposal-wse-v1');

    const draftEditRes = await fetch(`${baseUrl}/api/v1/sites/site-wse-live/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wse-v2',
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(draftEditRes.status, 200);

    const postEditResolveRes = await fetch(`${baseUrl}/api/v1/public/runtime/resolve?host=wse-live.example.test`);
    assert.equal(postEditResolveRes.status, 200);
    const postEditResolve = await postEditResolveRes.json();
    assert.equal(postEditResolve.versionId, publishBody.versionId);

    const postEditSnapshotRes = await fetch(
      `${baseUrl}/api/v1/public/runtime/snapshot/by-storage-key?storageKey=${encodeURIComponent(postEditResolve.storageKey)}`
    );
    assert.equal(postEditSnapshotRes.status, 200);
    const postEditSnapshot = await postEditSnapshotRes.json();
    assert.equal(postEditSnapshot.snapshot.proposalId, 'proposal-wse-v1');
  } finally {
    await stopServer(server);
  }
});

test('WS-E contract: rollback rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const publishRes = await fetch(`${baseUrl}/api/v1/sites/site-wse-rollback-unknown/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wse-rollback-unknown-v1',
        proposalId: 'proposal-wse-rollback-unknown-v1',
        host: 'wse-rollback-unknown.example.test'
      })
    });
    assert.equal(publishRes.status, 200);
    const publishBody = await publishRes.json();

    const rollbackRes = await fetch(
      `${baseUrl}/api/v1/sites/site-wse-rollback-unknown/rollback/${publishBody.versionId}`,
      {
        method: 'POST',
        headers: INTERNAL_ADMIN_HEADERS,
        body: JSON.stringify({
          reason: 'manual-repoint'
        })
      }
    );
    assert.equal(rollbackRes.status, 400);
    const payload = await rollbackRes.json();
    assert.equal(payload.code, 'validation_error');
    assert.deepEqual(payload.details.unknownFields, ['reason']);
  } finally {
    await stopServer(server);
  }
});

test('WS-E baseline: local runtime resolve+snapshot latency remains within harness threshold', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const publishRes = await fetch(`${baseUrl}/api/v1/sites/site-latency/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-latency-v1',
        proposalId: 'proposal-latency-v1',
        host: 'latency.example.test'
      })
    });
    assert.equal(publishRes.status, 200);

    const startedAt = performance.now();
    const resolveRes = await fetch(`${baseUrl}/api/v1/public/runtime/resolve?host=latency.example.test`);
    assert.equal(resolveRes.status, 200);
    const resolved = await resolveRes.json();

    const snapshotRes = await fetch(
      `${baseUrl}/api/v1/public/runtime/snapshot/by-storage-key?storageKey=${encodeURIComponent(resolved.storageKey)}`
    );
    assert.equal(snapshotRes.status, 200);
    await snapshotRes.json();
    const elapsedMs = performance.now() - startedAt;

    // Local harness threshold only; this is not an SLO for production runtime.
    assert.equal(elapsedMs < 250, true);
  } finally {
    await stopServer(server);
  }
});

test('WS-F contract: quality report exposes COPY/LAYOUT/MEDIA/LEGAL gate outcomes', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsf-quality/quality/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.deepEqual(
      payload.gateOutcomes.map((outcome) => outcome.family),
      ['COPY', 'LAYOUT', 'MEDIA', 'LEGAL']
    );
    assert.equal(payload.gateOutcomes.every((outcome) => typeof outcome.blockingFailures === 'number'), true);
    assert.equal(payload.gateOutcomes.every((outcome) => typeof outcome.nonBlockingFindings === 'number'), true);
  } finally {
    await stopServer(server);
  }
});

test('WS-F contract: quality latest reflects deterministic gate outcomes from publish attempts', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const blockedPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-wsf-quality-latest/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsf-quality-latest-1',
        proposalId: 'proposal-wsf-quality-latest-1',
        simulateQualityP0Fail: true
      })
    });
    assert.equal(blockedPublishRes.status, 409);

    const blockedLatestRes = await fetch(`${baseUrl}/api/v1/sites/site-wsf-quality-latest/quality/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(blockedLatestRes.status, 200);
    const blockedLatest = await blockedLatestRes.json();
    assert.equal(blockedLatest.status, 'completed');
    assert.equal(blockedLatest.versionId, 'version-pending');
    assert.equal(blockedLatest.blockingFailures.length, 1);

    const passPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-wsf-quality-latest/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsf-quality-latest-2',
        proposalId: 'proposal-wsf-quality-latest-2',
        qualityFindings: [{ severity: 'P1', ruleId: 'UX-P1-001' }],
        securityFindings: [{ severity: 'medium', status: 'open' }]
      })
    });
    assert.equal(passPublishRes.status, 200);
    const passPublish = await passPublishRes.json();

    const passLatestRes = await fetch(`${baseUrl}/api/v1/sites/site-wsf-quality-latest/quality/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(passLatestRes.status, 200);
    const passLatest = await passLatestRes.json();
    assert.equal(passLatest.versionId, passPublish.versionId);
    assert.equal(passLatest.blockingFailures.length, 0);
    const layoutOutcome = passLatest.gateOutcomes.find((outcome) => outcome.family === 'LAYOUT');
    assert.equal(layoutOutcome.status, 'warnings');
    assert.equal(layoutOutcome.nonBlockingFindings, 1);
  } finally {
    await stopServer(server);
  }
});

test('WS-F contract: security report exposes JSON+markdown artifacts and gate decision reason code', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-wsf-security/security/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.siteId, 'site-wsf-security');
    assert.equal(typeof payload.releaseId, 'string');
    assert.equal(typeof payload.versionId, 'string');
    assert.equal(typeof payload.generatedAt, 'string');
    assert.equal(Array.isArray(payload.findings), true);
    assert.equal(payload.findings.length, 0);
    assert.equal(payload.gateDecision.reasonCode, 'security_pass_non_blocking_only');
    assert.equal(payload.gateDecision.blocked, false);
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

test('WS-F contract: security latest reflects deterministic gate outcomes from publish attempts', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const blockedPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-wsf-security-latest/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsf-security-latest-1',
        proposalId: 'proposal-wsf-security-latest-1',
        simulateSecurityHigh: true
      })
    });
    assert.equal(blockedPublishRes.status, 409);

    const blockedLatestRes = await fetch(`${baseUrl}/api/v1/sites/site-wsf-security-latest/security/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(blockedLatestRes.status, 200);
    const blockedLatest = await blockedLatestRes.json();
    assert.equal(blockedLatest.gateDecision.reasonCode, 'security_blocked_high');
    assert.equal(blockedLatest.gateDecision.blocked, true);
    assert.equal(blockedLatest.gateDecision.unresolvedBlockingCount, 1);
    assert.equal(blockedLatest.severityCounts.high, 1);

    const passPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-wsf-security-latest/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsf-security-latest-2',
        proposalId: 'proposal-wsf-security-latest-2',
        securityFindings: [{ severity: 'medium', status: 'open' }]
      })
    });
    assert.equal(passPublishRes.status, 200);
    const passPublish = await passPublishRes.json();

    const passLatestRes = await fetch(`${baseUrl}/api/v1/sites/site-wsf-security-latest/security/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(passLatestRes.status, 200);
    const passLatest = await passLatestRes.json();
    assert.equal(passLatest.versionId, passPublish.versionId);
    assert.equal(passLatest.gateDecision.reasonCode, 'security_pass_non_blocking_only');
    assert.equal(passLatest.gateDecision.blocked, false);
    assert.equal(passLatest.gateDecision.unresolvedBlockingCount, 0);
    assert.equal(passLatest.severityCounts.medium, 1);
  } finally {
    await stopServer(server);
  }
});
