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
    assert.equal(invalidMode.details.field, 'highImpactOnlyThreeVariants');

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

test('WS-D contract: copy generation accepts only supported locales and de-duplicates inputs', async () => {
  const { server, baseUrl } = await startServer();

  try {
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
    assert.deepEqual(invalidLocalePayload.details.unsupportedLocales, ['de-DE']);

    const duplicateLocaleRes = await fetch(`${baseUrl}/api/v1/sites/site-wsd-locales/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-wsd-locales-1',
        locales: ['cs-CZ', 'en-US', 'cs-CZ'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(duplicateLocaleRes.status, 200);
    const duplicateLocaleSummary = await duplicateLocaleRes.json();
    assert.deepEqual(duplicateLocaleSummary.candidateCounts, {
      A: 12,
      B: 12,
      C: 12,
      SINGLE: 6
    });
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
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy selection enforces unique slot-locale tuples per request', async () => {
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
    assert.equal(duplicatePayload.details.slotId, 'hero.h1');
    assert.equal(duplicatePayload.details.locale, 'cs-CZ');
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy selection rejects empty selection arrays', async () => {
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
  } finally {
    await stopServer(server);
  }
});

test('WS-D contract: copy selection selectedBy must match authenticated actor', async () => {
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
