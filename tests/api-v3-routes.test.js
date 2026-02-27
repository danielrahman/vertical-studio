const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash, createHmac } = require('crypto');
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
  app.locals.cmsWebhookSecret = CMS_WEBHOOK_SECRET;

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
const OWNER_HEADERS = {
  'content-type': 'application/json',
  'x-user-role': 'owner'
};
const TENANT_MEMBER_HEADERS = {
  'x-user-role': 'viewer'
};
const CMS_WEBHOOK_SECRET = 'test-cms-webhook-secret';

function stableId(seed) {
  const digest = createHash('sha256').update(seed).digest('hex').slice(0, 32);
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}

function signCmsWebhookPayload(payload, secret = CMS_WEBHOOK_SECRET) {
  return `sha256=${createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')}`;
}

test('vertical research build enforces competitor minimum and exposes latest output', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const invalidRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 14,
        sources: ['public_web']
      })
    });

    assert.equal(invalidRes.status, 400);
    const invalidBody = await invalidRes.json();
    assert.equal(invalidBody.code, 'insufficient_competitor_sample');
    assert.deepEqual(invalidBody.details, {
      minimumTargetCompetitorCount: 15,
      receivedTargetCompetitorCount: 14
    });

    const invalidTypeRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: '15',
        sources: ['public_web']
      })
    });
    assert.equal(invalidTypeRes.status, 400);
    const invalidTypeBody = await invalidTypeRes.json();
    assert.equal(invalidTypeBody.code, 'insufficient_competitor_sample');
    assert.deepEqual(invalidTypeBody.details, {
      minimumTargetCompetitorCount: 15,
      receivedTargetCompetitorCount: '15'
    });

    const validRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings'],
        sourceDomains: ['example-1.com', 'example-2.com']
      })
    });

    assert.equal(validRes.status, 202);

    const latestRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(latestRes.status, 200);
    const latest = await latestRes.json();
    assert.equal(latest.competitorCount, 15);

    const standardRes = await fetch(
      `${baseUrl}/api/v1/verticals/boutique-developers/standards/${latest.version}`,
      {
        headers: TENANT_MEMBER_HEADERS
      }
    );
    assert.equal(standardRes.status, 200);
    const standard = await standardRes.json();
    assert.equal(standard.standard.sourcePolicy, 'public_web_legal_selected_listings');
  } finally {
    await stopServer(server);
  }
});

test('vertical research build rejects unknown top-level payload fields', async () => {
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
    assert.equal(payload.message, 'vertical research build payload contains unknown top-level fields');
    assert.deepEqual(payload.details.unknownFields, ['crawlDepth']);
  } finally {
    await stopServer(server);
  }
});

test('vertical research build enforces supported source classes with deterministic validation details', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const nonArraySourcesRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: 'public_web'
      })
    });
    assert.equal(nonArraySourcesRes.status, 400);
    const nonArraySourcesPayload = await nonArraySourcesRes.json();
    assert.equal(nonArraySourcesPayload.code, 'validation_error');
    assert.equal(nonArraySourcesPayload.message, 'sources must be an array when provided');
    assert.equal(nonArraySourcesPayload.details.invalidField, 'sources');

    const unsupportedSourceRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'community_forums']
      })
    });
    assert.equal(unsupportedSourceRes.status, 400);
    const unsupportedSourcePayload = await unsupportedSourceRes.json();
    assert.equal(unsupportedSourcePayload.code, 'validation_error');
    assert.equal(unsupportedSourcePayload.message, 'sources must use allowed research classes');
    assert.deepEqual(unsupportedSourcePayload.details.invalidSources, ['community_forums']);
    assert.deepEqual(unsupportedSourcePayload.details.allowedSources, [
      'legal_pages',
      'public_web',
      'selected_listings'
    ]);

    const emptySourcesRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: []
      })
    });
    assert.equal(emptySourcesRes.status, 400);
    const emptySourcesPayload = await emptySourcesRes.json();
    assert.equal(emptySourcesPayload.code, 'validation_error');
    assert.equal(emptySourcesPayload.message, 'sources must use allowed research classes');
    assert.deepEqual(emptySourcesPayload.details.invalidSources, []);
    assert.deepEqual(emptySourcesPayload.details.allowedSources, [
      'legal_pages',
      'public_web',
      'selected_listings'
    ]);
  } finally {
    await stopServer(server);
  }
});

test('vertical research build rejects duplicate source classes with deterministic validation details', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const duplicateSourcesRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'public_web']
      })
    });
    assert.equal(duplicateSourcesRes.status, 400);
    const duplicateSourcesPayload = await duplicateSourcesRes.json();
    assert.equal(duplicateSourcesPayload.code, 'validation_error');
    assert.equal(duplicateSourcesPayload.message, 'sources must not contain duplicate values');
    assert.deepEqual(duplicateSourcesPayload.details.duplicateSources, ['public_web']);
  } finally {
    await stopServer(server);
  }
});

test('vertical research build validates sourceDomains entries and persists normalized values', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const nonArrayDomainsRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings'],
        sourceDomains: 'example-1.com'
      })
    });
    assert.equal(nonArrayDomainsRes.status, 400);
    const nonArrayDomainsPayload = await nonArrayDomainsRes.json();
    assert.equal(nonArrayDomainsPayload.code, 'validation_error');
    assert.equal(nonArrayDomainsPayload.message, 'sourceDomains must be an array when provided');
    assert.equal(nonArrayDomainsPayload.details.invalidField, 'sourceDomains');

    const invalidDomainsRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings'],
        sourceDomains: ['example-1.com', ' ', 123]
      })
    });
    assert.equal(invalidDomainsRes.status, 400);
    const invalidDomainsPayload = await invalidDomainsRes.json();
    assert.equal(invalidDomainsPayload.code, 'validation_error');
    assert.equal(invalidDomainsPayload.message, 'sourceDomains must contain valid domain hostnames when provided');
    assert.deepEqual(invalidDomainsPayload.details.invalidSourceDomains, ['', 123]);

    const malformedDomainsRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings'],
        sourceDomains: ['https://example-1.com', 'example']
      })
    });
    assert.equal(malformedDomainsRes.status, 400);
    const malformedDomainsPayload = await malformedDomainsRes.json();
    assert.equal(malformedDomainsPayload.code, 'validation_error');
    assert.equal(malformedDomainsPayload.message, 'sourceDomains must contain valid domain hostnames when provided');
    assert.deepEqual(malformedDomainsPayload.details.invalidSourceDomains, ['https://example-1.com', 'example']);

    const duplicateDomainsRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings'],
        sourceDomains: [' EXAMPLE-1.com ', 'example-1.com']
      })
    });
    assert.equal(duplicateDomainsRes.status, 400);
    const duplicateDomainsPayload = await duplicateDomainsRes.json();
    assert.equal(duplicateDomainsPayload.code, 'validation_error');
    assert.equal(duplicateDomainsPayload.message, 'sourceDomains must not contain duplicate values');
    assert.deepEqual(duplicateDomainsPayload.details.duplicateSourceDomains, ['example-1.com']);

    const validDomainsRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings'],
        sourceDomains: [' EXAMPLE-1.com ', 'example-2.com']
      })
    });
    assert.equal(validDomainsRes.status, 202);

    const latestRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(latestRes.status, 200);
    const latestPayload = await latestRes.json();
    assert.deepEqual(latestPayload.sourceDomains, ['example-1.com', 'example-2.com']);
  } finally {
    await stopServer(server);
  }
});

