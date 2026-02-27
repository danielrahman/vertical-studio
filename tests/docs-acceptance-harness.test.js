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

const REPO_ROOT = path.resolve(__dirname, '..');
const INTERNAL_ADMIN_HEADERS = {
  'content-type': 'application/json',
  'x-user-role': 'internal_admin'
};

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

test('acceptance scenario 4.1: bounded copy generation enforces candidate policy and limits', async () => {
  const { app, server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-acceptance/copy/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-copy-1',
        locales: ['cs-CZ', 'en-US']
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
  } finally {
    await stopServer(server);
  }
});

test('acceptance scenario 4.2: manual overrides are state-gated, stored, and audit-logged', async () => {
  const { app, server, baseUrl } = await startServer();

  try {
    const proposeRes = await fetch(`${baseUrl}/api/v1/sites/site-acceptance/compose/propose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-override-1',
        locales: ['cs-CZ', 'en-US']
      })
    });
    assert.equal(reRunCopyRes.status, 200);

    const storedOverrides = app.locals.v3State.overridesByDraft.get('draft-override-1');
    assert.equal(storedOverrides.version, 1);
    assert.deepEqual(storedOverrides.tone, ['credible', 'calm']);
    assert.deepEqual(storedOverrides.requiredSections, ['hero', 'contact']);

    const auditEvents = app.locals.v3State.auditEvents.filter((item) => item.action === 'ops_overrides_stored');
    assert.equal(auditEvents.length >= 1, true);
  } finally {
    await stopServer(server);
  }
});

test('acceptance scenario 4.3: vertical standard version is reusable across multiple companies', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const buildRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings'],
        sourceDomains: ['example-1.com', 'example-2.com']
      })
    });
    assert.equal(buildRes.status, 202);

    const latestRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/latest`);
    assert.equal(latestRes.status, 200);
    const latest = await latestRes.json();

    const composeOneRes = await fetch(`${baseUrl}/api/v1/sites/company-a/compose/propose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
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
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-gate-1',
        proposalId: 'proposal-gate-1',
        simulateQualityP0Fail: true
      })
    });
    assert.equal(qualityBlockedRes.status, 409);
    const qualityBlocked = await qualityBlockedRes.json();
    assert.equal(qualityBlocked.code, 'publish_blocked_quality');

    const securityBlockedRes = await fetch(`${baseUrl}/api/v1/sites/site-gate/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-gate-2',
        proposalId: 'proposal-gate-2',
        simulateSecurityHigh: true
      })
    });
    assert.equal(securityBlockedRes.status, 409);
    const securityBlocked = await securityBlockedRes.json();
    assert.equal(securityBlocked.code, 'publish_blocked_security');

    const nonBlockingPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-gate/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
  } finally {
    await stopServer(server);
  }
});
