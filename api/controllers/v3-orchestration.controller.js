const { randomUUID } = require('crypto');

const SUPPORTED_RESEARCH_SOURCES = new Set(['public_web', 'legal_pages', 'selected_listings']);
const SECRET_REF_PATTERN = /^tenant\.[a-z0-9-]+\.[a-z0-9-]+\.[a-z0-9-]+$/;

const ALLOWED_REVIEW_TRANSITIONS = new Set([
  'draft->proposal_generated',
  'proposal_generated->review_in_progress',
  'review_in_progress->proposal_selected',
  'proposal_selected->quality_checking',
  'quality_checking->security_checking',
  'quality_checking->publish_blocked',
  'security_checking->published',
  'security_checking->publish_blocked',
  'published->rollback_pending',
  'rollback_pending->rolled_back'
]);

function createError(message, statusCode, code, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  if (details) {
    error.details = details;
  }
  return error;
}

function getState(req) {
  if (!req.app.locals.v3State) {
    req.app.locals.v3State = {
      tenants: new Map(),
      verticalResearch: new Map(),
      componentContracts: new Map(),
      reviewStatesByDraft: new Map(),
      siteVersions: new Map(),
      copySlotsByDraft: new Map(),
      overridesByDraft: new Map(),
      secretRefs: new Map()
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

    res.status(200).json({
      draftId: req.body.draftId,
      variants: [
        { proposalId: randomUUID(), variantKey: 'A' },
        { proposalId: randomUUID(), variantKey: 'B' },
        { proposalId: randomUUID(), variantKey: 'C' }
      ]
    });
  } catch (error) {
    next(error);
  }
}

function postComposeSelect(req, res, next) {
  try {
    assertString(req.params.siteId, 'siteId');
    assertString(req.body?.draftId, 'draftId');
    assertString(req.body?.proposalId, 'proposalId');

    res.status(200).json({
      siteId: req.params.siteId,
      draftId: req.body.draftId,
      proposalId: req.body.proposalId,
      status: 'selected'
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

    const state = getState(req);
    const slots = [
      {
        slotId: 'hero.h1',
        sectionType: 'hero',
        highImpact: true,
        maxChars: 80,
        maxLines: 2,
        localeRequired: ['cs-CZ', 'en-US'],
        required: true
      },
      {
        slotId: 'hero.subhead',
        sectionType: 'hero',
        highImpact: true,
        maxChars: 220,
        maxLines: 4,
        localeRequired: ['cs-CZ', 'en-US'],
        required: true
      }
    ];

    state.copySlotsByDraft.set(req.body.draftId, slots);

    res.status(200).json({
      draftId: req.body.draftId,
      slotsGenerated: 28,
      highImpactSlots: 6,
      candidateCounts: {
        A: 6,
        B: 6,
        C: 6,
        SINGLE: 22
      }
    });
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

    const missingCandidate = req.body.selections.find(
      (selection) => typeof selection?.candidateId !== 'string' || !selection.candidateId
    );

    if (missingCandidate) {
      throw createError('copy candidate not found', 404, 'copy_candidate_not_found');
    }

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
    }

    const state = getState(req);
    state.overridesByDraft.set(req.body.draftId, {
      ...req.body,
      updatedAt: new Date().toISOString()
    });

    res.status(200).json({
      draftId: req.body.draftId,
      status: 'stored'
    });
  } catch (error) {
    next(error);
  }
}

function postReviewTransition(req, res, next) {
  try {
    assertString(req.params.siteId, 'siteId');
    assertString(req.body?.draftId, 'draftId');
    assertString(req.body?.fromState, 'fromState');
    assertString(req.body?.toState, 'toState');
    assertString(req.body?.event, 'event');

    const transitionKey = `${req.body.fromState}->${req.body.toState}`;
    if (!ALLOWED_REVIEW_TRANSITIONS.has(transitionKey)) {
      throw createError('Invalid review transition', 409, 'invalid_transition');
    }

    const state = getState(req);
    state.reviewStatesByDraft.set(req.body.draftId, req.body.toState);

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
    assertString(req.params.siteId, 'siteId');
    assertString(req.body?.draftId, 'draftId');
    assertString(req.body?.proposalId, 'proposalId');

    if (req.body?.simulateQualityP0Fail === true) {
      res.status(409).json({
        siteId: req.params.siteId,
        status: 'blocked',
        code: 'publish_blocked_quality',
        reasons: ['quality_p0_failed']
      });
      return;
    }

    if (req.body?.simulateSecurityHigh === true) {
      res.status(409).json({
        siteId: req.params.siteId,
        status: 'blocked',
        code: 'publish_blocked_security',
        reasons: ['security_high_found']
      });
      return;
    }

    const versionId = randomUUID();
    const state = getState(req);
    const versions = state.siteVersions.get(req.params.siteId) || [];

    versions.push({
      versionId,
      draftId: req.body.draftId,
      proposalId: req.body.proposalId,
      createdAt: new Date().toISOString(),
      active: true
    });
    state.siteVersions.set(req.params.siteId, versions);

    res.status(200).json({
      siteId: req.params.siteId,
      versionId,
      status: 'published',
      blocked: false
    });
  } catch (error) {
    next(error);
  }
}

function postRollbackVersion(req, res, next) {
  try {
    assertString(req.params.siteId, 'siteId');
    assertString(req.params.versionId, 'versionId');

    res.status(202).json({
      siteId: req.params.siteId,
      versionId: req.params.versionId,
      status: 'rollback_pending'
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
    res.status(200).json({
      siteId: req.params.siteId,
      generatedAt: new Date().toISOString(),
      status: 'pending',
      blockingFailures: []
    });
  } catch (error) {
    next(error);
  }
}

function getLatestSecurityReport(req, res, next) {
  try {
    res.status(200).json({
      siteId: req.params.siteId,
      generatedAt: new Date().toISOString(),
      status: 'pending',
      unresolvedFindings: []
    });
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
    const ref = req.body?.ref;
    if (typeof ref !== 'string' || !SECRET_REF_PATTERN.test(ref)) {
      throw createError(
        'ref must match tenant.<slug>.<provider>.<key>',
        400,
        'validation_error',
        { field: 'ref' }
      );
    }

    const state = getState(req);
    const metadata = {
      tenantId: typeof req.body?.tenantId === 'string' ? req.body.tenantId : null,
      ref,
      provider: typeof req.body?.provider === 'string' ? req.body.provider : null,
      key: typeof req.body?.key === 'string' ? req.body.key : null,
      updatedAt: new Date().toISOString()
    };

    state.secretRefs.set(ref, metadata);

    res.status(201).json(metadata);
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
  postCmsPublishWebhook,
  postSecretRef
};