test('error responses include mandatory envelope fields on middleware and controller paths', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const notFoundRequestId = 'req-not-found-envelope';
    const notFoundRes = await fetch(`${baseUrl}/api/v1/route-does-not-exist`, {
      headers: { 'x-request-id': notFoundRequestId }
    });
    assert.equal(notFoundRes.status, 404);
    const notFoundBody = await notFoundRes.json();
    assert.equal(notFoundBody.code, 'not_found');
    assert.equal(typeof notFoundBody.message, 'string');
    assert.equal(notFoundBody.requestId, notFoundRequestId);
    assert.deepEqual(notFoundBody.details, {});

    const validationRequestId = 'req-validation-envelope';
    const validationRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: {
        ...INTERNAL_ADMIN_HEADERS,
        'x-request-id': validationRequestId
      },
      body: JSON.stringify({
        targetCompetitorCount: 14,
        sources: ['public_web']
      })
    });
    assert.equal(validationRes.status, 400);
    const validationBody = await validationRes.json();
    assert.equal(validationBody.code, 'insufficient_competitor_sample');
    assert.equal(typeof validationBody.message, 'string');
    assert.equal(validationBody.requestId, validationRequestId);
    assert.deepEqual(validationBody.details, {
      minimumTargetCompetitorCount: 15,
      receivedTargetCompetitorCount: 14
    });
  } finally {
    await stopServer(server);
  }
});

test('tenant/bootstrap/vertical-build mutating endpoints require internal_admin and emit audit events', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const tenantForbiddenRes = await fetch(`${baseUrl}/api/v1/tenants`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Tenant NoAuth' })
    });
    assert.equal(tenantForbiddenRes.status, 403);

    const bootstrapForbiddenRes = await fetch(`${baseUrl}/api/v1/sites/site-acl/bootstrap-from-extraction`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draftId: 'draft-acl-bootstrap' })
    });
    assert.equal(bootstrapForbiddenRes.status, 403);

    const verticalForbiddenRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings']
      })
    });
    assert.equal(verticalForbiddenRes.status, 403);

    const tenantAllowedRes = await fetch(`${baseUrl}/api/v1/tenants`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({ tenantId: 'tenant-acl-audit', name: 'Tenant Auth' })
    });
    assert.equal(tenantAllowedRes.status, 201);

    const bootstrapAllowedRes = await fetch(`${baseUrl}/api/v1/sites/site-acl/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({ draftId: 'draft-acl-bootstrap', lowConfidence: true })
    });
    assert.equal(bootstrapAllowedRes.status, 202);

    const verticalAllowedRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings']
      })
    });
    assert.equal(verticalAllowedRes.status, 202);

    const tenantAuditRes = await fetch(`${baseUrl}/api/v1/audit/events?action=tenant_created&limit=10`, {
      headers: { 'x-user-role': 'internal_admin' }
    });
    assert.equal(tenantAuditRes.status, 200);
    const tenantAudit = await tenantAuditRes.json();
    assert.equal(tenantAudit.count >= 1, true);

    const bootstrapAuditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=site_bootstrap_from_extraction&siteId=site-acl&limit=10`,
      { headers: { 'x-user-role': 'internal_admin' } }
    );
    assert.equal(bootstrapAuditRes.status, 200);
    const bootstrapAudit = await bootstrapAuditRes.json();
    assert.equal(bootstrapAudit.count >= 1, true);

    const verticalAuditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=vertical_research_build_queued&entityId=boutique-developers&limit=10`,
      { headers: { 'x-user-role': 'internal_admin' } }
    );
    assert.equal(verticalAuditRes.status, 200);
    const verticalAudit = await verticalAuditRes.json();
    assert.equal(verticalAudit.count >= 1, true);
  } finally {
    await stopServer(server);
  }
});

test('tenant create rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/tenants`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        tenantId: 'tenant-unknown-fields',
        name: 'Tenant Unknown Fields',
        provisioningMode: 'manual'
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'tenant payload contains unknown top-level fields');
    assert.deepEqual(payload.details.unknownFields, ['provisioningMode']);
  } finally {
    await stopServer(server);
  }
});

