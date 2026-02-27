const { DeepResearchExtractor } = require('../extraction/deep');
const { toLegacyExtractedData } = require('../extraction/extractor');
const { TemplateFallbackEnrichmentProvider } = require('../extraction/ai-enrichment-provider');
const { CompanyInputNormalizer } = require('../extraction/normalizer');

class CancelledError extends Error {
  constructor() {
    super('Extraction job cancelled');
    this.code = 'EXTRACTION_JOB_CANCELLED';
  }
}

class ExtractionJobProcessor {
  constructor(options = {}) {
    this.jobStore = options.jobStore;
    this.logger = options.logger;
    this.paths = options.paths;
    this.repositories = options.repositories;
    this.secretStore = options.secretStore;
    this.normalizer = options.normalizer || new CompanyInputNormalizer(options);
    this.fallbackEnrichment = options.fallbackEnrichment || new TemplateFallbackEnrichmentProvider(options);
    this.extractor =
      options.extractor ||
      new DeepResearchExtractor({
        paths: this.paths,
        secretStore: this.secretStore,
        artifactsRepo: this.repositories && this.repositories.extractionArtifacts,
        logger: this.logger
      });
  }

  static appendHistory(existing, entry) {
    const list = Array.isArray(existing) ? [...existing] : [];
    list.push(entry);
    return list.slice(-40);
  }

  getJob(jobId) {
    return this.jobStore.get(jobId);
  }

  ensureNotCancelled(jobId) {
    const current = this.getJob(jobId);
    if (current && current.status === 'cancelled') {
      throw new CancelledError();
    }
  }

  syncPhaseTransition(jobId, phase) {
    const map = {
      discovering: 'discovering',
      crawling: 'crawling',
      rendering: 'rendering',
      offsite: 'offsite',
      synthesizing: 'synthesizing'
    };

    const targetStatus = map[phase];
    if (!targetStatus) {
      return;
    }

    const current = this.getJob(jobId);
    if (!current || current.status === targetStatus) {
      return;
    }

    try {
      this.jobStore.transition(jobId, targetStatus);
    } catch (_error) {
      // Keep progress updates even when status transition was already advanced.
    }
  }

