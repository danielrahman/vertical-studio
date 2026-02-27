const path = require('path');
const { randomUUID } = require('crypto');
const { resolveInputForJob, InputResolutionError } = require('../worker/input-resolver');

function resolveInputSource(body) {
  if (body.companyIdentifier) {
    return {
      mode: 'companyIdentifier',
      companyIdentifier: body.companyIdentifier
    };
  }

  if (body.input && body.input.path) {
    return {
      mode: 'input.path',
      path: body.input.path
    };
  }

  return {
    mode: 'input.data'
  };
}

class JobService {
  constructor(options = {}) {
    this.jobs = options.jobsRepository;
    this.extractionResults = options.extractionResultsRepository || null;
    this.extractionArtifacts = options.extractionArtifactsRepository || null;
    this.queue = options.queue;
    this.paths = options.paths;
    this.companies = options.companiesRepository;
  }

  createGenerationJob({ payload, requestId }) {
    const jobId = randomUUID();

    const outputRoot = payload.output && payload.output.rootDir
      ? path.resolve(process.cwd(), payload.output.rootDir)
      : this.paths.outputRoot;

    if (payload.companyIdentifier) {
      try {
        resolveInputForJob(
          {
            request: { companyIdentifier: payload.companyIdentifier },
            options: payload.options || {}
          },
          {
            samplesDir: path.resolve(process.cwd(), 'samples'),
            companiesRepository: this.companies
          }
        );
      } catch (error) {
        if (error instanceof InputResolutionError) {
          error.statusCode = 400;
          error.code = 'invalid_company_identifier';
        }
        throw error;
      }
    }

    const job = this.jobs.create({
      jobId,
      jobType: 'generation',
      status: 'pending',
      requestId,
      inputSource: resolveInputSource(payload),
      request: payload,
      outputDir: path.join(outputRoot, jobId)
    });

    this.queue.enqueue({ jobId, jobType: 'generation' });

    return job;
  }

  createExtractionJob({ payload, requestId }) {
    const jobId = randomUUID();
    const outputDir = path.join(this.paths.extractionDir, jobId);

    const normalized = {
      url: payload.url,
      mode: payload.mode || 'forensic',
      qualityProfile: payload.qualityProfile || 'max_quality',
      siteMapMode: payload.siteMapMode || 'template_samples',
      ignoreRobots: payload.ignoreRobots !== false,
      maxDurationMs: Number(payload.maxDurationMs || 1800000),
      budgetUsd: Number(payload.budgetUsd || 5),
      localeHints: Array.isArray(payload.localeHints) && payload.localeHints.length ? payload.localeHints : ['cs-CZ', 'en-US'],
      auth: payload.auth || { mode: 'none' },
      captcha: payload.captcha
        ? {
            enabled: payload.captcha.enabled === true,
            ...(payload.captcha.provider ? { provider: payload.captcha.provider } : {}),
            ...(payload.captcha.apiKeyRef ? { apiKeyRef: payload.captcha.apiKeyRef } : {})
          }
        : { enabled: false },
      offsite: {
        enabled: !payload.offsite || payload.offsite.enabled !== false,
        providers:
          payload.offsite && Array.isArray(payload.offsite.providers) && payload.offsite.providers.length
            ? payload.offsite.providers
            : ['exa', 'serp', 'company_data', 'social_enrichment', 'maps_reviews', 'tech_intel', 'pr_reputation'],
        ...(payload.offsite && payload.offsite.providerKeyRefs ? { providerKeyRefs: payload.offsite.providerKeyRefs } : {})
      },
      markdown: payload.markdown
        ? {
            enabled: payload.markdown.enabled !== false,
            mode: payload.markdown.mode || 'hybrid',
            remoteProvider: payload.markdown.remoteProvider || 'markdown_new',
            method: payload.markdown.method || 'auto',
            retainImages: payload.markdown.retainImages === true,
            maxDocs: Number(payload.markdown.maxDocs || 20)
          }
        : {
            enabled: true,
            mode: 'hybrid',
            remoteProvider: 'markdown_new',
            method: 'auto',
            retainImages: false,
            maxDocs: 20
          },
      companyId: payload.companyId || null,
      options: payload.options || {}
    };

    const job = this.jobs.create({
      jobId,
      jobType: 'extraction',
      status: 'pending',
      requestId,
      inputSource: {
        mode: 'extract.v3',
        url: normalized.url
      },
      progress: {
        phase: 'pending',
        ratio: 0,
        message: 'Waiting in queue'
      },
      cost: {
        budgetUsd: normalized.budgetUsd,
        totalUsd: 0,
        providers: {}
      },
      request: normalized,
      outputDir
    });

    this.queue.enqueue({ jobId, jobType: 'extraction' });
    return job;
  }

  getStatus(jobId) {
    return this.jobs.get(jobId);
  }

  listJobs() {
    return this.jobs.list();
  }
}

module.exports = {
  JobService
};