test('bootstrap-from-extraction normalizes low-confidence fields into TODO entries', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-bootstrap-model/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-bootstrap-model',
        extractedFields: [
          {
            fieldPath: 'brand.tagline',
            value: 'Premium development team',
            sourceUrl: 'https://example.test/about',
            method: 'dom',
            confidence: 0.91,
            required: true
          },
          {
            fieldPath: 'contact.phone',
            value: '+420123456789',
            sourceUrl: 'https://example.test/contact',
            method: 'dom',
            confidence: 0.2,
            required: true
          },
          {
            fieldPath: 'footer.note',
            value: 'Legacy office label',
            sourceUrl: 'https://example.test/legal',
            method: 'manual',
            confidence: 0.35,
            required: false
          }
        ]
      })
    });
    assert.equal(response.status, 202);
    const payload = await response.json();
    assert.equal(payload.lowConfidence, true);
    assert.equal(payload.requiredTodoCount, 1);
    assert.equal(Array.isArray(payload.extractedFields), true);
    assert.equal(payload.extractedFields.length, 3);

    const lowConfidenceRequiredField = payload.extractedFields.find((field) => field.fieldPath === 'contact.phone');
    assert.equal(lowConfidenceRequiredField.todo, true);
    assert.equal(lowConfidenceRequiredField.value, null);
    assert.equal(lowConfidenceRequiredField.required, true);

    const nonRequiredLowConfidenceField = payload.extractedFields.find((field) => field.fieldPath === 'footer.note');
    assert.equal(nonRequiredLowConfidenceField.todo, true);
    assert.equal(nonRequiredLowConfidenceField.required, false);

    const auditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=site_bootstrap_from_extraction&siteId=site-bootstrap-model&limit=10`,
      { headers: { 'x-user-role': 'internal_admin' } }
    );
    assert.equal(auditRes.status, 200);
    const auditPayload = await auditRes.json();
    assert.equal(auditPayload.count >= 1, true);
    assert.equal(auditPayload.items[0].requiredTodoCount, 1);
    assert.equal(auditPayload.items[0].extractedFieldCount, 3);
  } finally {
    await stopServer(server);
  }
});

test('bootstrap-from-extraction rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-bootstrap-unknown/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-bootstrap-unknown-1',
        previewOnly: true
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'bootstrap payload contains unknown top-level fields');
    assert.deepEqual(payload.details.unknownFields, ['previewOnly']);
  } finally {
    await stopServer(server);
  }
});

test('cms webhook publish ingress requires valid signature and emits audit trail event', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const payload = {
      siteId: 'site-webhook-audit',
      event: 'publish_requested'
    };

    const missingSignatureRes = await fetch(`${baseUrl}/api/v1/cms/webhooks/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(missingSignatureRes.status, 401);
    const missingSignatureBody = await missingSignatureRes.json();
    assert.equal(missingSignatureBody.code, 'webhook_signature_missing');

    const invalidSignatureRes = await fetch(`${baseUrl}/api/v1/cms/webhooks/publish`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': 'sha256=invalid'
      },
      body: JSON.stringify(payload)
    });
    assert.equal(invalidSignatureRes.status, 401);
    const invalidSignatureBody = await invalidSignatureRes.json();
    assert.equal(invalidSignatureBody.code, 'webhook_signature_invalid');

    const validSignatureRes = await fetch(`${baseUrl}/api/v1/cms/webhooks/publish`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': signCmsWebhookPayload(payload)
      },
      body: JSON.stringify(payload)
    });
    assert.equal(validSignatureRes.status, 202);
    const validSignatureBody = await validSignatureRes.json();
    assert.equal(validSignatureBody.status, 'queued');
    assert.equal(typeof validSignatureBody.jobId, 'string');

    const auditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=cms_publish_webhook_queued&siteId=site-webhook-audit&limit=10`,
      { headers: { 'x-user-role': 'internal_admin' } }
    );
    assert.equal(auditRes.status, 200);
    const auditBody = await auditRes.json();
    assert.equal(auditBody.count >= 1, true);
    assert.equal(auditBody.items[0].action, 'cms_publish_webhook_queued');
    assert.equal(auditBody.items[0].entityId, validSignatureBody.jobId);
  } finally {
    await stopServer(server);
  }
});

test('cms webhook publish ingress rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const payload = {
      siteId: 'site-webhook-unknown',
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
    assert.equal(body.message, 'cms publish webhook payload contains unknown top-level fields');
    assert.deepEqual(body.details.unknownFields, ['dryRun']);
  } finally {
    await stopServer(server);
  }
});

test('non-public read endpoints require tenant-member or internal_admin role', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const tenantId = 'tenant-read-acl';
    const draftId = 'draft-read-acl';
    const siteId = 'site-read-acl';

    const tenantCreateRes = await fetch(`${baseUrl}/api/v1/tenants`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        tenantId,
        name: 'Read ACL Tenant'
      })
    });
    assert.equal(tenantCreateRes.status, 201);

    const verticalBuildRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/build`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        targetCompetitorCount: 15,
        sources: ['public_web', 'legal_pages', 'selected_listings']
      })
    });
    assert.equal(verticalBuildRes.status, 202);

    const verticalLatestRes = await fetch(`${baseUrl}/api/v1/verticals/boutique-developers/research/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(verticalLatestRes.status, 200);
    const verticalLatest = await verticalLatestRes.json();

    const copyGenerateRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(copyGenerateRes.status, 200);

    const publishRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        proposalId: 'proposal-read-acl'
      })
    });
    assert.equal(publishRes.status, 200);

    const forbiddenUrls = [
      `${baseUrl}/api/v1/tenants/${tenantId}`,
      `${baseUrl}/api/v1/verticals/boutique-developers/research/latest`,
      `${baseUrl}/api/v1/verticals/boutique-developers/standards/${verticalLatest.version}`,
      `${baseUrl}/api/v1/component-contracts`,
      `${baseUrl}/api/v1/component-contracts/hero/1.0.0`,
      `${baseUrl}/api/v1/sites/${siteId}/copy/slots?draftId=${draftId}`,
      `${baseUrl}/api/v1/sites/${siteId}/versions`,
      `${baseUrl}/api/v1/sites/${siteId}/quality/latest`,
      `${baseUrl}/api/v1/sites/${siteId}/security/latest`
    ];

    for (const url of forbiddenUrls) {
      const response = await fetch(url);
      assert.equal(response.status, 403);
    }

    const tenantReadRes = await fetch(`${baseUrl}/api/v1/tenants/${tenantId}`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(tenantReadRes.status, 200);

    const standardsReadRes = await fetch(
      `${baseUrl}/api/v1/verticals/boutique-developers/standards/${verticalLatest.version}`,
      {
        headers: TENANT_MEMBER_HEADERS
      }
    );
    assert.equal(standardsReadRes.status, 200);

    const componentListRes = await fetch(`${baseUrl}/api/v1/component-contracts`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(componentListRes.status, 200);

    const componentDetailRes = await fetch(`${baseUrl}/api/v1/component-contracts/hero/1.0.0`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(componentDetailRes.status, 200);

    const copySlotsRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/slots?draftId=${draftId}`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(copySlotsRes.status, 200);

    const versionsRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/versions`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(versionsRes.status, 200);

    const qualityRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/quality/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(qualityRes.status, 200);

    const securityRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/security/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(securityRes.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('compose propose returns deterministic three-variant envelope', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-1/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
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

test('compose propose rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-compose-unknown-fields/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-compose-unknown-fields',
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02',
        promptMode: 'fast'
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'compose propose payload contains unknown top-level fields');
    assert.deepEqual(payload.details.unknownFields, ['promptMode']);
  } finally {
    await stopServer(server);
  }
});

test('component contracts endpoint honors catalogVersion query filter', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const matchingRes = await fetch(`${baseUrl}/api/v1/component-contracts?catalogVersion=1.0.0`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(matchingRes.status, 200);
    const matchingBody = await matchingRes.json();
    assert.equal(matchingBody.count >= 1, true);
    assert.equal(matchingBody.items.every((item) => item.version === '1.0.0'), true);

    const missingRes = await fetch(`${baseUrl}/api/v1/component-contracts?catalogVersion=9.9.9`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(missingRes.status, 200);
    const missingBody = await missingRes.json();
    assert.equal(missingBody.count, 0);
    assert.deepEqual(missingBody.items, []);
  } finally {
    await stopServer(server);
  }
});

test('compose propose requires loaded component contracts for requested catalogVersion', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-1/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-compose-contracts-missing',
        rulesVersion: '1.0.0',
        catalogVersion: '9.9.9',
        verticalStandardVersion: '2026.02'
      })
    });

    assert.equal(response.status, 404);
    const payload = await response.json();
    assert.equal(payload.code, 'component_contract_not_found');
    assert.equal(payload.message, 'component contracts not found for catalogVersion');
    assert.equal(payload.details.catalogVersion, '9.9.9');
  } finally {
    await stopServer(server);
  }
});

test('compose propose audit event persists structured prompt payload contract fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-compose-prompt-audit';
    const response = await fetch(`${baseUrl}/api/v1/sites/site-compose-audit/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(response.status, 200);

    const auditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=ops_proposals_generated&siteId=site-compose-audit&limit=10`,
      { headers: { 'x-user-role': 'internal_admin' } }
    );
    assert.equal(auditRes.status, 200);
    const auditBody = await auditRes.json();
    assert.equal(auditBody.count >= 1, true);
    assert.equal(auditBody.items[0].entityId, draftId);
    assert.equal(auditBody.items[0].promptPayload.verticalStandardVersion, '2026.02');
    assert.equal(Array.isArray(auditBody.items[0].promptPayload.componentContractVersions), true);
    assert.equal(auditBody.items[0].promptPayload.componentContractVersions.includes('hero:1.0.0'), true);
    assert.equal(Array.isArray(auditBody.items[0].promptPayload.slotDefinitions), true);
    assert.equal(auditBody.items[0].promptPayload.slotDefinitions.length > 0, true);
    assert.equal(Array.isArray(auditBody.items[0].promptPayload.disallowedPatterns), true);
  } finally {
    await stopServer(server);
  }
});

test('compose select rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-compose-select-unknown-fields';
    const siteId = 'site-compose-select-unknown-fields';
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
    const proposeBody = await proposeRes.json();
    const proposalId = proposeBody.variants[0].proposalId;

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

    const response = await fetch(`${baseUrl}/api/v1/sites/${siteId}/compose/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        proposalId,
        overrideMode: 'manual'
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'compose select payload contains unknown top-level fields');
    assert.deepEqual(payload.details.unknownFields, ['overrideMode']);
  } finally {
    await stopServer(server);
  }
});

