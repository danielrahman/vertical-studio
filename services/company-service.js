const { ExtractionError } = require('../extraction/errors');

function isoNow() {
  return new Date().toISOString();
}

function appendHistory(existing, entry) {
  const list = Array.isArray(existing) ? [...existing] : [];
  list.push(entry);
  return list.slice(-40);
}

function buildExtractionPayload({ websiteUrl, extraction = {}, companyId, companyContext = {} }) {
  const offsite = extraction.offsite || {};
  return {
    url: websiteUrl,
    mode: extraction.mode || 'forensic',
    qualityProfile: extraction.qualityProfile || 'max_quality',
    siteMapMode: extraction.siteMapMode || 'template_samples',
    ignoreRobots: extraction.ignoreRobots !== false,
    budgetUsd: Number(extraction.budgetUsd || 5),
    maxDurationMs: Number(extraction.maxDurationMs || 1800000),
    localeHints: Array.isArray(extraction.localeHints) && extraction.localeHints.length ? extraction.localeHints : ['cs-CZ', 'en-US'],
    auth: extraction.auth || { mode: 'none' },
    captcha: extraction.captcha || { enabled: false },
    offsite: {
      enabled: offsite.enabled !== false,
      providers: Array.isArray(offsite.providers) && offsite.providers.length ? offsite.providers : undefined,
      providerKeyRefs: offsite.providerKeyRefs || undefined
    },
    markdown: extraction.markdown || {
      enabled: true,
      mode: 'hybrid',
      remoteProvider: 'markdown_new',
      method: 'auto',
      retainImages: false,
      maxDocs: 20
    },
    companyId,
    options: {
      companyContext
    }
  };
}

class CompanyService {
  constructor(options = {}) {
    this.companies = options.companiesRepository;
    this.jobService = options.jobService || null;
    this.jobsRepository = options.jobsRepository || null;
    this.logger = options.logger;
  }

  enqueueCompanyExtraction({ company, extractionConfig = {}, requestId = null }) {
    if (!this.jobService) {
      throw new ExtractionError('Job service is not configured for async extraction', 500, 'missing_job_service');
    }

    const payload = buildExtractionPayload({
      websiteUrl: company.websiteUrl,
      extraction: extractionConfig,
      companyId: company.id,
      companyContext: {
        companyId: company.id,
        name: company.name,
        brandSlug: company.brandSlug,
        locale: company.locale,
        industry: company.industry
      }
    });

    return this.jobService.createExtractionJob({
      payload,
      requestId
    });
  }

  async createCompany(payload, requestId = null) {
    const normalizedInput = payload.inputData || null;
    const extractionEnabled = Boolean(payload.websiteUrl) && (!payload.extraction || payload.extraction.enabled !== false);

    let created = this.companies.create({
      name: payload.name || null,
      brandSlug: payload.brandSlug || null,
      locale: payload.locale || null,
      industry: payload.industry || null,
      websiteUrl: payload.websiteUrl || null,
      source: payload.websiteUrl ? { websiteUrl: payload.websiteUrl } : null,
      normalizedInput,
      extractionStatus: extractionEnabled ? 'queued' : 'none',
      extractionUpdatedAt: extractionEnabled ? isoNow() : null
    });

    let extractionJobId = null;
    if (extractionEnabled) {
      const job = this.enqueueCompanyExtraction({
        company: created,
        extractionConfig: payload.extraction || {},
        requestId
      });

      extractionJobId = job.jobId;
      created = this.companies.update(created.id, {
        extractionJobId,
        extractionUpdatedAt: isoNow(),
        extractionHistory: appendHistory(created.extractionHistory, {
          type: 'queued',
          extractionJobId,
          timestamp: isoNow()
        })
      });
    }

    return {
      ...created,
      warnings: [],
      extractionJobId
    };
  }

  async updateCompany(id, patch, requestId = null) {
    const existing = this.companies.getById(id);
    if (!existing) {
      return null;
    }

    const updates = {
      ...patch
    };

    if (Object.prototype.hasOwnProperty.call(patch, 'inputData')) {
      updates.normalizedInput = patch.inputData;
      delete updates.inputData;
      updates.extractionStatus = 'manual';
      updates.extractionUpdatedAt = isoNow();
    }

    const retrigger = Boolean(patch.retriggerExtraction);
    delete updates.retriggerExtraction;

    const extractionConfig = patch.extraction || null;
    delete updates.extraction;

    const websiteUrl = patch.websiteUrl || existing.websiteUrl;
    if (retrigger && !websiteUrl) {
      throw new ExtractionError('Cannot retrigger extraction without websiteUrl', 400, 'missing_website_url');
    }

    const updated = this.companies.update(id, updates);
    if (!updated) {
      return null;
    }

    let next = updated;
    let extractionJobId = null;
    if (retrigger) {
      const companyForExtraction = {
        ...updated,
        websiteUrl
      };
      const job = this.enqueueCompanyExtraction({
        company: companyForExtraction,
        extractionConfig: extractionConfig || {},
        requestId
      });
      extractionJobId = job.jobId;
      next = this.companies.update(id, {
        websiteUrl,
        extractionStatus: 'queued',
        extractionJobId,
        extractionUpdatedAt: isoNow(),
        extractionHistory: appendHistory(updated.extractionHistory, {
          type: 'queued',
          extractionJobId,
          timestamp: isoNow()
        })
      });
    }

    return {
      ...next,
      warnings: [],
      extractionJobId
    };
  }

  listCompanies() {
    return this.companies.list();
  }

  getCompanyExtraction(companyId) {
    const company = this.companies.getById(companyId);
    if (!company) {
      return null;
    }

    const jobId = company.extractionJobId;
    const job = jobId
      ? this.jobsRepository
        ? this.jobsRepository.get(jobId)
        : this.jobService
        ? this.jobService.getStatus(jobId)
        : null
      : null;

    return {
      companyId: company.id,
      extractionStatus: company.extractionStatus,
      extractionJobId: jobId,
      extractionUpdatedAt: company.extractionUpdatedAt || null,
      job: job
        ? {
            jobId: job.jobId,
            status: job.status,
            progress: job.progress || null,
            cost: job.cost || null,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
            finishedAt: job.finishedAt
          }
        : null
    };
  }
}

module.exports = {
  CompanyService
};