  async process(jobId) {
    this.ensureNotCancelled(jobId);

    const initial = this.getJob(jobId);
    if (!initial) {
      return;
    }

    if (initial.status === 'pending') {
      this.jobStore.transition(jobId, 'discovering');
    }

    const progress = (payload) => {
      if (!payload || typeof payload !== 'object') {
        return;
      }

      this.ensureNotCancelled(jobId);
      this.syncPhaseTransition(jobId, payload.phase);

      const current = this.getJob(jobId);
      const patch = {
        progress: {
          phase: payload.phase || (current.progress && current.progress.phase) || 'running',
          ratio: typeof payload.ratio === 'number' ? payload.ratio : current.progress && current.progress.ratio,
          message: payload.message || (current.progress && current.progress.message) || null,
          elapsedMs: payload.elapsedMs || (current.progress && current.progress.elapsedMs) || null
        }
      };

      if (payload.cost) {
        patch.cost = payload.cost;
      }

      this.jobStore.update(jobId, patch);
    };

    try {
      const job = this.getJob(jobId);
      const result = await this.extractor.run(
        {
          ...job.request,
          jobId
        },
        progress
      );

      this.repositories.extractionResults.upsert(jobId, result);

      const companyId = job && job.request ? job.request.companyId : null;
      if (companyId && this.repositories && this.repositories.companies) {
        const company = this.repositories.companies.getById(companyId);
        if (company) {
          const extractedData = toLegacyExtractedData(result);
          const enrichment = await this.fallbackEnrichment.enrich(extractedData, {
            companyName: company.name,
            brandSlug: company.brandSlug,
            locale: company.locale || 'en-US',
            industry: company.industry || 'boutique_developer',
            websiteUrl: company.websiteUrl || job.request.url
          });

          const normalizedInput = this.normalizer.normalize({
            extractedData,
            enrichment,
            context: {
              companyName: company.name,
              brandSlug: company.brandSlug,
              locale: company.locale || 'en-US',
              industry: company.industry || 'boutique_developer',
              websiteUrl: company.websiteUrl || job.request.url
            }
          });

          this.repositories.companies.update(companyId, {
            source: {
              ...(company.source || {}),
              websiteUrl: company.websiteUrl || job.request.url,
              extractedData,
              enrichment,
              researchV3: result,
              lastExtractionJobId: jobId
            },
            normalizedInput,
            extractionStatus: Array.isArray(result.warnings) && result.warnings.length ? 'done_with_warnings' : 'done',
            extractionJobId: jobId,
            extractionUpdatedAt: new Date().toISOString(),
            extractionHistory: ExtractionJobProcessor.appendHistory(company.extractionHistory, {
              type: 'completed',
              extractionJobId: jobId,
              timestamp: new Date().toISOString()
            })
          });
        }
      }

      this.jobStore.update(jobId, {
        result: {
          extractionResultStored: true,
          warnings: result.warnings,
          coverage: result.coverage,
          cost: result.cost
        },
        cost: result.cost,
        progress: {
          phase: 'completed',
          ratio: 1,
          message: 'Extraction completed'
        }
      });

      this.jobStore.transition(jobId, 'completed');
    } catch (error) {
      if (error instanceof CancelledError || error.code === 'EXTRACTION_JOB_CANCELLED') {
        const current = this.getJob(jobId);
        if (current && current.status !== 'cancelled') {
          try {
            this.jobStore.transition(jobId, 'cancelled');
          } catch (_transitionError) {
            // No-op.
          }
        }

        this.jobStore.update(jobId, {
          progress: {
            phase: 'cancelled',
            ratio: 1,
            message: 'Extraction cancelled'
          }
        });

        const cancelledJob = this.getJob(jobId);
        const companyId = cancelledJob && cancelledJob.request ? cancelledJob.request.companyId : null;
        if (companyId && this.repositories && this.repositories.companies) {
          const company = this.repositories.companies.getById(companyId);
          if (company) {
            this.repositories.companies.update(companyId, {
              extractionStatus: 'cancelled',
              extractionJobId: jobId,
              extractionUpdatedAt: new Date().toISOString(),
              extractionHistory: ExtractionJobProcessor.appendHistory(company.extractionHistory, {
                type: 'cancelled',
                extractionJobId: jobId,
                timestamp: new Date().toISOString()
              })
            });
          }
        }
        return;
      }

      try {
        this.jobStore.transition(jobId, 'failed');
      } catch (_transitionError) {
        // No-op.
      }

      this.jobStore.update(jobId, {
        error: {
          code: 'extraction_failed',
          message: error.message
        },
        progress: {
          phase: 'failed',
          ratio: 1,
          message: error.message
        }
      });

      const failedJob = this.getJob(jobId);
      const failedCompanyId = failedJob && failedJob.request ? failedJob.request.companyId : null;
      if (failedCompanyId && this.repositories && this.repositories.companies) {
        const company = this.repositories.companies.getById(failedCompanyId);
        if (company) {
          this.repositories.companies.update(failedCompanyId, {
            extractionStatus: 'failed',
            extractionUpdatedAt: new Date().toISOString(),
            extractionJobId: jobId,
            extractionHistory: ExtractionJobProcessor.appendHistory(company.extractionHistory, {
              type: 'failed',
              extractionJobId: jobId,
              message: error.message,
              timestamp: new Date().toISOString()
            })
          });
        }
      }

      if (this.logger) {
        this.logger.warn('Extraction job failed', {
          jobId,
          error: error.message
        });
      }
    }
  }
}

module.exports = {
  ExtractionJobProcessor,
  CancelledError
};