test('compose/copy mutation endpoints require internal_admin role', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const composeForbiddenRes = await fetch(`${baseUrl}/api/v1/sites/site-acl-compose/compose/propose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-acl-compose',
        rulesVersion: '1.0.0',
        catalogVersion: '1.0.0',
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(composeForbiddenRes.status, 403);

    const copyGenerateForbiddenRes = await fetch(`${baseUrl}/api/v1/sites/site-acl-compose/copy/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-acl-compose',
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(copyGenerateForbiddenRes.status, 403);

    const copySelectForbiddenRes = await fetch(`${baseUrl}/api/v1/sites/site-acl-compose/copy/select`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        draftId: 'draft-acl-compose',
        selections: []
      })
    });
    assert.equal(copySelectForbiddenRes.status, 403);
  } finally {
    await stopServer(server);
  }
});

test('copy generate rejects unsupported highImpactOnlyThreeVariants mode when provided and not true', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const invalidFlagRes = await fetch(`${baseUrl}/api/v1/sites/site-copy-mode/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-copy-mode',
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02',
        highImpactOnlyThreeVariants: false
      })
    });
    assert.equal(invalidFlagRes.status, 400);
    const invalidFlagBody = await invalidFlagRes.json();
    assert.equal(invalidFlagBody.code, 'validation_error');
    assert.equal(invalidFlagBody.message, 'highImpactOnlyThreeVariants must be true when provided');
    assert.equal(invalidFlagBody.details.field, 'highImpactOnlyThreeVariants');
    assert.equal(invalidFlagBody.details.allowedValue, true);

    const validFlagRes = await fetch(`${baseUrl}/api/v1/sites/site-copy-mode/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-copy-mode',
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02',
        highImpactOnlyThreeVariants: true
      })
    });
    assert.equal(validFlagRes.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('copy generate enforces locale allow-list and normalizes duplicate locales', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const invalidLocaleRes = await fetch(`${baseUrl}/api/v1/sites/site-copy-locales/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-copy-locales',
        locales: ['cs-CZ', 'en-US', 'de-DE'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(invalidLocaleRes.status, 400);
    const invalidLocaleBody = await invalidLocaleRes.json();
    assert.equal(invalidLocaleBody.code, 'validation_error');
    assert.equal(invalidLocaleBody.message, 'locales must contain only supported locales');
    assert.deepEqual(invalidLocaleBody.details.unsupportedLocales, ['de-DE']);

    const duplicateLocaleRes = await fetch(`${baseUrl}/api/v1/sites/site-copy-locales/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-copy-locales',
        locales: ['cs-CZ', 'en-US', 'cs-CZ'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(duplicateLocaleRes.status, 200);
    const duplicateLocaleBody = await duplicateLocaleRes.json();
    assert.deepEqual(duplicateLocaleBody.candidateCounts, {
      A: 12,
      B: 12,
      C: 12,
      SINGLE: 6
    });
  } finally {
    await stopServer(server);
  }
});

test('copy generate requires verticalStandardVersion for prompt contract reproducibility', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const missingVersionRes = await fetch(`${baseUrl}/api/v1/sites/site-copy-version/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-copy-version',
        locales: ['cs-CZ', 'en-US']
      })
    });
    assert.equal(missingVersionRes.status, 400);
    const missingVersionBody = await missingVersionRes.json();
    assert.equal(missingVersionBody.code, 'validation_error');
    assert.equal(missingVersionBody.message, 'verticalStandardVersion is required');
  } finally {
    await stopServer(server);
  }
});

test('copy generate rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const unknownFieldRes = await fetch(`${baseUrl}/api/v1/sites/site-copy-generate-unknown/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-copy-generate-unknown',
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02',
        promptMode: 'fast'
      })
    });
    assert.equal(unknownFieldRes.status, 400);
    const unknownFieldBody = await unknownFieldRes.json();
    assert.equal(unknownFieldBody.code, 'validation_error');
    assert.equal(unknownFieldBody.message, 'copy generate payload contains unknown top-level fields');
    assert.deepEqual(unknownFieldBody.details.unknownFields, ['promptMode']);
  } finally {
    await stopServer(server);
  }
});

test('copy select rejects slotId/locale mismatch for an existing candidate', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-copy-select-mismatch';
    const generateRes = await fetch(`${baseUrl}/api/v1/sites/site-copy-select-mismatch/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(generateRes.status, 200);

    const candidateId = stableId(`${draftId}|hero.h1|cs-CZ|B`);
    const mismatchRes = await fetch(`${baseUrl}/api/v1/sites/site-copy-select-mismatch/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        selections: [{ slotId: 'about.intro', locale: 'en-US', candidateId }]
      })
    });
    assert.equal(mismatchRes.status, 400);
    const mismatchBody = await mismatchRes.json();
    assert.equal(mismatchBody.code, 'validation_error');
    assert.equal(mismatchBody.message, 'selection must match candidate slotId and locale');
    assert.equal(mismatchBody.details.candidateId, candidateId);
  } finally {
    await stopServer(server);
  }
});

