const { createHmac, randomUUID, timingSafeEqual } = require('crypto');
const { ReviewTransitionGuardService } = require('../../services/review-transition-guard-service');
const { ComposeCopyService } = require('../../services/compose-copy-service');
const { PublishGateService, isQualityP0Finding } = require('../../services/publish-gate-service');

const SUPPORTED_RESEARCH_SOURCES = new Set(['public_web', 'legal_pages', 'selected_listings']);
const SOURCE_DOMAIN_PATTERN = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const ISO_8601_UTC_DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const QUALITY_GATE_FAMILIES = ['COPY', 'LAYOUT', 'MEDIA', 'LEGAL'];
const QUALITY_SEVERITY_LEVELS = new Set(['P0', 'P1', 'P2']);
const SECURITY_SEVERITY_LEVELS = new Set(['critical', 'high', 'medium', 'low']);
const TENANT_MEMBER_ROLES = new Set(['internal_admin', 'owner', 'editor', 'viewer']);
const EXTRACTION_METHODS = new Set(['dom', 'ocr', 'inference', 'manual']);
const COPY_REQUIRED_LOCALES = ['cs-CZ', 'en-US'];
const COPY_LOCALES = new Set(COPY_REQUIRED_LOCALES);
const COPY_SELECT_ACTOR_ROLES = new Set(['internal_admin', 'owner']);
const COMPOSE_PROPOSE_ALLOWED_TOP_LEVEL_FIELDS = new Set([
  'draftId',
  'rulesVersion',
  'catalogVersion',
  'verticalStandardVersion',
  'actorRole'
]);
const TENANT_CREATE_ALLOWED_TOP_LEVEL_FIELDS = new Set(['tenantId', 'name', 'slug']);
const BOOTSTRAP_ALLOWED_TOP_LEVEL_FIELDS = new Set(['draftId', 'extractedFields', 'lowConfidence', 'sitePolicy']);
const BOOTSTRAP_EXTRACTED_FIELD_ALLOWED_FIELDS = new Set([
  'fieldPath',
  'value',
  'sourceUrl',
  'method',
  'confidence',
  'extractedAt',
  'required'
]);
const BOOTSTRAP_SITE_POLICY_ALLOWED_FIELDS = new Set(['allowOwnerDraftCopyEdits']);
const VERTICAL_RESEARCH_BUILD_ALLOWED_TOP_LEVEL_FIELDS = new Set([
  'targetCompetitorCount',
  'sources',
  'sourceDomains'
]);
const COMPOSE_SELECT_ALLOWED_TOP_LEVEL_FIELDS = new Set(['draftId', 'proposalId', 'actorRole']);
const CMS_WEBHOOK_PUBLISH_ALLOWED_TOP_LEVEL_FIELDS = new Set(['siteId', 'event']);
const PUBLISH_ALLOWED_TOP_LEVEL_FIELDS = new Set([
  'draftId',
  'proposalId',
  'runQuality',
  'runSecurityAudit',
  'qualityFindings',
  'securityFindings',
  'simulateQualityP0Fail',
  'simulateSecurityHigh',
  'host',
  'actorRole'
]);
const ROLLBACK_ALLOWED_TOP_LEVEL_FIELDS = new Set([]);
const REVIEW_TRANSITION_ALLOWED_TOP_LEVEL_FIELDS = new Set([
  'draftId',
  'fromState',
  'toState',
  'event',
  'reason',
  'actorRole'
]);
const COPY_GENERATE_ALLOWED_TOP_LEVEL_FIELDS = new Set([
  'draftId',
  'locales',
  'verticalStandardVersion',
  'highImpactOnlyThreeVariants',
  'actorRole'
]);
const COPY_SELECT_ALLOWED_TOP_LEVEL_FIELDS = new Set(['draftId', 'selections', 'actorRole']);
const COPY_SELECT_ALLOWED_SELECTION_FIELDS = new Set(['slotId', 'locale', 'candidateId', 'selectedBy']);
const RUNTIME_SNAPSHOT_COPY_SLOT_MAPPINGS = [
  { slotId: 'hero.h1', sectionId: 'hero', slotKey: 'h1' },
  { slotId: 'hero.subhead', sectionId: 'hero', slotKey: 'subhead' },
  { slotId: 'hero.primary_cta_label', sectionId: 'hero', slotKey: 'primaryCtaLabel' },
  { slotId: 'value_props.intro', sectionId: 'value_props', slotKey: 'intro' },
  { slotId: 'about.intro', sectionId: 'about', slotKey: 'intro' },
  { slotId: 'process.step_1_title', sectionId: 'process', slotKey: 'step1Title' },
  { slotId: 'faq.q1', sectionId: 'faq', slotKey: 'question1' },
  { slotId: 'faq.a1', sectionId: 'faq', slotKey: 'answer1' },
  { slotId: 'contact.primary_cta_label', sectionId: 'contact', slotKey: 'primaryCtaLabel' }
];
const LOW_CONFIDENCE_THRESHOLD = 0.5;
const OVERRIDE_ARRAY_KEYS = [
  'tone',
  'keywords',
  'requiredSections',
  'excludedSections',
  'pinnedSections',
  'requiredComponents',
  'excludedCompetitorPatterns'
];
const OVERRIDE_ALLOWED_TOP_LEVEL_FIELDS = new Set(['draftId', 'actorRole', ...OVERRIDE_ARRAY_KEYS]);
const OVERRIDE_SECTION_FIELDS = ['requiredSections', 'excludedSections', 'pinnedSections'];
const ALLOWED_OVERRIDE_SECTION_KEYS = new Set([
  'hero',
  'value_props',
  'about',
  'process',
  'timeline',
  'portfolio',
  'team',
  'testimonials',
  'stats',
  'faq',
  'cta',
  'contact',
  'legal'
]);
const SECRET_REF_ALLOWED_TOP_LEVEL_FIELDS = new Set([
  'tenantId',
  'tenantSlug',
  'ref',
  'provider',
  'key',
  'label',
  'description'
]);
const SECRET_REF_PATTERN = /^tenant\.([a-z0-9-]+)\.([a-z0-9-]+)\.([a-z0-9-]+)$/;
const SECRET_REF_SEGMENT_PATTERN = /^[a-z0-9-]+$/;
const SECRET_VALUE_KEYS = ['value', 'secret', 'secretValue', 'plaintext', 'token', 'apiKey', 'privateKey'];
const reviewTransitionGuard = new ReviewTransitionGuardService();
const composeCopyService = new ComposeCopyService();
const publishGateService = new PublishGateService();

function createError(message, statusCode, code, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details) {
    error.details = details;
  }
  return error;
}

