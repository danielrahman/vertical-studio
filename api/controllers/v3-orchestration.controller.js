const { randomUUID } = require('crypto');
const { ReviewTransitionGuardService } = require('../../services/review-transition-guard-service');
const { ComposeCopyService } = require('../../services/compose-copy-service');
const { PublishGateService } = require('../../services/publish-gate-service');

const SUPPORTED_RESEARCH_SOURCES = new Set(['public_web', 'legal_pages', 'selected_listings']);
const QUALITY_GATE_FAMILIES = ['COPY', 'LAYOUT', 'MEDIA', 'LEGAL'];
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

function getState(req) {
  if (!req.app.locals.v3State) {
    req.app.locals.v3State = {
      tenants: new Map(),
      verticalResearch: new Map(),
      componentContracts: new Map(),
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
      secretRefs: new Map(),
      auditEvents: []
    };

    const heroContract = {
      componentId: 'hero',
      version: '1.0.0',
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

    req.app.locals.v3State.componentContracts.set('hero:1.0.0', heroContract);
  }

  return req.app.locals.v3State;
}

function assertString(value, fieldName) {
  if (!value || typeof value !== 'string') {
    throw createError(`${fieldName} is required`, 400, 'validation_error');
  }
}

function assertSegment(value, fieldName) {
  if (typeof value !== 'string' || !SECRET_REF_SEGMENT_PATTERN.test(value)) {
    throw createError(`${fieldName} must contain only lowercase letters, numbers, and hyphen`, 400, 'validation_error', {
      field: fieldName
    });
  }

  return value;
}

function parseSecretRef(ref) {
  const match = SECRET_REF_PATTERN.exec(ref);
  if (!match) {
    throw createError('ref must match tenant.<slug>.<provider>.<key>', 400, 'validation_error', { field: 'ref' });
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

function assertNoPlaintextSecretPayload(body) {
  const payload = body && typeof body === 'object' ? body : {};
  const forbiddenField = SECRET_VALUE_KEYS.find((field) => Object.hasOwn(payload, field));

  if (forbiddenField) {
    throw createError('plaintext secret values are not allowed in metadata payloads', 400, 'validation_error', {
      field: forbiddenField
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

function buildRuntimeSnapshot({ siteId, versionId, draftId, proposalId }) {
  return {
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
          subhead: 'Immutable runtime payload served by storage key'
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
      }
    ]
  };
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

function postCreateTenant(req, res, next) {
  try {
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
    res.status(201).json(tenant);
  } catch (error) {
    next(error);
  }
}

function getTenantDetail(req, res, next) {
  try {
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
    assertString(req.params.siteId, 'siteId');

    const draftId = typeof req.body?.draftId === 'string' ? req.body.draftId : randomUUID();
    const lowConfidence = Boolean(req.body?.lowConfidence);

    res.status(202).json({
      siteId: req.params.siteId,
      draftId,
      status: 'bootstrapped',
      lowConfidence,
      reviewState: 'draft'
    });
  } catch (error) {
    next(error);
  }
}

function postVerticalResearchBuild(req, res, next) {
  try {
    const targetCompetitorCount = Number(req.body?.targetCompetitorCount);
    const sources = Array.isArray(req.body?.sources) ? req.body.sources : [];

    if (!Number.isInteger(targetCompetitorCount) || targetCompetitorCount < 15) {
      throw createError('targetCompetitorCount must be >= 15', 400, 'insufficient_competitor_sample');
    }

    if (!sources.length || sources.some((source) => !SUPPORTED_RESEARCH_SOURCES.has(source))) {
      throw createError('sources must use allowed research classes', 400, 'validation_error');
    }

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
      sourceDomains: Array.isArray(req.body?.sourceDomains) ? req.body.sourceDomains : [],
      standard,
      patterns
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
    const state = getState(req);
    const requestedIds =
      typeof req.query.componentIds === 'string' && req.query.componentIds.trim()
        ? req.query.componentIds
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : null;

    let items = Array.from(state.componentContracts.values());
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
    assertString(req.params.siteId, 'siteId');
    assertString(req.body?.draftId, 'draftId');
    assertString(req.body?.rulesVersion, 'rulesVersion');
    assertString(req.body?.catalogVersion, 'catalogVersion');
    assertString(req.body?.verticalStandardVersion, 'verticalStandardVersion');

    const response = composeCopyService.proposeVariants({
      siteId: req.params.siteId,
      draftId: req.body.draftId,
      rulesVersion: req.body.rulesVersion,
      catalogVersion: req.body.catalogVersion,
      verticalStandardVersion: req.body.verticalStandardVersion
    });

    const state = getState(req);
    const now = new Date().toISOString();
    state.proposalsByDraft.set(req.body.draftId, response.variants);
    state.reviewStatesByDraft.set(req.body.draftId, 'proposal_generated');
    state.auditEvents.push({
      id: randomUUID(),
      action: 'ops_proposals_generated',
      occurredAt: now,
      entityType: 'draft',
      entityId: req.body.draftId,
      siteId: req.params.siteId
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
    assertString(req.params.siteId, 'siteId');
    assertString(req.body?.draftId, 'draftId');

    const locales = Array.isArray(req.body?.locales) ? req.body.locales : [];
    if (!locales.includes('cs-CZ') || !locales.includes('en-US')) {
      throw createError('locales must include cs-CZ and en-US', 400, 'validation_error');
    }

    const generation = composeCopyService.generateCopy({
      draftId: req.body.draftId,
      locales
    });

    const state = getState(req);
    state.copySlotsByDraft.set(req.body.draftId, generation.slots);
    state.copyCandidatesByDraft.set(req.body.draftId, generation.candidates);

    res.status(200).json(generation.summary);
  } catch (error) {
    next(error);
  }
}

function getCopySlots(req, res, next) {
  try {
    assertString(req.params.siteId, 'siteId');

    if (typeof req.query.draftId !== 'string' || !req.query.draftId) {
      throw createError('draftId query param is required', 400, 'validation_error');
    }

    const state = getState(req);
    const slots = state.copySlotsByDraft.get(req.query.draftId) || [];

    res.status(200).json({
      draftId: req.query.draftId,
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
    assertString(req.body?.draftId, 'draftId');

    if (!Array.isArray(req.body?.selections)) {
      throw createError('selections array is required', 400, 'validation_error');
    }

    const state = getState(req);
    const candidates = state.copyCandidatesByDraft.get(req.body.draftId) || [];
    const candidateIds = new Set(candidates.map((candidate) => candidate.candidateId));

    const missingCandidate = req.body.selections.find((selection) => {
      return typeof selection?.candidateId !== 'string' || !candidateIds.has(selection.candidateId);
    });

    if (missingCandidate) {
      throw createError('copy candidate not found', 404, 'copy_candidate_not_found');
    }

    state.copySelectionsByDraft.set(req.body.draftId, req.body.selections);

    res.status(200).json({
      draftId: req.body.draftId,
      selected: req.body.selections.length
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

    const listKeys = [
      'tone',
      'keywords',
      'requiredSections',
      'excludedSections',
      'pinnedSections',
      'requiredComponents',
      'excludedCompetitorPatterns'
    ];

    for (const key of listKeys) {
      if (typeof req.body[key] !== 'undefined' && !Array.isArray(req.body[key])) {
        throw createError(`Invalid override payload: ${key} must be an array`, 400, 'invalid_override_payload');
      }

      if (Array.isArray(req.body[key]) && req.body[key].some((item) => typeof item !== 'string')) {
        throw createError(`Invalid override payload: ${key} must be an array of strings`, 400, 'invalid_override_payload');
      }
    }

    const state = getState(req);
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
      ...req.body,
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
    if (gate.blocked) {
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
    const state = getState(req);
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
        siteId: req.params.siteId,
        versionId,
        draftId: req.body.draftId,
        proposalId: req.body.proposalId
      })
    );

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
    const state = getState(req);
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
    const host = normalizeHost(req.query.host) || normalizeHost(req.headers.host);
    if (!host) {
      throw createError('host is required', 400, 'validation_error', {
        field: 'host'
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

    const response = loadRuntimeSnapshotByStorageKey(req, version.storageKey);
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
    res.status(202).json({
      status: 'queued',
      jobId: randomUUID()
    });
  } catch (error) {
    next(error);
  }
}

function postSecretRef(req, res, next) {
  try {
    assertInternalAdmin(req);
    assertNoPlaintextSecretPayload(req.body);

    const ref = normalizeOptionalString(req.body?.ref);
    if (!ref) {
      throw createError('ref is required', 400, 'validation_error', { field: 'ref' });
    }

    const refParts = parseSecretRef(ref);
    const tenantId = normalizeOptionalString(req.body?.tenantId);
    if (!tenantId) {
      throw createError('tenantId is required', 400, 'validation_error', { field: 'tenantId' });
    }

    const provider = assertSegment(normalizeOptionalString(req.body?.provider), 'provider');
    const key = assertSegment(normalizeOptionalString(req.body?.key), 'key');

    if (provider !== refParts.provider) {
      throw createError('provider must match ref segment', 400, 'validation_error', {
        field: 'provider'
      });
    }

    if (key !== refParts.key) {
      throw createError('key must match ref segment', 400, 'validation_error', {
        field: 'key'
      });
    }

    const providedTenantSlug = normalizeOptionalString(req.body?.tenantSlug);
    if (providedTenantSlug !== null && assertSegment(providedTenantSlug, 'tenantSlug') !== refParts.tenantSlug) {
      throw createError('tenantSlug must match ref segment', 400, 'validation_error', {
        field: 'tenantSlug'
      });
    }

    const state = getState(req);
    const now = new Date().toISOString();
    const existingMetadata = state.secretRefs.get(ref);
    if (existingMetadata && existingMetadata.tenantId !== tenantId) {
      throw createError('tenantId cannot change for an existing secret ref', 409, 'secret_ref_conflict', {
        field: 'tenantId'
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