test('copy select rejects duplicate slotId/locale selections in one request', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-copy-select-duplicate';
    const generateRes = await fetch(`${baseUrl}/api/v1/sites/site-copy-select-duplicate/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(generateRes.status, 200);

    const candidateAId = stableId(`${draftId}|hero.h1|cs-CZ|A`);
    const candidateBId = stableId(`${draftId}|hero.h1|cs-CZ|B`);
    const duplicateRes = await fetch(`${baseUrl}/api/v1/sites/site-copy-select-duplicate/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        selections: [
          { slotId: 'hero.h1', locale: 'cs-CZ', candidateId: candidateAId },
          { slotId: 'hero.h1', locale: 'cs-CZ', candidateId: candidateBId }
        ]
      })
    });
    assert.equal(duplicateRes.status, 400);
    const duplicateBody = await duplicateRes.json();
    assert.equal(duplicateBody.code, 'validation_error');
    assert.equal(duplicateBody.message, 'selection tuple must be unique per slotId and locale');
    assert.equal(duplicateBody.details.slotId, 'hero.h1');
    assert.equal(duplicateBody.details.locale, 'cs-CZ');
  } finally {
    await stopServer(server);
  }
});

test('copy select rejects empty selections array for internal_admin requests', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-copy-select-empty/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-copy-select-empty',
        selections: []
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'selections array must contain at least one item');
    assert.equal(payload.details.field, 'selections');
  } finally {
    await stopServer(server);
  }
});

test('copy select selectedBy must match authenticated actor role', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const siteId = 'site-copy-select-selected-by';
    const draftId = 'draft-copy-select-selected-by';
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

    const candidateId = stableId(`${draftId}|hero.h1|cs-CZ|B`);
    const mismatchRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        selections: [{ slotId: 'hero.h1', locale: 'cs-CZ', candidateId, selectedBy: 'owner' }]
      })
    });
    assert.equal(mismatchRes.status, 400);
    const mismatchBody = await mismatchRes.json();
    assert.equal(mismatchBody.code, 'validation_error');
    assert.equal(mismatchBody.message, 'selection selectedBy must match authenticated actor role');

    const matchingRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        selections: [{ slotId: 'hero.h1', locale: 'cs-CZ', candidateId, selectedBy: 'internal_admin' }]
      })
    });
    assert.equal(matchingRes.status, 200);
    const matchingBody = await matchingRes.json();
    assert.equal(matchingBody.selectedByRole, 'internal_admin');
  } finally {
    await stopServer(server);
  }
});

test('copy select rejects unknown payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const siteId = 'site-copy-select-unknown-fields';
    const draftId = 'draft-copy-select-unknown-fields';
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

    const candidateId = stableId(`${draftId}|hero.h1|cs-CZ|B`);
    const unknownTopLevelRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        selections: [{ slotId: 'hero.h1', locale: 'cs-CZ', candidateId }],
        unexpectedField: true
      })
    });
    assert.equal(unknownTopLevelRes.status, 400);
    const unknownTopLevelBody = await unknownTopLevelRes.json();
    assert.equal(unknownTopLevelBody.code, 'validation_error');
    assert.equal(unknownTopLevelBody.message, 'copy select payload contains unknown top-level fields');
    assert.deepEqual(unknownTopLevelBody.details.unknownFields, ['unexpectedField']);

    const unknownSelectionFieldRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        selections: [{ slotId: 'hero.h1', locale: 'cs-CZ', candidateId, notes: 'manual note' }]
      })
    });
    assert.equal(unknownSelectionFieldRes.status, 400);
    const unknownSelectionFieldBody = await unknownSelectionFieldRes.json();
    assert.equal(unknownSelectionFieldBody.code, 'validation_error');
    assert.equal(unknownSelectionFieldBody.message, 'selection item contains unknown fields');
    assert.equal(unknownSelectionFieldBody.details.field, 'selections[0]');
    assert.deepEqual(unknownSelectionFieldBody.details.unknownFields, ['notes']);
  } finally {
    await stopServer(server);
  }
});

test('copy select allows owner only when site policy enables draft copy edits', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const siteId = 'site-copy-owner-policy';
    const draftId = 'draft-copy-owner-policy';

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
    const candidateId = stableId(`${draftId}|hero.h1|cs-CZ|B`);

    const ownerForbiddenRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/select`, {
      method: 'POST',
      headers: OWNER_HEADERS,
      body: JSON.stringify({
        draftId,
        selections: [{ slotId: 'hero.h1', locale: 'cs-CZ', candidateId }]
      })
    });
    assert.equal(ownerForbiddenRes.status, 403);

    const bootstrapPolicyRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        sitePolicy: {
          allowOwnerDraftCopyEdits: true
        }
      })
    });
    assert.equal(bootstrapPolicyRes.status, 202);

    const ownerAllowedRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/copy/select`, {
      method: 'POST',
      headers: OWNER_HEADERS,
      body: JSON.stringify({
        draftId,
        selections: [{ slotId: 'hero.h1', locale: 'cs-CZ', candidateId }]
      })
    });
    assert.equal(ownerAllowedRes.status, 200);
    const ownerAllowedBody = await ownerAllowedRes.json();
    assert.equal(ownerAllowedBody.selectedByRole, 'owner');

    const auditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=ops_copy_selected&siteId=${siteId}&limit=10`,
      { headers: { 'x-user-role': 'internal_admin' } }
    );
    assert.equal(auditRes.status, 200);
    const auditPayload = await auditRes.json();
    assert.equal(auditPayload.count >= 1, true);
    assert.equal(auditPayload.items[0].selectedByRole, 'owner');
  } finally {
    await stopServer(server);
  }
});

test('copy selection writes audit trail event for provenance', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-copy-audit-1';
    const generateRes = await fetch(`${baseUrl}/api/v1/sites/site-copy-audit/copy/generate`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        locales: ['cs-CZ', 'en-US'],
        verticalStandardVersion: '2026.02'
      })
    });
    assert.equal(generateRes.status, 200);

    const generateAuditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=ops_copy_generated&siteId=site-copy-audit&limit=10`,
      {
        headers: {
          'x-user-role': 'internal_admin'
        }
      }
    );
    assert.equal(generateAuditRes.status, 200);
    const generateAuditBody = await generateAuditRes.json();
    assert.equal(generateAuditBody.count >= 1, true);
    assert.equal(generateAuditBody.items[0].action, 'ops_copy_generated');
    assert.equal(generateAuditBody.items[0].entityId, draftId);
    assert.equal(generateAuditBody.items[0].promptPayload.verticalStandardVersion, '2026.02');
    assert.equal(Array.isArray(generateAuditBody.items[0].promptPayload.componentContractVersions), true);
    assert.equal(Array.isArray(generateAuditBody.items[0].promptPayload.slotDefinitions), true);
    assert.equal(Array.isArray(generateAuditBody.items[0].promptPayload.disallowedPatterns), true);

    const candidateId = stableId(`${draftId}|hero.h1|cs-CZ|B`);
    const selectRes = await fetch(`${baseUrl}/api/v1/sites/site-copy-audit/copy/select`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        selections: [
          {
            slotId: 'hero.h1',
            locale: 'cs-CZ',
            candidateId
          }
        ]
      })
    });
    assert.equal(selectRes.status, 200);

    const auditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=ops_copy_selected&siteId=site-copy-audit&limit=10`,
      {
        headers: {
          'x-user-role': 'internal_admin'
        }
      }
    );
    assert.equal(auditRes.status, 200);
    const auditBody = await auditRes.json();
    assert.equal(auditBody.count >= 1, true);
    assert.equal(auditBody.items[0].action, 'ops_copy_selected');
    assert.equal(auditBody.items[0].entityId, draftId);
    assert.equal(auditBody.items[0].selectedCount, 1);
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

test('review transition rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-review-unknown/review/transition`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-review-unknown-1',
        fromState: 'draft',
        toState: 'proposal_generated',
        event: 'PROPOSALS_READY',
        dryRun: true
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'review transition payload contains unknown top-level fields');
    assert.deepEqual(payload.details.unknownFields, ['dryRun']);
  } finally {
    await stopServer(server);
  }
});