function normalizeOptionalString(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function getValueType(value) {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function getState(req) {
  if (!req.app.locals.v3State) {
    req.app.locals.v3State = {
      tenants: new Map(),
      verticalResearch: new Map(),
      extractedFieldsByDraft: new Map(),
      componentContracts: new Map(),
      sitePoliciesBySite: new Map(),
      reviewStatesByDraft: new Map(),
      proposalsByDraft: new Map(),
      selectedProposalByDraft: new Map(),
      siteVersions: new Map(),
      runtimeHostToSite: new Map(),
      runtimeSnapshotsByStorageKey: new Map(),
      copySlotsByDraft: new Map(),
      copyCandidatesByDraft: new Map(),
      overridesByDraft: new Map(),
      copySelectionsByDraft: new Map(),
      qualityReportsBySite: new Map(),
      securityReportsBySite: new Map(),
      secretRefs: new Map(),
      auditEvents: []
    };

    const heroContract = {
      componentId: 'hero',
      version: '1.0.0',
      catalogVersion: '1.0.0',
      description: 'Primary intro section',
      propsSchema: {
        type: 'object',
        required: ['h1', 'subhead', 'primaryCtaLabel', 'primaryCtaHref']
      },
      requiredFields: ['h1', 'subhead', 'primaryCtaLabel', 'primaryCtaHref'],
      maxLengths: {
        h1: 80,
        subhead: 220,
        primaryCtaLabel: 28,
        secondaryCtaLabel: 28,
        'media.alt': 125
      },
      fallbackPolicy: {
        secondaryCtaLabel: 'omit_if_missing',
        secondaryCtaHref: 'omit_if_missing',
        media: 'render_without_media_if_missing'
      },
      allowedVariants: ['split-media', 'centered-copy', 'minimal'],
      seoA11yRequirements: ['must_render_single_h1', 'cta_links_must_be_valid_urls', 'meaningful_media_requires_alt']
    };
    const cards3upContract = {
      componentId: 'cards-3up',
      version: '1.0.0',
      catalogVersion: '1.0.0',
      description: 'Three side-by-side value proposition cards',
      propsSchema: {
        type: 'object',
        required: ['cards'],
        properties: {
          cards: { type: 'array' }
        }
      },
      requiredFields: ['cards'],
      maxLengths: {
        'cards.title': 60,
        'cards.body': 180
      },
      fallbackPolicy: {
        cards: 'exclude_if_incomplete'
      },
      allowedVariants: ['icon-top', 'image-top', 'minimal'],
      seoA11yRequirements: ['card_images_require_alt_when_present']
    };
    const ctaFormContract = {
      componentId: 'cta-form',
      version: '1.0.0',
      catalogVersion: '1.0.0',
      description: 'Primary conversion form with CTA',
      propsSchema: {
        type: 'object',
        required: ['headline', 'submitLabel']
      },
      requiredFields: ['headline', 'submitLabel'],
      maxLengths: {
        headline: 120,
        submitLabel: 28
      },
      fallbackPolicy: {
        description: 'omit_if_missing'
      },
      allowedVariants: ['default', 'inline'],
      seoA11yRequirements: ['form_labels_must_be_present', 'submit_control_must_be_accessible']
    };

    req.app.locals.v3State.componentContracts.set('hero:1.0.0', heroContract);
    req.app.locals.v3State.componentContracts.set('cards-3up:1.0.0', cards3upContract);
    req.app.locals.v3State.componentContracts.set('cta-form:1.0.0', ctaFormContract);
  }

  return req.app.locals.v3State;
}

function assertString(value, fieldName) {
  if (!value || typeof value !== 'string') {
    throw createError(`${fieldName} is required`, 400, 'validation_error', {
      invalidField: fieldName,
      expectedType: 'string',
      receivedType: getValueType(value)
    });
  }
}

function assertSegment(value, fieldName) {
  if (typeof value !== 'string') {
    throw createError(`${fieldName} must contain only lowercase letters, numbers, and hyphen`, 400, 'validation_error', {
      invalidField: fieldName,
      expectedType: 'string',
      receivedType: getValueType(value)
    });
  }

  const normalized = value.trim();
  if (!normalized || !SECRET_REF_SEGMENT_PATTERN.test(normalized)) {
    throw createError(`${fieldName} must contain only lowercase letters, numbers, and hyphen`, 400, 'validation_error', {
      invalidField: fieldName,
      expectedType: 'string',
      receivedType: getValueType(value),
      expectedPattern: '^[a-z0-9-]+$',
      receivedValue: value
    });
  }

  return normalized;
}

function parseSecretRef(ref) {
  const match = SECRET_REF_PATTERN.exec(ref);
  if (!match) {
    throw createError('ref must match tenant.<slug>.<provider>.<key>', 400, 'validation_error', {
      invalidField: 'ref',
      expectedFormat: 'tenant.<slug>.<provider>.<key>',
      receivedRef: ref
    });
  }

  return {
    tenantSlug: match[1],
    provider: match[2],
    key: match[3]
  };
}

function assertInternalAdmin(req) {
  const headerRole =
    typeof req.headers['x-user-role'] === 'string' ? req.headers['x-user-role'].trim() : null;
  const bodyRole = typeof req.body?.actorRole === 'string' ? req.body.actorRole.trim() : null;
  const role = headerRole || bodyRole;

  if (role !== 'internal_admin') {
    throw createError('internal_admin role required', 403, 'forbidden', {
      requiredRole: 'internal_admin'
    });
  }
}

function getActorRole(req) {
  const headerRole =
    typeof req.headers['x-user-role'] === 'string' ? req.headers['x-user-role'].trim() : null;
  const bodyRole = typeof req.body?.actorRole === 'string' ? req.body.actorRole.trim() : null;
  return headerRole || bodyRole || null;
}

function assertTenantMemberOrInternalAdmin(req) {
  const role = getActorRole(req);

  if (!TENANT_MEMBER_ROLES.has(role)) {
    throw createError('tenant member or internal_admin role required', 403, 'forbidden', {
      requiredRoles: ['internal_admin', 'owner', 'editor', 'viewer']
    });
  }
}

function assertCopySelectActorRole(req, state, siteId) {
  const role = getActorRole(req);
  if (role === 'internal_admin') {
    return role;
  }

  if (role === 'owner') {
    const sitePolicy = state.sitePoliciesBySite.get(siteId);
    if (sitePolicy?.allowOwnerDraftCopyEdits === true) {
      return role;
    }
  }

  throw createError('internal_admin role required for copy selection unless owner draft edit policy is enabled', 403, 'forbidden', {
    requiredRole: 'internal_admin',
    allowedAlternativeRole: 'owner',
    policyField: 'sitePolicy.allowOwnerDraftCopyEdits'
  });
}

function assertCopySelectionShape(selection, index) {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) {
    throw createError('selection item must be an object', 400, 'validation_error', {
      invalidField: `selections[${index}]`,
      selectionIndex: index,
      expectedType: 'object',
      receivedType: getValueType(selection)
    });
  }

  const unknownSelectionFields = Object.keys(selection)
    .filter((field) => {
      return !COPY_SELECT_ALLOWED_SELECTION_FIELDS.has(field);
    })
    .sort();
  if (unknownSelectionFields.length > 0) {
    throw createError('selection item contains unknown fields', 400, 'validation_error', {
      invalidField: `selections[${index}]`,
      selectionIndex: index,
      unknownFields: unknownSelectionFields,
      allowedSelectionFields: Array.from(COPY_SELECT_ALLOWED_SELECTION_FIELDS).sort()
    });
  }

  if (typeof selection.slotId !== 'string' || !selection.slotId.trim()) {
    throw createError('selection slotId is required', 400, 'validation_error', {
      invalidField: `selections[${index}].slotId`,
      selectionIndex: index,
      expectedType: 'string',
      receivedType: getValueType(selection.slotId)
    });
  }

  if (!COPY_LOCALES.has(selection.locale)) {
    throw createError('selection locale must be one of cs-CZ or en-US', 400, 'validation_error', {
      invalidField: `selections[${index}].locale`,
      selectionIndex: index,
      expectedType: 'string',
      receivedType: getValueType(selection.locale),
      allowedLocales: Array.from(COPY_LOCALES).sort()
    });
  }

  if (typeof selection.candidateId !== 'string' || !selection.candidateId.trim()) {
    throw createError('selection candidateId is required', 400, 'validation_error', {
      invalidField: `selections[${index}].candidateId`,
      selectionIndex: index,
      expectedType: 'string',
      receivedType: getValueType(selection.candidateId)
    });
  }

  if (typeof selection.selectedBy !== 'undefined' && !COPY_SELECT_ACTOR_ROLES.has(selection.selectedBy)) {
    throw createError('selection selectedBy must be one of internal_admin or owner', 400, 'validation_error', {
      invalidField: `selections[${index}].selectedBy`,
      selectionIndex: index,
      expectedType: 'string',
      receivedType: getValueType(selection.selectedBy),
      allowedSelectedByRoles: Array.from(COPY_SELECT_ACTOR_ROLES).sort()
    });
  }
}

function assertNoPlaintextSecretPayload(body) {
  const payload = body && typeof body === 'object' ? body : {};
  const forbiddenField = SECRET_VALUE_KEYS.find((field) => Object.hasOwn(payload, field));

  if (forbiddenField) {
    throw createError('plaintext secret values are not allowed in metadata payloads', 400, 'validation_error', {
      invalidField: forbiddenField,
      receivedType: getValueType(payload[forbiddenField]),
      forbiddenKeys: [...SECRET_VALUE_KEYS].sort()
    });
  }
}

function normalizeHost(rawHost) {
  if (typeof rawHost !== 'string') {
    return null;
  }

  const trimmed = rawHost.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  const withoutProtocol = trimmed.replace(/^https?:\/\//, '');
  const host = withoutProtocol.split('/')[0];
  return host.split(':')[0] || null;
}

function normalizeExtractedField(input, index) {
  const defaultFieldPath = `field_${index + 1}`;
  const fieldPath =
    typeof input?.fieldPath === 'string' && input.fieldPath.trim() ? input.fieldPath.trim() : defaultFieldPath;
  const confidenceNumber = Number(input?.confidence);
  const confidence = Number.isFinite(confidenceNumber) ? Math.min(Math.max(confidenceNumber, 0), 1) : 0;
  const method = typeof input?.method === 'string' ? input.method.trim() : '';
  const normalizedMethod = EXTRACTION_METHODS.has(method) ? method : 'inference';
  const extractedAt =
    typeof input?.extractedAt === 'string' && input.extractedAt.trim()
      ? input.extractedAt.trim()
      : new Date().toISOString();
  const todo = confidence < LOW_CONFIDENCE_THRESHOLD;
  const required = input?.required !== false;

  let value = Object.hasOwn(input || {}, 'value') ? input.value : null;
  if (todo) {
    value = null;
  }

  return {
    fieldPath,
    required,
    value,
    sourceUrl: normalizeOptionalString(input?.sourceUrl),
    method: normalizedMethod,
    confidence,
    extractedAt,
    todo
  };
}

function getCmsWebhookSecret(req) {
  const appSecret =
    typeof req.app?.locals?.cmsWebhookSecret === 'string' ? req.app.locals.cmsWebhookSecret.trim() : null;
  if (appSecret) {
    return appSecret;
  }

  if (typeof process.env.CMS_WEBHOOK_SECRET === 'string' && process.env.CMS_WEBHOOK_SECRET.trim()) {
    return process.env.CMS_WEBHOOK_SECRET.trim();
  }

  return null;
}

function signCmsWebhookPayload(payload, secret) {
  return `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
}

function secureCompare(value, expected) {
  const valueBuffer = Buffer.from(value, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (valueBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(valueBuffer, expectedBuffer);
}

function assertCmsWebhookSignature(req) {
  const secret = getCmsWebhookSecret(req);
  if (!secret) {
    throw createError('CMS webhook secret is not configured', 500, 'webhook_secret_not_configured');
  }

  const signature =
    typeof req.headers['x-webhook-signature'] === 'string' ? req.headers['x-webhook-signature'].trim() : '';
  if (!signature) {
    throw createError('Missing webhook signature', 401, 'webhook_signature_missing');
  }

  const payload = JSON.stringify(req.body || {});
  const expectedSignature = signCmsWebhookPayload(payload, secret);
  if (!secureCompare(signature, expectedSignature)) {
    throw createError('Invalid webhook signature', 401, 'webhook_signature_invalid');
  }
}

function normalizeSecurityFindingStatus(finding) {
  const rawStatus = typeof finding?.status === 'string' ? finding.status.trim().toLowerCase() : '';
  if (rawStatus === 'open' || rawStatus === 'accepted' || rawStatus === 'resolved') {
    return rawStatus;
  }

  if (finding?.resolved === true) {
    return 'resolved';
  }

  return 'open';
}

function normalizeSecurityFindingSeverity(finding) {
  const rawSeverity = typeof finding?.severity === 'string' ? finding.severity.trim().toLowerCase() : '';
  if (SECURITY_SEVERITY_LEVELS.has(rawSeverity)) {
    return rawSeverity;
  }

  return 'low';
}

function normalizeSecurityFinding(finding, index) {
  const evidence = Array.isArray(finding?.evidence)
    ? finding.evidence.filter((item) => typeof item === 'string' && item.trim())
    : [];

  return {
    findingId:
      typeof finding?.findingId === 'string' && finding.findingId.trim()
        ? finding.findingId.trim()
        : `SEC-${String(index + 1).padStart(3, '0')}`,
    severity: normalizeSecurityFindingSeverity(finding),
    title:
      typeof finding?.title === 'string' && finding.title.trim()
        ? finding.title.trim()
        : `Security finding ${index + 1}`,
    description:
      typeof finding?.description === 'string' && finding.description.trim()
        ? finding.description.trim()
        : 'No description provided.',
    impact:
      typeof finding?.impact === 'string' && finding.impact.trim()
        ? finding.impact.trim()
        : 'Impact pending triage.',
    status: normalizeSecurityFindingStatus(finding),
    evidence,
    remediation:
      typeof finding?.remediation === 'string' && finding.remediation.trim()
        ? finding.remediation.trim()
        : 'Remediation plan pending.',
    owner:
      typeof finding?.owner === 'string' && finding.owner.trim() ? finding.owner.trim() : 'unassigned'
  };
}

function buildSecuritySeverityCounts(findings) {
  const severityCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };

  for (const finding of findings) {
    if (SECURITY_SEVERITY_LEVELS.has(finding.severity)) {
      severityCounts[finding.severity] += 1;
    }
  }

  return severityCounts;
}

function pickSecurityReasonCode(securityReasonCodes) {
  if (Array.isArray(securityReasonCodes)) {
    if (securityReasonCodes.includes('security_blocked_critical')) {
      return 'security_blocked_critical';
    }
    if (securityReasonCodes.includes('security_blocked_high')) {
      return 'security_blocked_high';
    }
  }

  return 'security_pass_non_blocking_only';
}

function buildSecurityReport({
  siteId,
  versionId,
  generatedAt,
  securityFindings,
  securityReasonCodes
}) {
  const findings = securityFindings.map((finding, index) => normalizeSecurityFinding(finding, index));
  const unresolvedFindings = findings.filter((finding) => finding.status !== 'resolved');
  const reasonCode = pickSecurityReasonCode(securityReasonCodes);
  const unresolvedBlockingCount = unresolvedFindings.filter((finding) => {
    return finding.severity === 'critical' || finding.severity === 'high';
  }).length;
  const releaseId = `${siteId}-${versionId}`;

  return {
    siteId,
    releaseId,
    versionId,
    generatedAt,
    status: 'completed',
    findings,
    unresolvedFindings,
    severityCounts: buildSecuritySeverityCounts(findings),
    gateDecision: {
      blocked: reasonCode !== 'security_pass_non_blocking_only',
      reasonCode,
      unresolvedBlockingCount
    },
    artifacts: {
      findingsJsonPath: `docs/security/findings/${releaseId}.json`,
      reportMarkdownPath: `docs/security/reports/${releaseId}.md`,
      gateResultJsonPath: `docs/security/gates/${releaseId}.json`
    }
  };
}

function normalizeQualityFindingSeverity(finding) {
  const rawSeverity = typeof finding?.severity === 'string' ? finding.severity.trim().toUpperCase() : '';
  if (QUALITY_SEVERITY_LEVELS.has(rawSeverity)) {
    return rawSeverity;
  }

  if (finding?.blocking === true) {
    return 'P0';
  }

  return 'P2';
}

function normalizeQualityFindingFamily(finding) {
  const explicitFamily = typeof finding?.family === 'string' ? finding.family.trim().toUpperCase() : '';
  if (QUALITY_GATE_FAMILIES.includes(explicitFamily)) {
    return explicitFamily;
  }

  const ruleId = typeof finding?.ruleId === 'string' ? finding.ruleId.trim().toUpperCase() : '';
  if (ruleId.startsWith('COPY-')) {
    return 'COPY';
  }
  if (ruleId.startsWith('LAYOUT-') || ruleId.startsWith('UX-') || ruleId.startsWith('SEO-')) {
    return 'LAYOUT';
  }
  if (ruleId.startsWith('MEDIA-')) {
    return 'MEDIA';
  }
  if (ruleId.startsWith('LEGAL-')) {
    return 'LEGAL';
  }

  return 'LAYOUT';
}

function normalizeQualityFinding(finding, index) {
  const severity = normalizeQualityFindingSeverity(finding);
  const ruleId =
    typeof finding?.ruleId === 'string' && finding.ruleId.trim()
      ? finding.ruleId.trim()
      : `${normalizeQualityFindingFamily(finding)}-${severity}-${String(index + 1).padStart(3, '0')}`;
  const message =
    typeof finding?.message === 'string' && finding.message.trim()
      ? finding.message.trim()
      : 'Quality finding reported.';

  return {
    findingId:
      typeof finding?.findingId === 'string' && finding.findingId.trim()
        ? finding.findingId.trim()
        : `QLT-${String(index + 1).padStart(3, '0')}`,
    family: normalizeQualityFindingFamily(finding),
    severity,
    ruleId,
    blocking: isQualityP0Finding({
      ...finding,
      severity,
      ruleId
    }),
    message
  };
}

function buildQualityGateOutcomes(findings) {
  const outcomes = QUALITY_GATE_FAMILIES.map((family) => ({
    family,
    status: 'pass',
    blockingFailures: 0,
    nonBlockingFindings: 0
  }));

  for (const finding of findings) {
    const outcome = outcomes.find((item) => item.family === finding.family);
    if (!outcome) {
      continue;
    }

    if (finding.blocking) {
      outcome.blockingFailures += 1;
      continue;
    }

    outcome.nonBlockingFindings += 1;
  }

  for (const outcome of outcomes) {
    if (outcome.blockingFailures > 0) {
      outcome.status = 'failed';
      continue;
    }
    if (outcome.nonBlockingFindings > 0) {
      outcome.status = 'warnings';
    }
  }

  return outcomes;
}

function buildQualityReport({
  siteId,
  versionId,
  generatedAt,
  qualityFindings
}) {
  const findings = qualityFindings.map((finding, index) => normalizeQualityFinding(finding, index));
  const blockingFailures = findings.filter((finding) => finding.blocking);
  const releaseId = `${siteId}-${versionId}`;

  return {
    siteId,
    releaseId,
    versionId,
    generatedAt,
    status: 'completed',
    findings,
    blockingFailures,
    gateOutcomes: buildQualityGateOutcomes(findings),
    artifacts: {
      findingsJsonPath: `docs/quality/findings/${releaseId}.json`,
      reportMarkdownPath: `docs/quality/reports/${releaseId}.md`
    }
  };
}

function getContractCatalogVersion(contract) {
  if (typeof contract?.catalogVersion === 'string' && contract.catalogVersion.trim()) {
    return contract.catalogVersion.trim();
  }

  if (typeof contract?.version === 'string') {
    return contract.version.trim();
  }

  return '';
}

function isValidSourceDomain(value) {
  return SOURCE_DOMAIN_PATTERN.test(value);
}

function resolveComponentContractsForCatalogVersion(state, catalogVersion) {
  return Array.from(state.componentContracts.values()).filter((contract) => {
    return getContractCatalogVersion(contract) === catalogVersion;
  });
}

function listComponentContractVersions(state, componentContracts) {
  const contracts = Array.isArray(componentContracts)
    ? componentContracts
    : Array.from(state.componentContracts.values());

  return contracts
    .map((item) => `${item.componentId}:${item.version}`)
    .sort();
}

function listComponentContractIds(state) {
  return Array.from(state.componentContracts.values()).map((item) => item.componentId);
}

function listDuplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
      continue;
    }
    seen.add(value);
  }

  return Array.from(duplicates).sort();
}

function listDuplicateIndexes(values) {
  const counts = new Map();
  values.forEach((value) => {
    counts.set(value, (counts.get(value) || 0) + 1);
  });

  const duplicateIndexes = [];
  values.forEach((value, index) => {
    if ((counts.get(value) || 0) > 1) {
      duplicateIndexes.push(index);
    }
  });

  return duplicateIndexes;
}

function normalizeManualOverrides(overrides) {
  if (!overrides || typeof overrides !== 'object') {
    return null;
  }

  const normalized = {};
  for (const key of OVERRIDE_ARRAY_KEYS) {
    if (Array.isArray(overrides[key])) {
      normalized[key] = [...overrides[key]];
    }
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizePromptSlotDefinitions(slotDefinitions) {
  const slots = Array.isArray(slotDefinitions) ? slotDefinitions : [];
  return slots.map((slot) => ({
    slotId: typeof slot?.slotId === 'string' ? slot.slotId : '',
    sectionType: typeof slot?.sectionType === 'string' ? slot.sectionType : '',
    highImpact: slot?.highImpact === true,
    maxChars: Number.isFinite(Number(slot?.maxChars)) ? Number(slot.maxChars) : 0,
    maxLines: Number.isFinite(Number(slot?.maxLines)) ? Number(slot.maxLines) : 0,
    required: slot?.required === true,
    localeRequired: Array.isArray(slot?.localeRequired) ? [...slot.localeRequired] : []
  }));
}

function buildPromptPayloadAuditRecord({
  state,
  draftId,
  verticalStandardVersion,
  slotDefinitions,
  componentContracts
}) {
  const manualOverrides = normalizeManualOverrides(state.overridesByDraft.get(draftId));
  const disallowedPatterns = Array.isArray(manualOverrides?.excludedCompetitorPatterns)
    ? [...manualOverrides.excludedCompetitorPatterns]
    : [];

  return {
    verticalStandardVersion:
      typeof verticalStandardVersion === 'string' && verticalStandardVersion.trim()
        ? verticalStandardVersion.trim()
        : 'version-unknown',
    componentContractVersions: listComponentContractVersions(state, componentContracts),
    slotDefinitions: normalizePromptSlotDefinitions(slotDefinitions),
    manualOverrides,
    disallowedPatterns
  };
}

function countRequiredExtractionTodosForDraft(state, draftId) {
  const extractedFields = state.extractedFieldsByDraft.get(draftId) || [];
  return extractedFields.filter((field) => field.required && field.todo).length;
}

function getRuntimeLocalePriority(locale) {
  const localeIndex = COPY_REQUIRED_LOCALES.indexOf(locale);
  return localeIndex === -1 ? Number.MAX_SAFE_INTEGER : localeIndex;
}

function resolveSelectedCopyTextBySlotId(state, draftId) {
  const selections = state.copySelectionsByDraft.get(draftId) || [];
  const candidates = state.copyCandidatesByDraft.get(draftId) || [];
  const candidateById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));
  const selectedCandidateBySlotId = new Map();

  selections.forEach((selection, selectionIndex) => {
    const candidate = candidateById.get(selection.candidateId);
    if (!candidate || candidate.slotId !== selection.slotId || candidate.locale !== selection.locale) {
      return;
    }
    if (typeof candidate.text !== 'string' || !candidate.text.trim()) {
      return;
    }

    const localePriority = getRuntimeLocalePriority(candidate.locale);
    const existing = selectedCandidateBySlotId.get(candidate.slotId);
    if (
      !existing ||
      localePriority < existing.localePriority ||
      (localePriority === existing.localePriority && selectionIndex < existing.selectionIndex)
    ) {
      selectedCandidateBySlotId.set(candidate.slotId, {
        text: candidate.text,
        localePriority,
        selectionIndex
      });
    }
  });

  const selectedTextBySlotId = new Map();
  selectedCandidateBySlotId.forEach((selectedCandidate, slotId) => {
    selectedTextBySlotId.set(slotId, selectedCandidate.text);
  });
  return selectedTextBySlotId;
}

function buildRuntimeSnapshot({ state, siteId, versionId, draftId, proposalId }) {
  const snapshot = {
    siteId,
    versionId,
    draftId,
    proposalId,
    generatedAt: new Date().toISOString(),
    sections: [
      {
        sectionId: 'hero',
        componentId: 'hero',
        variant: 'split-media',
        slots: {
          h1: 'Runtime snapshot placeholder headline',
          subhead: 'Immutable runtime payload served by storage key',
          primaryCtaLabel: 'Book consultation'
        }
      },
      {
        sectionId: 'contact',
        componentId: 'cta-form',
        variant: 'default',
        slots: {
          headline: 'Contact our team',
          primaryCtaLabel: 'Book consultation'
        }
      },
      {
        sectionId: 'value_props',
        componentId: 'cards-3up',
        variant: 'icon-top',
        slots: {
          intro: 'Selected value propositions tailored to your project goals.'
        }
      },
      {
        sectionId: 'about',
        componentId: 'story-block',
        variant: 'split-content',
        slots: {
          intro: 'About section placeholder copy for immutable runtime payload.'
        }
      },
      {
        sectionId: 'process',
        componentId: 'timeline-steps',
        variant: 'numbered-steps',
        slots: {
          step1Title: 'Process step title placeholder for immutable runtime payload.'
        }
      },
      {
        sectionId: 'faq',
        componentId: 'accordion',
        variant: 'single-column',
        slots: {
          question1: 'FAQ question placeholder for immutable runtime payload.',
          answer1: 'FAQ answer placeholder for immutable runtime payload.'
        }
      }
    ]
  };

  const selectedTextBySlotId = resolveSelectedCopyTextBySlotId(state, draftId);
  for (const mapping of RUNTIME_SNAPSHOT_COPY_SLOT_MAPPINGS) {
    const selectedText = selectedTextBySlotId.get(mapping.slotId);
    if (!selectedText) {
      continue;
    }

    const section = snapshot.sections.find((item) => item.sectionId === mapping.sectionId);
    if (!section || !section.slots || typeof section.slots !== 'object') {
      continue;
    }

    section.slots[mapping.slotKey] = selectedText;
  }

  return snapshot;
}

function loadRuntimeSnapshotByStorageKey(req, storageKey) {
  const state = getState(req);
  const snapshot = state.runtimeSnapshotsByStorageKey.get(storageKey);
  if (!snapshot) {
    throw createError('Runtime snapshot not found', 404, 'runtime_snapshot_not_found');
  }

  return {
    siteId: snapshot.siteId,
    versionId: snapshot.versionId,
    storageKey,
    immutable: true,
    snapshot
  };
}

function loadRuntimeSnapshotBySiteVersion(req, siteId, versionId) {
  const state = getState(req);
  for (const [storageKey, snapshot] of state.runtimeSnapshotsByStorageKey.entries()) {
    if (snapshot?.siteId === siteId && snapshot?.versionId === versionId) {
      return {
        siteId: snapshot.siteId,
        versionId: snapshot.versionId,
        storageKey,
        immutable: true,
        snapshot
      };
    }
  }

  throw createError('Runtime snapshot not found', 404, 'runtime_snapshot_not_found');
}

function postCreateTenant(req, res, next) {
  try {
    assertInternalAdmin(req);
    const unknownTopLevelFields = Object.keys(req.body || {})
      .filter((field) => {
        return !TENANT_CREATE_ALLOWED_TOP_LEVEL_FIELDS.has(field);
      })
      .sort();
    if (unknownTopLevelFields.length > 0) {
      throw createError('tenant payload contains unknown top-level fields', 400, 'validation_error', {
        invalidField: 'payload',
        unknownFields: unknownTopLevelFields
      });
    }
    const state = getState(req);
    const tenantId = typeof req.body?.tenantId === 'string' ? req.body.tenantId : randomUUID();
    const createdAt = new Date().toISOString();

    const tenant = {
      tenantId,
      name: typeof req.body?.name === 'string' ? req.body.name : tenantId,
      slug: typeof req.body?.slug === 'string' ? req.body.slug : null,
      createdAt
    };

    state.tenants.set(tenantId, tenant);
    state.auditEvents.push({
      id: randomUUID(),
      action: 'tenant_created',
      occurredAt: createdAt,
      entityType: 'tenant',
      entityId: tenantId
    });
    res.status(201).json(tenant);
  } catch (error) {
    next(error);
  }
}

function getTenantDetail(req, res, next) {
  try {
    assertTenantMemberOrInternalAdmin(req);
    const state = getState(req);
    const tenant = state.tenants.get(req.params.tenantId);
    if (!tenant) {
      throw createError('Tenant not found', 404, 'tenant_not_found');
    }

    res.status(200).json(tenant);
  } catch (error) {
    next(error);
  }
}

function postBootstrapFromExtraction(req, res, next) {
  try {
    assertInternalAdmin(req);
    assertString(req.params.siteId, 'siteId');
    const unknownTopLevelFields = Object.keys(req.body || {})
      .filter((field) => {
        return !BOOTSTRAP_ALLOWED_TOP_LEVEL_FIELDS.has(field);
      })
      .sort();
    if (unknownTopLevelFields.length > 0) {
      throw createError('bootstrap payload contains unknown top-level fields', 400, 'validation_error', {
        invalidField: 'payload',
        unknownFields: unknownTopLevelFields
      });
    }

    const draftId = typeof req.body?.draftId === 'string' ? req.body.draftId : randomUUID();
    const extractedFieldsProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'extractedFields');
    if (extractedFieldsProvided && !Array.isArray(req.body?.extractedFields)) {
      throw createError('extractedFields must be an array when provided', 400, 'validation_error', {
        invalidField: 'extractedFields'
      });
    }
    const rawExtractedFields = Array.isArray(req.body?.extractedFields) ? req.body.extractedFields : [];
    const invalidExtractedFieldItemIndexes = rawExtractedFields.reduce((indexes, field, index) => {
      if (typeof field !== 'object' || field === null || Array.isArray(field)) {
        indexes.push(index);
      }
      return indexes;
    }, []);
    if (invalidExtractedFieldItemIndexes.length > 0) {
      throw createError('extractedFields must contain only object items', 400, 'validation_error', {
        invalidField: 'extractedFields',
        invalidItemIndexes: invalidExtractedFieldItemIndexes
      });
    }
    const invalidExtractedFieldItemFields = rawExtractedFields.reduce((items, field, index) => {
      const unknownFields = Object.keys(field)
        .filter((key) => !BOOTSTRAP_EXTRACTED_FIELD_ALLOWED_FIELDS.has(key))
        .sort();
      if (unknownFields.length > 0) {
        items.push({
          index,
          unknownFields
        });
      }
      return items;
    }, []);
    if (invalidExtractedFieldItemFields.length > 0) {
      throw createError('extractedFields items contain unknown fields', 400, 'validation_error', {
        invalidField: 'extractedFields',
        invalidItemFields: invalidExtractedFieldItemFields
      });
    }
    const invalidExtractedFieldPathItemIndexes = rawExtractedFields.reduce((indexes, field, index) => {
      if (
        Object.prototype.hasOwnProperty.call(field, 'fieldPath') &&
        (typeof field.fieldPath !== 'string' || !field.fieldPath.trim())
      ) {
        indexes.push(index);
      }
      return indexes;
    }, []);
    if (invalidExtractedFieldPathItemIndexes.length > 0) {
      throw createError('extractedFields.fieldPath must be a non-empty string when provided', 400, 'validation_error', {
        invalidField: 'extractedFields.fieldPath',
        invalidItemIndexes: invalidExtractedFieldPathItemIndexes
      });
    }
    const invalidExtractedFieldSourceUrlItemIndexes = rawExtractedFields.reduce((indexes, field, index) => {
      if (!Object.prototype.hasOwnProperty.call(field, 'sourceUrl')) {
        return indexes;
      }
      const sourceUrl = field.sourceUrl;
      const isValidSourceUrl = sourceUrl === null || (typeof sourceUrl === 'string' && sourceUrl.trim());
      if (!isValidSourceUrl) {
        indexes.push(index);
      }
      return indexes;
    }, []);
    if (invalidExtractedFieldSourceUrlItemIndexes.length > 0) {
      throw createError('extractedFields.sourceUrl must be a non-empty string or null when provided', 400, 'validation_error', {
        invalidField: 'extractedFields.sourceUrl',
        invalidItemIndexes: invalidExtractedFieldSourceUrlItemIndexes
      });
    }
    const invalidExtractedFieldMethodItemIndexes = rawExtractedFields.reduce((indexes, field, index) => {
      if (!Object.prototype.hasOwnProperty.call(field, 'method')) {
        return indexes;
      }
      const method = typeof field.method === 'string' ? field.method.trim() : '';
      if (!EXTRACTION_METHODS.has(method)) {
        indexes.push(index);
      }
      return indexes;
    }, []);
    if (invalidExtractedFieldMethodItemIndexes.length > 0) {
      throw createError(
        'extractedFields.method must be one of dom, ocr, inference, manual when provided',
        400,
        'validation_error',
        {
          invalidField: 'extractedFields.method',
          invalidItemIndexes: invalidExtractedFieldMethodItemIndexes,
          allowedMethods: Array.from(EXTRACTION_METHODS).sort()
        }
      );
    }
    const invalidExtractedFieldRequiredItemIndexes = rawExtractedFields.reduce((indexes, field, index) => {
      if (!Object.prototype.hasOwnProperty.call(field, 'required')) {
        return indexes;
      }
      if (typeof field.required !== 'boolean') {
        indexes.push(index);
      }
      return indexes;
    }, []);
    if (invalidExtractedFieldRequiredItemIndexes.length > 0) {
      throw createError('extractedFields.required must be a boolean when provided', 400, 'validation_error', {
        invalidField: 'extractedFields.required',
        invalidItemIndexes: invalidExtractedFieldRequiredItemIndexes
      });
    }
    const invalidExtractedFieldConfidenceItemIndexes = rawExtractedFields.reduce((indexes, field, index) => {
      if (!Object.prototype.hasOwnProperty.call(field, 'confidence')) {
        return indexes;
      }
      if (typeof field.confidence !== 'number' || !Number.isFinite(field.confidence)) {
        indexes.push(index);
      }
      return indexes;
    }, []);
    if (invalidExtractedFieldConfidenceItemIndexes.length > 0) {
      throw createError('extractedFields.confidence must be a number when provided', 400, 'validation_error', {
        invalidField: 'extractedFields.confidence',
        invalidItemIndexes: invalidExtractedFieldConfidenceItemIndexes
      });
    }
    const outOfRangeExtractedFieldConfidenceItemIndexes = rawExtractedFields.reduce((indexes, field, index) => {
      if (!Object.prototype.hasOwnProperty.call(field, 'confidence')) {
        return indexes;
      }
      if (field.confidence < 0 || field.confidence > 1) {
        indexes.push(index);
      }
      return indexes;
    }, []);
    if (outOfRangeExtractedFieldConfidenceItemIndexes.length > 0) {
      throw createError('extractedFields.confidence must be between 0 and 1 when provided', 400, 'validation_error', {
        invalidField: 'extractedFields.confidence',
        invalidItemIndexes: outOfRangeExtractedFieldConfidenceItemIndexes,
        allowedRange: [0, 1]
      });
    }
    const invalidExtractedFieldExtractedAtItemIndexes = rawExtractedFields.reduce((indexes, field, index) => {
      if (!Object.prototype.hasOwnProperty.call(field, 'extractedAt')) {
        return indexes;
      }
      if (typeof field.extractedAt !== 'string' || !field.extractedAt.trim()) {
        indexes.push(index);
      }
      return indexes;
    }, []);
    if (invalidExtractedFieldExtractedAtItemIndexes.length > 0) {
      throw createError('extractedFields.extractedAt must be a non-empty string when provided', 400, 'validation_error', {
        invalidField: 'extractedFields.extractedAt',
        invalidItemIndexes: invalidExtractedFieldExtractedAtItemIndexes
      });
    }
    const invalidExtractedFieldExtractedAtFormatItemIndexes = rawExtractedFields.reduce((indexes, field, index) => {
      if (!Object.prototype.hasOwnProperty.call(field, 'extractedAt')) {
        return indexes;
      }
      const extractedAt = field.extractedAt.trim();
      const parsedTimestamp = Date.parse(extractedAt);
      const isIso8601Utc =
        ISO_8601_UTC_DATETIME_PATTERN.test(extractedAt) && Number.isFinite(parsedTimestamp);
      if (!isIso8601Utc) {
        indexes.push(index);
      }
      return indexes;
    }, []);
    if (invalidExtractedFieldExtractedAtFormatItemIndexes.length > 0) {
      throw createError(
        'extractedFields.extractedAt must be an ISO-8601 datetime string when provided',
        400,
        'validation_error',
        {
          invalidField: 'extractedFields.extractedAt',
          invalidItemIndexes: invalidExtractedFieldExtractedAtFormatItemIndexes
        }
      );
    }
    const extractedFields = rawExtractedFields.map((field, index) => normalizeExtractedField(field, index));
    const requiredTodoCount = extractedFields.filter((field) => field.required && field.todo).length;
    const lowConfidenceProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'lowConfidence');
    if (lowConfidenceProvided && typeof req.body?.lowConfidence !== 'boolean') {
      throw createError('lowConfidence must be a boolean when provided', 400, 'validation_error', {
        invalidField: 'lowConfidence'
      });
    }
    const sitePolicyProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'sitePolicy');
    if (
      sitePolicyProvided &&
      (typeof req.body?.sitePolicy !== 'object' || req.body?.sitePolicy === null || Array.isArray(req.body?.sitePolicy))
    ) {
      throw createError('sitePolicy must be an object when provided', 400, 'validation_error', {
        invalidField: 'sitePolicy'
      });
    }
    const unknownSitePolicyFields = sitePolicyProvided
      ? Object.keys(req.body.sitePolicy)
          .filter((field) => !BOOTSTRAP_SITE_POLICY_ALLOWED_FIELDS.has(field))
          .sort()
      : [];
    if (unknownSitePolicyFields.length > 0) {
      throw createError('sitePolicy contains unknown fields', 400, 'validation_error', {
        invalidField: 'sitePolicy',
        unknownFields: unknownSitePolicyFields
      });
    }
    const lowConfidence = req.body?.lowConfidence === true || requiredTodoCount > 0;
    const hasSitePolicyValue = typeof req.body?.sitePolicy?.allowOwnerDraftCopyEdits !== 'undefined';
    if (hasSitePolicyValue && typeof req.body?.sitePolicy?.allowOwnerDraftCopyEdits !== 'boolean') {
      throw createError('sitePolicy.allowOwnerDraftCopyEdits must be a boolean', 400, 'validation_error', {
        invalidField: 'sitePolicy.allowOwnerDraftCopyEdits'
      });
    }
    const now = new Date().toISOString();

    const state = getState(req);
    const existingSitePolicy = state.sitePoliciesBySite.get(req.params.siteId) || {
      allowOwnerDraftCopyEdits: false
    };
    const nextSitePolicy = hasSitePolicyValue
      ? {
          ...existingSitePolicy,
          allowOwnerDraftCopyEdits: req.body.sitePolicy.allowOwnerDraftCopyEdits
        }
      : existingSitePolicy;
    state.extractedFieldsByDraft.set(draftId, extractedFields);
    state.sitePoliciesBySite.set(req.params.siteId, nextSitePolicy);
    state.reviewStatesByDraft.set(draftId, 'draft');
    state.auditEvents.push({
      id: randomUUID(),
      action: 'site_bootstrap_from_extraction',
      occurredAt: now,
      entityType: 'draft',
      entityId: draftId,
      siteId: req.params.siteId,
      lowConfidence,
      extractedFieldCount: extractedFields.length,
      requiredTodoCount,
      sitePolicy: nextSitePolicy
    });

    res.status(202).json({
      siteId: req.params.siteId,
      draftId,
      status: 'bootstrapped',
      lowConfidence,
      reviewState: 'draft',
      requiredTodoCount,
      extractedFields,
      sitePolicy: nextSitePolicy
    });
  } catch (error) {
    next(error);
  }
}

function postVerticalResearchBuild(req, res, next) {
  try {
    assertInternalAdmin(req);
    const unknownTopLevelFields = Object.keys(req.body || {})
      .filter((field) => {
        return !VERTICAL_RESEARCH_BUILD_ALLOWED_TOP_LEVEL_FIELDS.has(field);
      })
      .sort();
    if (unknownTopLevelFields.length > 0) {
      throw createError('vertical research build payload contains unknown top-level fields', 400, 'validation_error', {
        invalidField: 'payload',
        unknownFields: unknownTopLevelFields
      });
    }
    const payload = req.body || {};
    const targetCompetitorCount = payload.targetCompetitorCount;
    const sourcesProvided = Object.prototype.hasOwnProperty.call(payload, 'sources');
    if (sourcesProvided && !Array.isArray(payload.sources)) {
      throw createError('sources must be an array when provided', 400, 'validation_error', {
        invalidField: 'sources'
      });
    }
    const sources = Array.isArray(payload.sources) ? payload.sources : [];
    const sourceDomainsProvided = Object.prototype.hasOwnProperty.call(payload, 'sourceDomains');
    if (sourceDomainsProvided && !Array.isArray(payload.sourceDomains)) {
      throw createError('sourceDomains must be an array when provided', 400, 'validation_error', {
        invalidField: 'sourceDomains'
      });
    }
    const rawSourceDomains = Array.isArray(payload.sourceDomains) ? payload.sourceDomains : [];

    if (typeof targetCompetitorCount !== 'number' || !Number.isInteger(targetCompetitorCount) || targetCompetitorCount < 15) {
      throw createError('targetCompetitorCount must be >= 15', 400, 'insufficient_competitor_sample', {
        minimumTargetCompetitorCount: 15,
        receivedTargetCompetitorCount: targetCompetitorCount
      });
    }

    const invalidSources = Array.from(
      new Set(sources.filter((source) => !SUPPORTED_RESEARCH_SOURCES.has(source)))
    ).sort();
    if (!sources.length || invalidSources.length > 0) {
      throw createError('sources must use allowed research classes', 400, 'validation_error', {
        invalidSources,
        allowedSources: Array.from(SUPPORTED_RESEARCH_SOURCES).sort()
      });
    }
    const duplicateSources = Array.from(new Set(sources.filter((source, index) => sources.indexOf(source) !== index))).sort();
    if (duplicateSources.length > 0) {
      throw createError('sources must not contain duplicate values', 400, 'validation_error', {
        duplicateSources
      });
    }
    const normalizedSourceDomains = rawSourceDomains.map((domain) => {
      return typeof domain === 'string' ? domain.trim().toLowerCase() : domain;
    });
    const invalidSourceDomains = normalizedSourceDomains.filter((domain) => {
      return typeof domain !== 'string' || !domain || !isValidSourceDomain(domain);
    }).sort((left, right) => String(left).localeCompare(String(right)));
    if (invalidSourceDomains.length > 0) {
      throw createError('sourceDomains must contain valid domain hostnames when provided', 400, 'validation_error', {
        invalidSourceDomains
      });
    }
    const duplicateSourceDomains = Array.from(
      new Set(normalizedSourceDomains.filter((domain, index) => normalizedSourceDomains.indexOf(domain) !== index))
    ).sort();
    if (duplicateSourceDomains.length > 0) {
      throw createError('sourceDomains must not contain duplicate values', 400, 'validation_error', {
        duplicateSourceDomains
      });
    }
    const sourceDomains = normalizedSourceDomains;

    const state = getState(req);
    const verticalKey = req.params.verticalKey;
    const jobId = randomUUID();
    const version = new Date().toISOString().slice(0, 10).replace(/-/g, '.');
    const createdAt = new Date().toISOString();

    const standard = {
      id: randomUUID(),
      verticalKey,
      version,
      competitorCount: targetCompetitorCount,
      sourcePolicy: 'public_web_legal_selected_listings',
      iaPatterns: ['hero-value-proof-contact'],
      ctaPatterns: ['hero-primary-cta', 'contact-tail-cta'],
      trustPatterns: ['project-gallery', 'client-testimonials'],
      toneLexicon: ['credible', 'calm', 'specific'],
      doRules: ['keep structure deterministic', 'prioritize evidence-backed claims'],
      dontRules: ['do not clone competitor wording', 'do not mimic single-source layout'],
      createdAt
    };

    const patterns = [
      {
        id: randomUUID(),
        verticalStandardId: standard.id,
        sourceDomain: 'example-1.com',
        patternType: 'ia',
        patternJson: { sections: ['hero', 'portfolio', 'contact'] }
      }
    ];

    state.verticalResearch.set(verticalKey, {
      jobId,
      status: 'completed',
      requestedAt: createdAt,
      sourceDomains,
      standard,
      patterns
    });
    state.auditEvents.push({
      id: randomUUID(),
      action: 'vertical_research_build_queued',
      occurredAt: createdAt,
      entityType: 'vertical',
      entityId: verticalKey,
      competitorCount: targetCompetitorCount,
      jobId
    });

    res.status(202).json({
      verticalKey,
      jobId,
      status: 'queued'
    });
  } catch (error) {
    next(error);
  }
}

function getVerticalResearchLatest(req, res, next) {
  try {
    assertTenantMemberOrInternalAdmin(req);
    const state = getState(req);
    const latest = state.verticalResearch.get(req.params.verticalKey);

    if (!latest) {
      throw createError('Vertical research run not found', 404, 'vertical_research_not_found');
    }

    res.status(200).json({
      verticalKey: req.params.verticalKey,
      jobId: latest.jobId,
      status: latest.status,
      version: latest.standard.version,
      competitorCount: latest.standard.competitorCount,
      sourceDomains: latest.sourceDomains,
      requestedAt: latest.requestedAt
    });
  } catch (error) {
    next(error);
  }
}

function getVerticalStandardVersion(req, res, next) {
  try {
    assertTenantMemberOrInternalAdmin(req);
    const state = getState(req);
    const latest = state.verticalResearch.get(req.params.verticalKey);

    if (!latest || latest.standard.version !== req.params.version) {
      throw createError('Vertical standard not found', 404, 'vertical_standard_not_found');
    }

    res.status(200).json({
      standard: latest.standard,
      patterns: latest.patterns
    });
  } catch (error) {
    next(error);
  }
}

function getComponentContracts(req, res, next) {
  try {
    assertTenantMemberOrInternalAdmin(req);
    const state = getState(req);
    const requestedCatalogVersion =
      typeof req.query.catalogVersion === 'string' && req.query.catalogVersion.trim()
        ? req.query.catalogVersion.trim()
        : null;
    const requestedIds =
      typeof req.query.componentIds === 'string' && req.query.componentIds.trim()
        ? req.query.componentIds
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : null;

    let items = Array.from(state.componentContracts.values());
    if (requestedCatalogVersion) {
      items = items.filter((item) => getContractCatalogVersion(item) === requestedCatalogVersion);
    }
    if (requestedIds && requestedIds.length) {
      items = items.filter((item) => requestedIds.includes(item.componentId));
    }

    res.status(200).json({
      count: items.length,
      items
    });
  } catch (error) {
    next(error);
  }
}

function getComponentContractDefinition(req, res, next) {
  try {
    assertTenantMemberOrInternalAdmin(req);
    const state = getState(req);
    const key = `${req.params.componentId}:${req.params.version}`;
    const contract = state.componentContracts.get(key);

    if (!contract) {
      throw createError('Component contract not found', 404, 'component_contract_not_found');
    }

    res.status(200).json(contract);
  } catch (error) {
    next(error);
  }
}

function postComposePropose(req, res, next) {
  try {
    assertInternalAdmin(req);
    assertString(req.params.siteId, 'siteId');
    assertString(req.body?.draftId, 'draftId');
    assertString(req.body?.rulesVersion, 'rulesVersion');
    assertString(req.body?.catalogVersion, 'catalogVersion');
    assertString(req.body?.verticalStandardVersion, 'verticalStandardVersion');
    const unknownTopLevelFields = Object.keys(req.body)
      .filter((field) => {
        return !COMPOSE_PROPOSE_ALLOWED_TOP_LEVEL_FIELDS.has(field);
      })
      .sort();
    if (unknownTopLevelFields.length > 0) {
      throw createError('compose propose payload contains unknown top-level fields', 400, 'validation_error', {
        invalidField: 'payload',
        unknownFields: unknownTopLevelFields
      });
    }

    const state = getState(req);
    const componentContracts = resolveComponentContractsForCatalogVersion(state, req.body.catalogVersion);
    if (componentContracts.length === 0) {
      throw createError('component contracts not found for catalogVersion', 404, 'component_contract_not_found', {
        catalogVersion: req.body.catalogVersion
      });
    }

    const response = composeCopyService.proposeVariants({
      siteId: req.params.siteId,
      draftId: req.body.draftId,
      rulesVersion: req.body.rulesVersion,
      catalogVersion: req.body.catalogVersion,
      verticalStandardVersion: req.body.verticalStandardVersion
    });

    const now = new Date().toISOString();
    const promptPayload = buildPromptPayloadAuditRecord({
      state,
      draftId: req.body.draftId,
      verticalStandardVersion: req.body.verticalStandardVersion,
      slotDefinitions: composeCopyService.getSlotDefinitions(),
      componentContracts
    });
    state.proposalsByDraft.set(req.body.draftId, response.variants);
    state.reviewStatesByDraft.set(req.body.draftId, 'proposal_generated');
    state.auditEvents.push({
      id: randomUUID(),
      action: 'ops_proposals_generated',
      occurredAt: now,
      entityType: 'draft',
      entityId: req.body.draftId,
      siteId: req.params.siteId,
      promptPayload
    });

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

function postComposeSelect(req, res, next) {
  try {
    assertInternalAdmin(req);
    assertString(req.params.siteId, 'siteId');
    assertString(req.body?.draftId, 'draftId');
    assertString(req.body?.proposalId, 'proposalId');
    const unknownTopLevelFields = Object.keys(req.body)
      .filter((field) => {
        return !COMPOSE_SELECT_ALLOWED_TOP_LEVEL_FIELDS.has(field);
      })
      .sort();
    if (unknownTopLevelFields.length > 0) {
      throw createError('compose select payload contains unknown top-level fields', 400, 'validation_error', {
        invalidField: 'payload',
        unknownFields: unknownTopLevelFields
      });
    }

    const state = getState(req);
    const currentState = state.reviewStatesByDraft.get(req.body.draftId);
    const proposals = state.proposalsByDraft.get(req.body.draftId) || [];
    if (!proposals.length) {
      throw createError('No generated proposals available for this draft', 409, 'invalid_transition', {
        reasonCode: 'proposals_missing'
      });
    }

    const selectedProposal = proposals.find((proposal) => proposal.proposalId === req.body.proposalId);
    if (!selectedProposal) {
      throw createError('proposal not found', 404, 'proposal_not_found');
    }

    const decision = reviewTransitionGuard.evaluate({
      currentState,
      fromState: 'review_in_progress',
      toState: 'proposal_selected',
      event: 'PROPOSAL_SELECTED'
    });

    if (!decision.ok) {
      throw createError('Invalid review transition', 409, 'invalid_transition', {
        reasonCode: decision.reasonCode,
        fromState: 'review_in_progress',
        toState: 'proposal_selected'
      });
    }

    const now = new Date().toISOString();
    state.selectedProposalByDraft.set(req.body.draftId, {
      ...selectedProposal,
      selectedAt: now,
      selectedByRole: 'internal_admin'
    });
    state.reviewStatesByDraft.set(req.body.draftId, 'proposal_selected');
    state.auditEvents.push({
      id: randomUUID(),
      action: 'ops_proposal_selected',
      occurredAt: now,
      entityType: 'draft',
      entityId: req.body.draftId,
      siteId: req.params.siteId,
      proposalId: req.body.proposalId
    });

    res.status(200).json({
      siteId: req.params.siteId,
      draftId: req.body.draftId,
      proposalId: req.body.proposalId,
      variantKey: selectedProposal.variantKey,
      status: 'selected',
      reviewState: 'proposal_selected'
    });
  } catch (error) {
    next(error);
  }
}

function postCopyGenerate(req, res, next) {
  try {
    assertInternalAdmin(req);
    assertString(req.params.siteId, 'siteId');
    assertString(req.body?.draftId, 'draftId');
    const verticalStandardVersion = req.body?.verticalStandardVersion;
    if (!verticalStandardVersion || typeof verticalStandardVersion !== 'string') {
      throw createError('verticalStandardVersion is required', 400, 'validation_error', {
        invalidField: 'verticalStandardVersion',
        expectedType: 'string',
        receivedType: getValueType(verticalStandardVersion)
      });
    }
    const unknownTopLevelFields = Object.keys(req.body)
      .filter((field) => {
        return !COPY_GENERATE_ALLOWED_TOP_LEVEL_FIELDS.has(field);
      })
      .sort();
    if (unknownTopLevelFields.length > 0) {
      throw createError('copy generate payload contains unknown top-level fields', 400, 'validation_error', {
        invalidField: 'payload',
        unknownFields: unknownTopLevelFields,
        allowedTopLevelFields: Array.from(COPY_GENERATE_ALLOWED_TOP_LEVEL_FIELDS).sort()
      });
    }

    const localesProvided = Object.prototype.hasOwnProperty.call(req.body || {}, 'locales');
    if (localesProvided && !Array.isArray(req.body?.locales)) {
      throw createError('locales must be an array when provided', 400, 'validation_error', {
        invalidField: 'locales',
        expectedType: 'array',
        receivedType: getValueType(req.body?.locales)
      });
    }
    const requestedLocales = Array.isArray(req.body?.locales) ? req.body.locales : [];
    const invalidLocaleItemIndexes = requestedLocales.reduce((indexes, locale, index) => {
      if (typeof locale !== 'string') {
        indexes.push(index);
      }
      return indexes;
    }, []);
    if (invalidLocaleItemIndexes.length > 0) {
      throw createError('locales must contain only string items', 400, 'validation_error', {
        invalidField: 'locales',
        invalidItemIndexes: invalidLocaleItemIndexes,
        expectedItemType: 'string',
        receivedItemTypes: invalidLocaleItemIndexes.map((index) => getValueType(requestedLocales[index]))
      });
    }
    const duplicateLocales = Array.from(
      new Set(requestedLocales.filter((locale, index) => requestedLocales.indexOf(locale) !== index))
    ).sort();
    if (duplicateLocales.length > 0) {
      throw createError('locales must not contain duplicate values', 400, 'validation_error', {
        invalidField: 'locales',
        duplicateLocales
      });
    }
    const locales = requestedLocales;
    const unsupportedLocales = locales.filter((locale) => !COPY_LOCALES.has(locale)).sort();
    if (unsupportedLocales.length > 0) {
      throw createError('locales must contain only supported locales', 400, 'validation_error', {
        invalidField: 'locales',
        unsupportedLocales,
        allowedLocales: Array.from(COPY_LOCALES).sort()
      });
    }
    const missingLocales = COPY_REQUIRED_LOCALES.filter((locale) => !locales.includes(locale));
    if (missingLocales.length > 0) {
      throw createError('locales must include cs-CZ and en-US', 400, 'validation_error', {
        invalidField: 'locales',
        missingLocales
      });
    }
    const hasHighImpactPolicyFlag = Object.prototype.hasOwnProperty.call(
      req.body || {},
      'highImpactOnlyThreeVariants'
    );
    if (hasHighImpactPolicyFlag && req.body.highImpactOnlyThreeVariants !== true) {
      throw createError(
        'highImpactOnlyThreeVariants must be true when provided',
        400,
        'validation_error',
        {
          invalidField: 'highImpactOnlyThreeVariants',
          allowedValue: true,
          expectedType: 'boolean',
          receivedType: getValueType(req.body.highImpactOnlyThreeVariants)
        }
      );
    }

    const generation = composeCopyService.generateCopy({
      draftId: req.body.draftId,
      locales
    });

    const state = getState(req);
    const promptPayload = buildPromptPayloadAuditRecord({
      state,
      draftId: req.body.draftId,
      verticalStandardVersion,
      slotDefinitions: generation.slots
    });
    state.copySlotsByDraft.set(req.body.draftId, generation.slots);
    state.copyCandidatesByDraft.set(req.body.draftId, generation.candidates);
    state.auditEvents.push({
      id: randomUUID(),
      action: 'ops_copy_generated',
      occurredAt: new Date().toISOString(),
      entityType: 'draft',
      entityId: req.body.draftId,
      siteId: req.params.siteId,
      slotsGenerated: generation.summary.slotsGenerated,
      promptPayload
    });

    res.status(200).json(generation.summary);
  } catch (error) {
    next(error);
  }
}

function getCopySlots(req, res, next) {
  try {
    assertTenantMemberOrInternalAdmin(req);
    assertString(req.params.siteId, 'siteId');

    const draftId = req.query.draftId;
    if (typeof draftId !== 'string' || !draftId.trim()) {
      throw createError('draftId query param is required', 400, 'validation_error', {
        invalidField: 'draftId',
        expectedType: 'string',
        receivedType: getValueType(draftId)
      });
    }

    const state = getState(req);
    const slots = state.copySlotsByDraft.get(draftId) || [];

    res.status(200).json({
      draftId,
      generated: slots.length > 0,
      slots
    });
  } catch (error) {
    next(error);
  }
}

function postCopySelect(req, res, next) {
  try {
    assertString(req.params.siteId, 'siteId');
    const draftId = req.body?.draftId;
    if (typeof draftId !== 'string' || !draftId.trim()) {
      throw createError('draftId is required', 400, 'validation_error', {
        invalidField: 'draftId',
        expectedType: 'string',
        receivedType: getValueType(draftId)
      });
    }
    const unknownTopLevelFields = Object.keys(req.body)
      .filter((field) => {
        return !COPY_SELECT_ALLOWED_TOP_LEVEL_FIELDS.has(field);
      })
      .sort();
    if (unknownTopLevelFields.length > 0) {
      throw createError('copy select payload contains unknown top-level fields', 400, 'validation_error', {
        invalidField: 'payload',
        unknownFields: unknownTopLevelFields,
        allowedTopLevelFields: Array.from(COPY_SELECT_ALLOWED_TOP_LEVEL_FIELDS).sort()
      });
    }

    const state = getState(req);
    const selectedByRole = assertCopySelectActorRole(req, state, req.params.siteId);

    if (!Array.isArray(req.body?.selections)) {
      throw createError('selections array is required', 400, 'validation_error', {
        invalidField: 'selections',
        expectedType: 'array',
        receivedType: getValueType(req.body?.selections)
      });
    }
    if (req.body.selections.length === 0) {
      throw createError('selections array must contain at least one item', 400, 'validation_error', {
        invalidField: 'selections',
        minimumSelections: 1,
        receivedSelections: req.body.selections.length
      });
    }
    req.body.selections.forEach((selection, index) => assertCopySelectionShape(selection, index));
    const candidates = state.copyCandidatesByDraft.get(draftId) || [];
    const candidateById = new Map(candidates.map((candidate) => [candidate.candidateId, candidate]));

    const missingCandidateIndex = req.body.selections.findIndex((selection) => {
      return !candidateById.has(selection.candidateId);
    });

    if (missingCandidateIndex !== -1) {
      const missingCandidate = req.body.selections[missingCandidateIndex];
      throw createError('copy candidate not found', 404, 'copy_candidate_not_found', {
        invalidField: 'selections',
        selectionIndex: missingCandidateIndex,
        candidateId: missingCandidate.candidateId,
        requestedSlotId: missingCandidate.slotId,
        requestedLocale: missingCandidate.locale,
        slotId: missingCandidate.slotId,
        locale: missingCandidate.locale
      });
    }

    const mismatchedSelectionIndex = req.body.selections.findIndex((selection) => {
      const candidate = candidateById.get(selection.candidateId);
      return candidate.slotId !== selection.slotId || candidate.locale !== selection.locale;
    });

    if (mismatchedSelectionIndex !== -1) {
      const mismatchedSelection = req.body.selections[mismatchedSelectionIndex];
      const candidateTuple = candidateById.get(mismatchedSelection.candidateId);
      throw createError('selection must match candidate slotId and locale', 400, 'validation_error', {
        invalidField: 'selections',
        selectionIndex: mismatchedSelectionIndex,
        candidateId: mismatchedSelection.candidateId,
        candidateSlotId: candidateTuple.slotId,
        candidateLocale: candidateTuple.locale,
        requestedSlotId: mismatchedSelection.slotId,
        requestedLocale: mismatchedSelection.locale,
        slotId: mismatchedSelection.slotId,
        locale: mismatchedSelection.locale
      });
    }

    const firstSelectionIndexByTuple = new Map();
    const duplicateSelectionIndex = req.body.selections.findIndex((selection, selectionIndex) => {
      const tupleKey = `${selection.slotId}|${selection.locale}`;
      if (firstSelectionIndexByTuple.has(tupleKey)) {
        return true;
      }
      firstSelectionIndexByTuple.set(tupleKey, selectionIndex);
      return false;
    });

    if (duplicateSelectionIndex !== -1) {
      const duplicateSelectionTuple = req.body.selections[duplicateSelectionIndex];
      const tupleKey = `${duplicateSelectionTuple.slotId}|${duplicateSelectionTuple.locale}`;
      const firstSelectionIndex = firstSelectionIndexByTuple.get(tupleKey);
      throw createError('selection tuple must be unique per slotId and locale', 400, 'validation_error', {
        invalidField: 'selections',
        firstSelectionIndex,
        duplicateSelectionIndex,
        slotId: duplicateSelectionTuple.slotId,
        locale: duplicateSelectionTuple.locale
      });
    }

    const selectedByMismatchIndex = req.body.selections.findIndex((selection) => {
      return typeof selection.selectedBy === 'string' && selection.selectedBy !== selectedByRole;
    });
    if (selectedByMismatchIndex !== -1) {
      const selectedByMismatch = req.body.selections[selectedByMismatchIndex];
      throw createError('selection selectedBy must match authenticated actor role', 400, 'validation_error', {
        invalidField: 'selections',
        selectionIndex: selectedByMismatchIndex,
        slotId: selectedByMismatch.slotId,
        locale: selectedByMismatch.locale,
        expectedSelectedBy: selectedByRole,
        receivedSelectedBy: selectedByMismatch.selectedBy,
        selectedBy: selectedByMismatch.selectedBy,
        actorRole: selectedByRole
      });
    }

    const normalizedSelections = req.body.selections.map((selection) => ({
      slotId: selection.slotId,
      locale: selection.locale,
      candidateId: selection.candidateId,
      selectedBy: selectedByRole
    }));

    state.copySelectionsByDraft.set(draftId, normalizedSelections);
    state.auditEvents.push({
      id: randomUUID(),
      action: 'ops_copy_selected',
      occurredAt: new Date().toISOString(),
      entityType: 'draft',
      entityId: draftId,
      siteId: req.params.siteId,
      selectedCount: req.body.selections.length,
      selectedByRole
    });

    res.status(200).json({
      draftId,
      selected: req.body.selections.length,
      selectedByRole
    });
  } catch (error) {
    next(error);
  }
}

function postOverrides(req, res, next) {
  try {
    assertInternalAdmin(req);
    assertString(req.params.siteId, 'siteId');
    assertString(req.body?.draftId, 'draftId');
    const unknownTopLevelFields = Object.keys(req.body)
      .filter((field) => {
        return !OVERRIDE_ALLOWED_TOP_LEVEL_FIELDS.has(field);
      })
      .sort();
    if (unknownTopLevelFields.length > 0) {
      throw createError('Invalid override payload: contains unknown top-level fields', 400, 'invalid_override_payload', {
        invalidField: 'payload',
        unknownFields: unknownTopLevelFields,
        allowedTopLevelFields: Array.from(OVERRIDE_ALLOWED_TOP_LEVEL_FIELDS).sort()
      });
    }

    const normalizedOverrideArrays = {};

    for (const key of OVERRIDE_ARRAY_KEYS) {
      const overrideArray = req.body[key];
      if (typeof overrideArray !== 'undefined' && !Array.isArray(overrideArray)) {
        throw createError(`Invalid override payload: ${key} must be an array`, 400, 'invalid_override_payload', {
          invalidField: key,
          expectedType: 'array',
          receivedType: getValueType(overrideArray)
        });
      }

      if (Array.isArray(overrideArray)) {
        const invalidItemIndexes = overrideArray
          .map((item, index) => (typeof item !== 'string' ? index : null))
          .filter((index) => index !== null);
        if (invalidItemIndexes.length > 0) {
          throw createError(`Invalid override payload: ${key} must be an array of strings`, 400, 'invalid_override_payload', {
            invalidField: key,
            invalidItemIndexes,
            expectedItemType: 'string',
            receivedItemTypes: invalidItemIndexes.map((index) => getValueType(overrideArray[index]))
          });
        }
      }

      if (Array.isArray(overrideArray)) {
        const normalizedValues = overrideArray.map((item) => item.trim());
        const invalidIndexes = normalizedValues
          .map((value, index) => (value.length === 0 ? index : null))
          .filter((index) => index !== null);
        if (invalidIndexes.length > 0) {
          throw createError(`Invalid override payload: ${key} must not contain empty values`, 400, 'invalid_override_payload', {
            invalidField: key,
            invalidIndexes
          });
        }

        const duplicateValues = listDuplicateValues(normalizedValues);
        if (duplicateValues.length > 0) {
          throw createError(`Invalid override payload: ${key} must not contain duplicate values`, 400, 'invalid_override_payload', {
            invalidField: key,
            duplicateValues,
            duplicateIndexes: listDuplicateIndexes(normalizedValues)
          });
        }

        normalizedOverrideArrays[key] = normalizedValues;
      }
    }

    const state = getState(req);
    for (const field of OVERRIDE_SECTION_FIELDS) {
      if (!Array.isArray(normalizedOverrideArrays[field])) {
        continue;
      }

      const unknownSections = normalizedOverrideArrays[field]
        .filter((sectionKey) => {
          return !ALLOWED_OVERRIDE_SECTION_KEYS.has(sectionKey);
        })
        .sort();

      if (unknownSections.length > 0) {
        throw createError(`Invalid override payload: ${field} contains unknown section values`, 400, 'invalid_override_payload', {
          invalidField: field,
          unknownSections,
          allowedSectionKeys: Array.from(ALLOWED_OVERRIDE_SECTION_KEYS).sort()
        });
      }
    }

    const requiredSections = Array.isArray(normalizedOverrideArrays.requiredSections)
      ? normalizedOverrideArrays.requiredSections
      : [];
    const excludedSections = Array.isArray(normalizedOverrideArrays.excludedSections)
      ? normalizedOverrideArrays.excludedSections
      : [];
    const pinnedSections = Array.isArray(normalizedOverrideArrays.pinnedSections)
      ? normalizedOverrideArrays.pinnedSections
      : [];

    const conflictingRequiredExcludedSections = requiredSections.filter((sectionKey) =>
      excludedSections.includes(sectionKey)
    ).sort();
    if (conflictingRequiredExcludedSections.length > 0) {
      throw createError(
        'Invalid override payload: requiredSections and excludedSections must not overlap',
        400,
        'invalid_override_payload',
        {
          invalidField: 'requiredSections',
          conflictingSections: conflictingRequiredExcludedSections
        }
      );
    }

    const conflictingPinnedExcludedSections = pinnedSections.filter((sectionKey) =>
      excludedSections.includes(sectionKey)
    ).sort();
    if (conflictingPinnedExcludedSections.length > 0) {
      throw createError(
        'Invalid override payload: pinnedSections and excludedSections must not overlap',
        400,
        'invalid_override_payload',
        {
          invalidField: 'pinnedSections',
          conflictingSections: conflictingPinnedExcludedSections
        }
      );
    }

    if (Array.isArray(normalizedOverrideArrays.requiredComponents)) {
      const allowedComponentIds = listComponentContractIds(state).sort();
      const knownComponentIds = new Set(allowedComponentIds);
      const unknownRequiredComponents = normalizedOverrideArrays.requiredComponents.filter((componentId) => {
        return !knownComponentIds.has(componentId);
      }).sort();
      if (unknownRequiredComponents.length > 0) {
        throw createError(
          'Invalid override payload: requiredComponents contains unknown componentId values',
          400,
          'invalid_override_payload',
          {
            invalidField: 'requiredComponents',
            unknownComponentIds: unknownRequiredComponents,
            allowedComponentIds
          }
        );
      }
    }

    const nonEmptyOverrideArrayCount = OVERRIDE_ARRAY_KEYS.filter((field) => {
      return Array.isArray(normalizedOverrideArrays[field]) && normalizedOverrideArrays[field].length > 0;
    }).length;
    const hasNonEmptyOverrideDirective = nonEmptyOverrideArrayCount > 0;
    if (!hasNonEmptyOverrideDirective) {
      throw createError(
        'Invalid override payload: at least one non-empty override array is required',
        400,
        'invalid_override_payload',
        {
          fields: [...OVERRIDE_ARRAY_KEYS].sort(),
          minimumNonEmptyOverrideArrays: 1,
          receivedNonEmptyOverrideArrays: nonEmptyOverrideArrayCount
        }
      );
    }

    const reviewState = state.reviewStatesByDraft.get(req.body.draftId);
    if (reviewState !== 'review_in_progress' && reviewState !== 'proposal_selected') {
      throw createError('Invalid review transition', 409, 'invalid_transition', {
        reasonCode: 'override_state_invalid',
        requiredStates: ['review_in_progress', 'proposal_selected']
      });
    }

    const existingOverrides = state.overridesByDraft.get(req.body.draftId);
    const version = existingOverrides?.version ? Number(existingOverrides.version) + 1 : 1;
    const now = new Date().toISOString();

    state.overridesByDraft.set(req.body.draftId, {
      draftId: req.body.draftId,
      ...normalizedOverrideArrays,
      version,
      updatedByRole: 'internal_admin',
      updatedAt: now
    });
    state.auditEvents.push({
      id: randomUUID(),
      action: 'ops_overrides_stored',
      occurredAt: now,
      entityType: 'draft',
      entityId: req.body.draftId,
      siteId: req.params.siteId,
      version
    });

    res.status(200).json({
      draftId: req.body.draftId,
      status: 'stored',
      version
    });
  } catch (error) {
    next(error);
  }
}

function postReviewTransition(req, res, next) {
  try {
    assertInternalAdmin(req);
    assertString(req.params.siteId, 'siteId');
    assertString(req.body?.draftId, 'draftId');
    assertString(req.body?.fromState, 'fromState');
    assertString(req.body?.toState, 'toState');
    assertString(req.body?.event, 'event');
    const unknownTopLevelFields = Object.keys(req.body)
      .filter((field) => {
        return !REVIEW_TRANSITION_ALLOWED_TOP_LEVEL_FIELDS.has(field);
      })
      .sort();
    if (unknownTopLevelFields.length > 0) {
      throw createError('review transition payload contains unknown top-level fields', 400, 'validation_error', {
        invalidField: 'payload',
        unknownFields: unknownTopLevelFields
      });
    }

    const state = getState(req);
    const currentState = state.reviewStatesByDraft.get(req.body.draftId);
    const decision = reviewTransitionGuard.evaluate({
      currentState,
      fromState: req.body.fromState,
      toState: req.body.toState,
      event: req.body.event,
      reason: req.body.reason
    });

    if (!decision.ok) {
      throw createError('Invalid review transition', 409, 'invalid_transition', {
        reasonCode: decision.reasonCode,
        fromState: req.body.fromState,
        toState: req.body.toState
      });
    }

    state.reviewStatesByDraft.set(req.body.draftId, req.body.toState);
    state.auditEvents.push({
      id: randomUUID(),
      action: 'ops_review_transition',
      occurredAt: new Date().toISOString(),
      entityType: 'draft',
      entityId: req.body.draftId,
      siteId: req.params.siteId,
      fromState: req.body.fromState,
      toState: req.body.toState,
      event: req.body.event
    });

    res.status(200).json({
      draftId: req.body.draftId,
      fromState: req.body.fromState,
      toState: req.body.toState,
      event: req.body.event
    });
  } catch (error) {
    next(error);
  }
}

function postPublishSite(req, res, next) {
  try {
    assertInternalAdmin(req);
    assertString(req.params.siteId, 'siteId');
    assertString(req.body?.draftId, 'draftId');
    assertString(req.body?.proposalId, 'proposalId');
    const unknownTopLevelFields = Object.keys(req.body)
      .filter((field) => {
        return !PUBLISH_ALLOWED_TOP_LEVEL_FIELDS.has(field);
      })
      .sort();
    if (unknownTopLevelFields.length > 0) {
      throw createError('publish payload contains unknown top-level fields', 400, 'validation_error', {
        invalidField: 'payload',
        unknownFields: unknownTopLevelFields
      });
    }

    const state = getState(req);
    const requiredTodoCount = countRequiredExtractionTodosForDraft(state, req.body.draftId);
    if (requiredTodoCount > 0) {
      const blockedAt = new Date().toISOString();
      state.auditEvents.push({
        id: randomUUID(),
        action: 'ops_publish_blocked',
        occurredAt: blockedAt,
        entityType: 'draft',
        entityId: req.body.draftId,
        siteId: req.params.siteId,
        proposalId: req.body.proposalId,
        gateCode: 'low_confidence_review_required',
        reasons: ['low_confidence_review_required'],
        requiredTodoCount
      });

      res.status(409).json({
        siteId: req.params.siteId,
        status: 'blocked',
        code: 'low_confidence_review_required',
        reasons: ['low_confidence_review_required'],
        requiredTodoCount
      });
      return;
    }

    const qualityFindings = Array.isArray(req.body?.qualityFindings) ? [...req.body.qualityFindings] : [];
    const securityFindings = Array.isArray(req.body?.securityFindings) ? [...req.body.securityFindings] : [];

    if (req.body?.simulateQualityP0Fail === true) {
      qualityFindings.push({
        severity: 'P0',
        ruleId: 'COPY-P0-SIMULATED',
        blocking: true
      });
    }
    if (req.body?.simulateSecurityHigh === true) {
      securityFindings.push({
        severity: 'high',
        status: 'open'
      });
    }

    const gate = publishGateService.evaluate({
      qualityFindings,
      securityFindings
    });
    const reportGeneratedAt = new Date().toISOString();

    if (gate.blocked) {
      state.qualityReportsBySite.set(
        req.params.siteId,
        buildQualityReport({
          siteId: req.params.siteId,
          versionId: 'version-pending',
          generatedAt: reportGeneratedAt,
          qualityFindings
        })
      );
      state.securityReportsBySite.set(
        req.params.siteId,
        buildSecurityReport({
          siteId: req.params.siteId,
          versionId: 'version-pending',
          generatedAt: reportGeneratedAt,
          securityFindings,
          securityReasonCodes: gate.securityReasonCodes
        })
      );
      state.auditEvents.push({
        id: randomUUID(),
        action: 'ops_publish_blocked',
        occurredAt: reportGeneratedAt,
        entityType: 'draft',
        entityId: req.body.draftId,
        siteId: req.params.siteId,
        proposalId: req.body.proposalId,
        gateCode: gate.code,
        reasons: gate.reasons,
        securityReasonCodes: gate.securityReasonCodes
      });

      res.status(409).json({
        siteId: req.params.siteId,
        status: 'blocked',
        code: gate.code,
        reasons: gate.reasons,
        securityReasonCodes: gate.securityReasonCodes
      });
      return;
    }

    const versionId = randomUUID();
    const runtimeHost = normalizeHost(req.body?.host) || `${req.params.siteId}.public.vertical-studio.local`;
    const storageKey = `site-versions/${req.params.siteId}/${versionId}.json`;
    const versions = state.siteVersions.get(req.params.siteId) || [];
    for (const version of versions) {
      version.active = false;
    }

    const versionRecord = {
      versionId,
      draftId: req.body.draftId,
      proposalId: req.body.proposalId,
      storageKey,
      host: runtimeHost,
      createdAt: new Date().toISOString(),
      active: true
    };
    versions.push(versionRecord);
    state.siteVersions.set(req.params.siteId, versions);
    state.runtimeHostToSite.set(runtimeHost, req.params.siteId);
    state.runtimeSnapshotsByStorageKey.set(
      storageKey,
      buildRuntimeSnapshot({
        state,
        siteId: req.params.siteId,
        versionId,
        draftId: req.body.draftId,
        proposalId: req.body.proposalId
      })
    );
    state.qualityReportsBySite.set(
      req.params.siteId,
      buildQualityReport({
        siteId: req.params.siteId,
        versionId,
        generatedAt: reportGeneratedAt,
        qualityFindings
      })
    );
    state.securityReportsBySite.set(
      req.params.siteId,
      buildSecurityReport({
        siteId: req.params.siteId,
        versionId,
        generatedAt: reportGeneratedAt,
        securityFindings,
        securityReasonCodes: gate.securityReasonCodes
      })
    );
    state.auditEvents.push({
      id: randomUUID(),
      action: 'ops_publish_succeeded',
      occurredAt: reportGeneratedAt,
      entityType: 'site_version',
      entityId: versionId,
      siteId: req.params.siteId,
      draftId: req.body.draftId,
      proposalId: req.body.proposalId,
      securityReasonCodes: gate.securityReasonCodes
    });

    res.status(200).json({
      siteId: req.params.siteId,
      versionId,
      host: runtimeHost,
      storageKey,
      status: 'published',
      blocked: false,
      securityReasonCodes: gate.securityReasonCodes
    });
  } catch (error) {
    next(error);
  }
}

function postRollbackVersion(req, res, next) {
  try {
    assertInternalAdmin(req);
    assertString(req.params.siteId, 'siteId');
    assertString(req.params.versionId, 'versionId');
    const unknownTopLevelFields = Object.keys(req.body || {})
      .filter((field) => {
        return !ROLLBACK_ALLOWED_TOP_LEVEL_FIELDS.has(field);
      })
      .sort();
    if (unknownTopLevelFields.length > 0) {
      throw createError('rollback payload contains unknown top-level fields', 400, 'validation_error', {
        invalidField: 'payload',
        unknownFields: unknownTopLevelFields
      });
    }

    const state = getState(req);
    const versions = state.siteVersions.get(req.params.siteId) || [];
    const targetVersion = versions.find((version) => version.versionId === req.params.versionId);
    if (!targetVersion) {
      throw createError('Version not found for rollback', 404, 'runtime_version_not_found', {
        siteId: req.params.siteId,
        versionId: req.params.versionId
      });
    }

    for (const version of versions) {
      version.active = version.versionId === targetVersion.versionId;
    }

    const now = new Date().toISOString();
    state.auditEvents.push({
      id: randomUUID(),
      action: 'ops_runtime_rollback_repointed',
      occurredAt: now,
      entityType: 'site_version',
      entityId: targetVersion.versionId,
      siteId: req.params.siteId
    });

    res.status(200).json({
      siteId: req.params.siteId,
      versionId: req.params.versionId,
      status: 'rolled_back',
      activeVersionId: targetVersion.versionId
    });
  } catch (error) {
    next(error);
  }
}

function getSiteVersions(req, res, next) {
  try {
    assertTenantMemberOrInternalAdmin(req);
    const state = getState(req);
    const versions = state.siteVersions.get(req.params.siteId) || [];

    res.status(200).json({
      siteId: req.params.siteId,
      versions
    });
  } catch (error) {
    next(error);
  }
}

function getLatestQualityReport(req, res, next) {
  try {
    assertTenantMemberOrInternalAdmin(req);
    const state = getState(req);
    const latest = state.qualityReportsBySite.get(req.params.siteId);
    if (latest) {
      res.status(200).json(latest);
      return;
    }

    const gateOutcomes = QUALITY_GATE_FAMILIES.map((family) => ({
      family,
      status: 'pending',
      blockingFailures: 0,
      nonBlockingFindings: 0
    }));

    res.status(200).json({
      siteId: req.params.siteId,
      generatedAt: new Date().toISOString(),
      status: 'pending',
      blockingFailures: [],
      gateOutcomes
    });
  } catch (error) {
    next(error);
  }
}

function getLatestSecurityReport(req, res, next) {
  try {
    assertTenantMemberOrInternalAdmin(req);
    const state = getState(req);
    const latest = state.securityReportsBySite.get(req.params.siteId);
    if (latest) {
      res.status(200).json(latest);
      return;
    }

    const versions = state.siteVersions.get(req.params.siteId) || [];
    const activeVersion = versions.find((item) => item.active) || null;
    const versionId = activeVersion?.versionId || 'version-pending';
    const releaseId = `${req.params.siteId}-${versionId}`;

    res.status(200).json({
      siteId: req.params.siteId,
      releaseId,
      versionId,
      generatedAt: new Date().toISOString(),
      status: 'pending',
      findings: [],
      unresolvedFindings: [],
      severityCounts: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      gateDecision: {
        blocked: false,
        reasonCode: 'security_pass_non_blocking_only',
        unresolvedBlockingCount: 0
      },
      artifacts: {
        findingsJsonPath: `docs/security/findings/${releaseId}.json`,
        reportMarkdownPath: `docs/security/reports/${releaseId}.md`,
        gateResultJsonPath: `docs/security/gates/${releaseId}.json`
      }
    });
  } catch (error) {
    next(error);
  }
}

function getAuditEvents(req, res, next) {
  try {
    assertInternalAdmin(req);

    const state = getState(req);
    const actionFilter = normalizeOptionalString(req.query.action);
    const siteIdFilter = normalizeOptionalString(req.query.siteId);
    const entityTypeFilter = normalizeOptionalString(req.query.entityType);
    const entityIdFilter = normalizeOptionalString(req.query.entityId);

    const parsedLimit = Number(req.query.limit);
    const limit = Number.isInteger(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 100;

    const items = state.auditEvents
      .filter((event) => {
        if (actionFilter && event.action !== actionFilter) {
          return false;
        }
        if (siteIdFilter && event.siteId !== siteIdFilter) {
          return false;
        }
        if (entityTypeFilter && event.entityType !== entityTypeFilter) {
          return false;
        }
        if (entityIdFilter && event.entityId !== entityIdFilter) {
          return false;
        }
        return true;
      })
      .slice(-limit)
      .reverse();

    res.status(200).json({
      count: items.length,
      limit,
      items
    });
  } catch (error) {
    next(error);
  }
}

function getPublicRuntimeResolve(req, res, next) {
  try {
    const queryHost = req.query.host;
    const normalizedQueryHost = normalizeHost(queryHost);
    const headerHost = req.headers.host;
    const normalizedHeaderHost = normalizeHost(headerHost);
    const host = normalizedQueryHost || normalizedHeaderHost;
    if (!host) {
      const receivedHostValue = typeof queryHost !== 'undefined' ? queryHost : headerHost;
      throw createError('host is required', 400, 'validation_error', {
        invalidField: 'host',
        expectedType: 'string',
        receivedType: getValueType(receivedHostValue)
      });
    }

    const state = getState(req);
    const mappedSiteId = state.runtimeHostToSite.get(host);
    const inferredSiteId = mappedSiteId || host.split('.')[0];
    if (!inferredSiteId) {
      throw createError('Unable to resolve host to site', 404, 'runtime_site_not_found', {
        host
      });
    }

    const versions = state.siteVersions.get(inferredSiteId) || [];
    const activeVersion = versions.find((item) => item.active);
    if (!activeVersion) {
      throw createError('No active version for resolved site', 404, 'runtime_site_not_found', {
        host,
        siteId: inferredSiteId
      });
    }

    res.status(200).json({
      host,
      siteId: inferredSiteId,
      versionId: activeVersion.versionId,
      storageKey: activeVersion.storageKey
    });
  } catch (error) {
    next(error);
  }
}

function getPublicRuntimeSnapshot(req, res, next) {
  try {
    assertString(req.query.siteId, 'siteId');
    assertString(req.query.versionId, 'versionId');

    const state = getState(req);
    const versions = state.siteVersions.get(req.query.siteId) || [];
    const version = versions.find((item) => item.versionId === req.query.versionId);
    if (!version) {
      throw createError('Runtime version not found', 404, 'runtime_version_not_found');
    }

    const storageKey = normalizeOptionalString(version.storageKey);
    let response = null;
    if (storageKey) {
      try {
        response = loadRuntimeSnapshotByStorageKey(req, storageKey);
      } catch (error) {
        if (error?.code !== 'runtime_snapshot_not_found') {
          throw error;
        }
      }
    }

    if (!response) {
      response = loadRuntimeSnapshotBySiteVersion(req, req.query.siteId, req.query.versionId);
    }

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

function getPublicRuntimeSnapshotByStorageKey(req, res, next) {
  try {
    assertString(req.query.storageKey, 'storageKey');
    const response = loadRuntimeSnapshotByStorageKey(req, req.query.storageKey);
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

function postCmsPublishWebhook(req, res, next) {
  try {
    assertCmsWebhookSignature(req);
    const receivedTopLevelFields = Object.keys(req.body || {}).sort();
    const unknownTopLevelFields = receivedTopLevelFields.filter((field) => {
      return !CMS_WEBHOOK_PUBLISH_ALLOWED_TOP_LEVEL_FIELDS.has(field);
    });
    if (unknownTopLevelFields.length > 0) {
      const allowedTopLevelFieldIndexes = receivedTopLevelFields.reduce((indexes, field, index) => {
        if (CMS_WEBHOOK_PUBLISH_ALLOWED_TOP_LEVEL_FIELDS.has(field)) {
          indexes.push(index);
        }
        return indexes;
      }, []);
      const receivedAllowedTopLevelFields = allowedTopLevelFieldIndexes.map((fieldIndex) => {
        return receivedTopLevelFields[fieldIndex];
      });
      const allowedTopLevelFields = Array.from(CMS_WEBHOOK_PUBLISH_ALLOWED_TOP_LEVEL_FIELDS).sort();
      const receivedAllowedTopLevelFieldIndexes = receivedAllowedTopLevelFields.map((field) => {
        return allowedTopLevelFields.indexOf(field);
      });
      throw createError('cms publish webhook payload contains unknown top-level fields', 400, 'validation_error', {
        invalidField: 'payload',
        unknownFields: unknownTopLevelFields,
        unknownTopLevelFieldCount: unknownTopLevelFields.length,
        unknownTopLevelFieldIndexes: unknownTopLevelFields.map((field) => {
          return receivedTopLevelFields.indexOf(field);
        }),
        receivedTopLevelFieldCount: receivedTopLevelFields.length,
        receivedTopLevelFields,
        allowedTopLevelFieldIndexes,
        receivedAllowedTopLevelFields,
        receivedAllowedTopLevelFieldIndexes,
        receivedAllowedTopLevelFieldCount: allowedTopLevelFieldIndexes.length,
        allowedTopLevelFieldCount: CMS_WEBHOOK_PUBLISH_ALLOWED_TOP_LEVEL_FIELDS.size,
        allowedTopLevelFields
      });
    }
    const state = getState(req);
    const now = new Date().toISOString();
    const jobId = randomUUID();
    const siteId = normalizeOptionalString(req.body?.siteId);

    state.auditEvents.push({
      id: randomUUID(),
      action: 'cms_publish_webhook_queued',
      occurredAt: now,
      entityType: 'webhook_job',
      entityId: jobId,
      siteId
    });

    res.status(202).json({
      status: 'queued',
      jobId
    });
  } catch (error) {
    next(error);
  }
}

function postSecretRef(req, res, next) {
  try {
    assertInternalAdmin(req);
    assertNoPlaintextSecretPayload(req.body);
    const receivedTopLevelFields = Object.keys(req.body || {}).sort();
    const unknownTopLevelFields = receivedTopLevelFields.filter((field) => {
        return !SECRET_REF_ALLOWED_TOP_LEVEL_FIELDS.has(field);
      });
    if (unknownTopLevelFields.length > 0) {
      const allowedTopLevelFieldIndexes = receivedTopLevelFields.reduce((indexes, field, index) => {
        if (SECRET_REF_ALLOWED_TOP_LEVEL_FIELDS.has(field)) {
          indexes.push(index);
        }
        return indexes;
      }, []);
      const receivedAllowedTopLevelFields = allowedTopLevelFieldIndexes.map((fieldIndex) => {
        return receivedTopLevelFields[fieldIndex];
      });
      const allowedTopLevelFields = Array.from(SECRET_REF_ALLOWED_TOP_LEVEL_FIELDS).sort();
      const missingAllowedTopLevelFields = allowedTopLevelFields.filter((field) => {
        return !receivedAllowedTopLevelFields.includes(field);
      });
      const missingAllowedTopLevelFieldIndexes = missingAllowedTopLevelFields.map((field) => {
        return allowedTopLevelFields.indexOf(field);
      });
      const receivedAllowedTopLevelFieldIndexes = receivedAllowedTopLevelFields.map((field) => {
        return allowedTopLevelFields.indexOf(field);
      });
      const receivedUnknownTopLevelFields = unknownTopLevelFields;
      throw createError('secret ref payload contains unknown top-level fields', 400, 'validation_error', {
        invalidField: 'payload',
        unknownFields: unknownTopLevelFields,
        receivedUnknownTopLevelFields,
        receivedUnknownTopLevelFieldCount: receivedUnknownTopLevelFields.length,
        unknownTopLevelFieldCount: unknownTopLevelFields.length,
        unknownTopLevelFieldIndexes: unknownTopLevelFields.map((field) => {
          return receivedTopLevelFields.indexOf(field);
        }),
        receivedTopLevelFieldCount: receivedTopLevelFields.length,
        receivedTopLevelFields,
        allowedTopLevelFieldIndexes,
        receivedAllowedTopLevelFields,
        receivedAllowedTopLevelFieldIndexes,
        missingAllowedTopLevelFields,
        missingAllowedTopLevelFieldIndexes,
        missingAllowedTopLevelFieldCount: missingAllowedTopLevelFields.length,
        receivedAllowedTopLevelFieldCount: allowedTopLevelFieldIndexes.length,
        allowedTopLevelFieldCount: SECRET_REF_ALLOWED_TOP_LEVEL_FIELDS.size,
        allowedTopLevelFields
      });
    }

    const rawRef = req.body?.ref;
    const ref = normalizeOptionalString(rawRef);
    if (!ref) {
      throw createError('ref is required', 400, 'validation_error', {
        invalidField: 'ref',
        expectedType: 'string',
        receivedType: getValueType(rawRef)
      });
    }

    const refParts = parseSecretRef(ref);
    const rawTenantId = req.body?.tenantId;
    const tenantId = normalizeOptionalString(rawTenantId);
    if (!tenantId) {
      throw createError('tenantId is required', 400, 'validation_error', {
        invalidField: 'tenantId',
        expectedType: 'string',
        receivedType: getValueType(rawTenantId)
      });
    }

    const provider = assertSegment(req.body?.provider, 'provider');
    const key = assertSegment(req.body?.key, 'key');

    if (provider !== refParts.provider) {
      throw createError('provider must match ref segment', 400, 'validation_error', {
        invalidField: 'provider',
        expectedSegment: refParts.provider,
        receivedSegment: provider
      });
    }

    if (key !== refParts.key) {
      throw createError('key must match ref segment', 400, 'validation_error', {
        invalidField: 'key',
        expectedSegment: refParts.key,
        receivedSegment: key
      });
    }

    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    if (Object.prototype.hasOwnProperty.call(payload, 'tenantSlug')) {
      const tenantSlug = assertSegment(payload.tenantSlug, 'tenantSlug');
      if (tenantSlug !== refParts.tenantSlug) {
        throw createError('tenantSlug must match ref segment', 400, 'validation_error', {
          invalidField: 'tenantSlug',
          expectedSegment: refParts.tenantSlug,
          receivedSegment: tenantSlug
        });
      }
    }

    const state = getState(req);
    const now = new Date().toISOString();
    const existingMetadata = state.secretRefs.get(ref);
    if (existingMetadata && existingMetadata.tenantId !== tenantId) {
      throw createError('tenantId cannot change for an existing secret ref', 409, 'secret_ref_conflict', {
        invalidField: 'tenantId',
        expectedTenantId: existingMetadata.tenantId,
        receivedTenantId: tenantId
      });
    }

    const metadata = {
      secretRefId: existingMetadata?.secretRefId || randomUUID(),
      tenantId,
      tenantSlug: refParts.tenantSlug,
      ref,
      provider,
      key,
      label: normalizeOptionalString(req.body?.label),
      description: normalizeOptionalString(req.body?.description),
      createdAt: existingMetadata?.createdAt || now,
      updatedAt: now
    };

    state.secretRefs.set(ref, metadata);
    state.auditEvents.push({
      id: randomUUID(),
      action: existingMetadata ? 'secret_ref_updated' : 'secret_ref_created',
      occurredAt: now,
      entityType: 'secret_ref',
      entityId: metadata.secretRefId,
      tenantId,
      ref
    });

    res.status(existingMetadata ? 200 : 201).json(metadata);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  postCreateTenant,
  getTenantDetail,
  postBootstrapFromExtraction,
  postVerticalResearchBuild,
  getVerticalResearchLatest,
  getVerticalStandardVersion,
  getComponentContracts,
  getComponentContractDefinition,
  postComposePropose,
  postComposeSelect,
  postCopyGenerate,
  getCopySlots,
  postCopySelect,
  postOverrides,
  postReviewTransition,
  postPublishSite,
  postRollbackVersion,
  getSiteVersions,
  getLatestQualityReport,
  getLatestSecurityReport,
  getAuditEvents,
  getPublicRuntimeResolve,
  getPublicRuntimeSnapshot,
  getPublicRuntimeSnapshotByStorageKey,
  postCmsPublishWebhook,
  postSecretRef
};