test('ops review flow enforces internal_admin selection and override state gating', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const proposeRes = await fetch(`${baseUrl}/api/v1/sites/site-1/compose/propose`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
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

test('overrides rejects unknown requiredComponents values', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-override-components-1';
    const proposeRes = await fetch(`${baseUrl}/api/v1/sites/site-override-components/compose/propose`, {
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

    const toReviewRes = await fetch(`${baseUrl}/api/v1/sites/site-override-components/review/transition`, {
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

    const invalidOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-override-components/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        requiredComponents: ['unknown-component']
      })
    });
    assert.equal(invalidOverrideRes.status, 400);
    const invalidOverrideBody = await invalidOverrideRes.json();
    assert.equal(invalidOverrideBody.code, 'invalid_override_payload');
    assert.equal(
      invalidOverrideBody.message,
      'Invalid override payload: requiredComponents contains unknown componentId values'
    );
    assert.deepEqual(invalidOverrideBody.details.unknownComponentIds, ['unknown-component']);

    const validOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-override-components/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        requiredComponents: ['cards-3up', 'cta-form']
      })
    });
    assert.equal(validOverrideRes.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('overrides rejects unknown section values in section arrays', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-override-sections-1';
    const proposeRes = await fetch(`${baseUrl}/api/v1/sites/site-override-sections/compose/propose`, {
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

    const toReviewRes = await fetch(`${baseUrl}/api/v1/sites/site-override-sections/review/transition`, {
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

    const invalidOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-override-sections/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        requiredSections: ['hero', 'unknown-section']
      })
    });
    assert.equal(invalidOverrideRes.status, 400);
    const invalidOverrideBody = await invalidOverrideRes.json();
    assert.equal(invalidOverrideBody.code, 'invalid_override_payload');
    assert.equal(
      invalidOverrideBody.message,
      'Invalid override payload: requiredSections contains unknown section values'
    );
    assert.deepEqual(invalidOverrideBody.details.unknownSections, ['unknown-section']);

    const validOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-override-sections/overrides`, {
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

test('overrides rejects conflicting section directives across arrays', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-override-section-conflicts-1';
    const proposeRes = await fetch(`${baseUrl}/api/v1/sites/site-override-section-conflicts/compose/propose`, {
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

    const toReviewRes = await fetch(`${baseUrl}/api/v1/sites/site-override-section-conflicts/review/transition`, {
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
      `${baseUrl}/api/v1/sites/site-override-section-conflicts/overrides`,
      {
        method: 'POST',
        headers: INTERNAL_ADMIN_HEADERS,
        body: JSON.stringify({
          draftId,
          requiredSections: ['hero', 'contact'],
          excludedSections: ['contact']
        })
      }
    );
    assert.equal(requiredExcludedConflictRes.status, 400);
    const requiredExcludedConflictBody = await requiredExcludedConflictRes.json();
    assert.equal(requiredExcludedConflictBody.code, 'invalid_override_payload');
    assert.equal(
      requiredExcludedConflictBody.message,
      'Invalid override payload: requiredSections and excludedSections must not overlap'
    );
    assert.deepEqual(requiredExcludedConflictBody.details.conflictingSections, ['contact']);

    const pinnedExcludedConflictRes = await fetch(`${baseUrl}/api/v1/sites/site-override-section-conflicts/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        pinnedSections: ['hero'],
        excludedSections: ['hero']
      })
    });
    assert.equal(pinnedExcludedConflictRes.status, 400);
    const pinnedExcludedConflictBody = await pinnedExcludedConflictRes.json();
    assert.equal(pinnedExcludedConflictBody.code, 'invalid_override_payload');
    assert.equal(
      pinnedExcludedConflictBody.message,
      'Invalid override payload: pinnedSections and excludedSections must not overlap'
    );
    assert.deepEqual(pinnedExcludedConflictBody.details.conflictingSections, ['hero']);

    const validOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-override-section-conflicts/overrides`, {
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

test('overrides rejects duplicate values inside override arrays', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-override-duplicates-1';
    const proposeRes = await fetch(`${baseUrl}/api/v1/sites/site-override-duplicates/compose/propose`, {
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

    const toReviewRes = await fetch(`${baseUrl}/api/v1/sites/site-override-duplicates/review/transition`, {
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

    const duplicateOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-override-duplicates/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        keywords: ['trust', 'trust']
      })
    });
    assert.equal(duplicateOverrideRes.status, 400);
    const duplicateOverrideBody = await duplicateOverrideRes.json();
    assert.equal(duplicateOverrideBody.code, 'invalid_override_payload');
    assert.equal(
      duplicateOverrideBody.message,
      'Invalid override payload: keywords must not contain duplicate values'
    );
    assert.deepEqual(duplicateOverrideBody.details.duplicateValues, ['trust']);

    const validOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-override-duplicates/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        keywords: ['trust', 'delivery'],
        requiredSections: ['hero', 'contact']
      })
    });
    assert.equal(validOverrideRes.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('overrides requires at least one non-empty override directive array', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-override-non-empty-1';
    const proposeRes = await fetch(`${baseUrl}/api/v1/sites/site-override-non-empty/compose/propose`, {
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

    const toReviewRes = await fetch(`${baseUrl}/api/v1/sites/site-override-non-empty/review/transition`, {
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

    const emptyOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-override-non-empty/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId
      })
    });
    assert.equal(emptyOverrideRes.status, 400);
    const emptyOverrideBody = await emptyOverrideRes.json();
    assert.equal(emptyOverrideBody.code, 'invalid_override_payload');
    assert.equal(
      emptyOverrideBody.message,
      'Invalid override payload: at least one non-empty override array is required'
    );

    const emptyArraysRes = await fetch(`${baseUrl}/api/v1/sites/site-override-non-empty/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        tone: [],
        keywords: []
      })
    });
    assert.equal(emptyArraysRes.status, 400);
    const emptyArraysBody = await emptyArraysRes.json();
    assert.equal(emptyArraysBody.code, 'invalid_override_payload');

    const validOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-override-non-empty/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        tone: ['credible']
      })
    });
    assert.equal(validOverrideRes.status, 200);
  } finally {
    await stopServer(server);
  }
});

test('overrides rejects empty string values and trims values before duplicate checks', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-override-string-normalization-1';
    const proposeRes = await fetch(`${baseUrl}/api/v1/sites/site-override-string-normalization/compose/propose`, {
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

    const toReviewRes = await fetch(
      `${baseUrl}/api/v1/sites/site-override-string-normalization/review/transition`,
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

    const emptyValueRes = await fetch(`${baseUrl}/api/v1/sites/site-override-string-normalization/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        keywords: ['trust', '   ']
      })
    });
    assert.equal(emptyValueRes.status, 400);
    const emptyValueBody = await emptyValueRes.json();
    assert.equal(emptyValueBody.code, 'invalid_override_payload');
    assert.equal(emptyValueBody.message, 'Invalid override payload: keywords must not contain empty values');

    const normalizedDuplicateRes = await fetch(
      `${baseUrl}/api/v1/sites/site-override-string-normalization/overrides`,
      {
        method: 'POST',
        headers: INTERNAL_ADMIN_HEADERS,
        body: JSON.stringify({
          draftId,
          keywords: ['trust', ' trust ']
        })
      }
    );
    assert.equal(normalizedDuplicateRes.status, 400);
    const normalizedDuplicateBody = await normalizedDuplicateRes.json();
    assert.equal(normalizedDuplicateBody.code, 'invalid_override_payload');
    assert.deepEqual(normalizedDuplicateBody.details.duplicateValues, ['trust']);
  } finally {
    await stopServer(server);
  }
});

test('overrides rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const draftId = 'draft-override-unknown-fields-1';
    const proposeRes = await fetch(`${baseUrl}/api/v1/sites/site-override-unknown-fields/compose/propose`, {
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

    const toReviewRes = await fetch(`${baseUrl}/api/v1/sites/site-override-unknown-fields/review/transition`, {
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

    const invalidOverrideRes = await fetch(`${baseUrl}/api/v1/sites/site-override-unknown-fields/overrides`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        tone: ['credible'],
        unsupportedDirective: ['unexpected']
      })
    });
    assert.equal(invalidOverrideRes.status, 400);
    const invalidOverrideBody = await invalidOverrideRes.json();
    assert.equal(invalidOverrideBody.code, 'invalid_override_payload');
    assert.equal(invalidOverrideBody.message, 'Invalid override payload: contains unknown top-level fields');
    assert.deepEqual(invalidOverrideBody.details.unknownFields, ['unsupportedDirective']);
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

test('rollback rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const publishRes = await fetch(`${baseUrl}/api/v1/sites/site-runtime-rollback-unknown/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-rollback-unknown-1',
        proposalId: 'proposal-rollback-unknown-a',
        host: 'rollback-unknown.example.test'
      })
    });
    assert.equal(publishRes.status, 200);
    const publishBody = await publishRes.json();

    const rollbackRes = await fetch(
      `${baseUrl}/api/v1/sites/site-runtime-rollback-unknown/rollback/${publishBody.versionId}`,
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
    assert.equal(payload.message, 'rollback payload contains unknown top-level fields');
    assert.deepEqual(payload.details.unknownFields, ['reason']);
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
      headers: INTERNAL_ADMIN_HEADERS,
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
    const response = await fetch(`${baseUrl}/api/v1/sites/site-quality/quality/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
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

test('quality latest endpoint reflects latest publish-attempt gate outcome', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const blockedPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-quality-latest/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-quality-latest-1',
        proposalId: 'proposal-quality-latest-1',
        simulateQualityP0Fail: true
      })
    });
    assert.equal(blockedPublishRes.status, 409);

    const blockedLatestRes = await fetch(`${baseUrl}/api/v1/sites/site-quality-latest/quality/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(blockedLatestRes.status, 200);
    const blockedLatest = await blockedLatestRes.json();
    assert.equal(blockedLatest.status, 'completed');
    assert.equal(blockedLatest.versionId, 'version-pending');
    assert.equal(Array.isArray(blockedLatest.blockingFailures), true);
    assert.equal(blockedLatest.blockingFailures.length, 1);
    const blockedCopyOutcome = blockedLatest.gateOutcomes.find((item) => item.family === 'COPY');
    assert.equal(blockedCopyOutcome.status, 'failed');
    assert.equal(blockedCopyOutcome.blockingFailures, 1);

    const passPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-quality-latest/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-quality-latest-2',
        proposalId: 'proposal-quality-latest-2',
        qualityFindings: [{ severity: 'P1', ruleId: 'UX-P1-001' }],
        securityFindings: [{ severity: 'medium', status: 'open' }]
      })
    });
    assert.equal(passPublishRes.status, 200);
    const passPublish = await passPublishRes.json();

    const passLatestRes = await fetch(`${baseUrl}/api/v1/sites/site-quality-latest/quality/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(passLatestRes.status, 200);
    const passLatest = await passLatestRes.json();
    assert.equal(passLatest.status, 'completed');
    assert.equal(passLatest.versionId, passPublish.versionId);
    assert.equal(passLatest.blockingFailures.length, 0);
    const passLayoutOutcome = passLatest.gateOutcomes.find((item) => item.family === 'LAYOUT');
    assert.equal(passLayoutOutcome.status, 'warnings');
    assert.equal(passLayoutOutcome.nonBlockingFindings, 1);
    assert.equal(typeof passLatest.artifacts.findingsJsonPath, 'string');
    assert.equal(typeof passLatest.artifacts.reportMarkdownPath, 'string');
  } finally {
    await stopServer(server);
  }
});

test('security latest endpoint returns artifact references and deterministic gate decision fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/sites/site-security/security/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'pending');
    assert.equal(payload.siteId, 'site-security');
    assert.equal(typeof payload.releaseId, 'string');
    assert.equal(typeof payload.versionId, 'string');
    assert.equal(typeof payload.generatedAt, 'string');
    assert.equal(Array.isArray(payload.findings), true);
    assert.equal(payload.findings.length, 0);
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

test('security latest endpoint reflects latest publish-attempt gate outcome', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const blockedPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-security-latest/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-security-latest-1',
        proposalId: 'proposal-security-latest-1',
        simulateSecurityHigh: true
      })
    });
    assert.equal(blockedPublishRes.status, 409);

    const blockedLatestRes = await fetch(`${baseUrl}/api/v1/sites/site-security-latest/security/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(blockedLatestRes.status, 200);
    const blockedLatest = await blockedLatestRes.json();
    assert.equal(blockedLatest.status, 'completed');
    assert.equal(blockedLatest.versionId, 'version-pending');
    assert.equal(blockedLatest.gateDecision.reasonCode, 'security_blocked_high');
    assert.equal(blockedLatest.gateDecision.blocked, true);
    assert.equal(blockedLatest.gateDecision.unresolvedBlockingCount, 1);
    assert.equal(blockedLatest.severityCounts.high, 1);
    assert.equal(Array.isArray(blockedLatest.findings), true);
    assert.equal(blockedLatest.findings.length, 1);
    assert.equal(blockedLatest.unresolvedFindings.length, 1);

    const passPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-security-latest/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-security-latest-2',
        proposalId: 'proposal-security-latest-2',
        securityFindings: [{ severity: 'medium', status: 'open' }]
      })
    });
    assert.equal(passPublishRes.status, 200);
    const passPublish = await passPublishRes.json();

    const passLatestRes = await fetch(`${baseUrl}/api/v1/sites/site-security-latest/security/latest`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(passLatestRes.status, 200);
    const passLatest = await passLatestRes.json();
    assert.equal(passLatest.status, 'completed');
    assert.equal(passLatest.versionId, passPublish.versionId);
    assert.equal(passLatest.gateDecision.reasonCode, 'security_pass_non_blocking_only');
    assert.equal(passLatest.gateDecision.blocked, false);
    assert.equal(passLatest.gateDecision.unresolvedBlockingCount, 0);
    assert.equal(passLatest.severityCounts.medium, 1);
    assert.equal(passLatest.severityCounts.high, 0);
    assert.equal(passLatest.findings.length, 1);
    assert.equal(passLatest.unresolvedFindings.length, 1);
  } finally {
    await stopServer(server);
  }
});

test('publish is blocked with low_confidence_review_required when required extraction TODO fields remain', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const siteId = 'site-publish-low-confidence';
    const draftId = 'draft-publish-low-confidence';

    const bootstrapRes = await fetch(`${baseUrl}/api/v1/sites/${siteId}/bootstrap-from-extraction`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId,
        extractedFields: [
          {
            fieldPath: 'contact.email',
            value: 'team@example.test',
            sourceUrl: 'https://example.test/contact',
            method: 'dom',
            confidence: 0.2,
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
        proposalId: 'proposal-low-confidence'
      })
    });
    assert.equal(publishRes.status, 409);
    const publishPayload = await publishRes.json();
    assert.equal(publishPayload.code, 'low_confidence_review_required');
    assert.equal(publishPayload.requiredTodoCount, 1);
    assert.deepEqual(publishPayload.reasons, ['low_confidence_review_required']);

    const auditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=ops_publish_blocked&siteId=${siteId}&limit=10`,
      { headers: { 'x-user-role': 'internal_admin' } }
    );
    assert.equal(auditRes.status, 200);
    const auditPayload = await auditRes.json();
    assert.equal(auditPayload.count >= 1, true);
    assert.equal(auditPayload.items[0].gateCode, 'low_confidence_review_required');
    assert.equal(auditPayload.items[0].requiredTodoCount, 1);
  } finally {
    await stopServer(server);
  }
});

test('publish rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const publishRes = await fetch(`${baseUrl}/api/v1/sites/site-publish-unknown/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-publish-unknown-1',
        proposalId: 'proposal-publish-unknown-1',
        dryRun: true
      })
    });
    assert.equal(publishRes.status, 400);
    const payload = await publishRes.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'publish payload contains unknown top-level fields');
    assert.deepEqual(payload.details.unknownFields, ['dryRun']);
  } finally {
    await stopServer(server);
  }
});

test('publish attempts emit privileged audit events for blocked and successful outcomes', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const blockedPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-publish-audit/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-publish-audit-1',
        proposalId: 'proposal-publish-audit-1',
        simulateQualityP0Fail: true
      })
    });
    assert.equal(blockedPublishRes.status, 409);

    const successPublishRes = await fetch(`${baseUrl}/api/v1/sites/site-publish-audit/publish`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        draftId: 'draft-publish-audit-2',
        proposalId: 'proposal-publish-audit-2'
      })
    });
    assert.equal(successPublishRes.status, 200);
    const successPublish = await successPublishRes.json();

    const blockedAuditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=ops_publish_blocked&siteId=site-publish-audit&limit=10`,
      { headers: { 'x-user-role': 'internal_admin' } }
    );
    assert.equal(blockedAuditRes.status, 200);
    const blockedAudit = await blockedAuditRes.json();
    assert.equal(blockedAudit.count >= 1, true);
    assert.equal(blockedAudit.items[0].action, 'ops_publish_blocked');
    assert.equal(blockedAudit.items[0].gateCode, 'publish_blocked_quality');

    const successAuditRes = await fetch(
      `${baseUrl}/api/v1/audit/events?action=ops_publish_succeeded&siteId=site-publish-audit&limit=10`,
      { headers: { 'x-user-role': 'internal_admin' } }
    );
    assert.equal(successAuditRes.status, 200);
    const successAudit = await successAuditRes.json();
    assert.equal(successAudit.count >= 1, true);
    assert.equal(successAudit.items[0].action, 'ops_publish_succeeded');
    assert.equal(successAudit.items[0].entityType, 'site_version');
    assert.equal(successAudit.items[0].entityId, successPublish.versionId);
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

test('secret refs endpoint rejects unknown top-level payload fields', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const response = await fetch(`${baseUrl}/api/v1/secrets/refs`, {
      method: 'POST',
      headers: INTERNAL_ADMIN_HEADERS,
      body: JSON.stringify({
        tenantId: 'tenant-secret-unknown',
        tenantSlug: 'tenant-secret-unknown',
        ref: 'tenant.tenant-secret-unknown.openai.api',
        provider: 'openai',
        key: 'api',
        rotationWindowDays: 30
      })
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.code, 'validation_error');
    assert.equal(payload.message, 'secret ref payload contains unknown top-level fields');
    assert.deepEqual(payload.details.unknownFields, ['rotationWindowDays']);
  } finally {
    await stopServer(server);
  }
});

test('component contract endpoint returns contract and typed not-found code', async () => {
  const { server, baseUrl } = await startServer();

  try {
    const existingRes = await fetch(`${baseUrl}/api/v1/component-contracts/hero/1.0.0`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(existingRes.status, 200);

    const missingRes = await fetch(`${baseUrl}/api/v1/component-contracts/missing/1.0.0`, {
      headers: TENANT_MEMBER_HEADERS
    });
    assert.equal(missingRes.status, 404);
    const missingBody = await missingRes.json();
    assert.equal(missingBody.code, 'component_contract_not_found');
  } finally {
    await stopServer(server);
  }
});
