const path = require('path');
const { GeneratorEngine } = require('../engine/generator');
const { resolveInputForJob, InputResolutionError } = require('./input-resolver');
const { ExtractionJobProcessor } = require('./extraction-job-processor');

class JobProcessor {
  constructor(options) {
    this.jobStore = options.jobStore;
    this.queue = options.queue;
    this.logger = options.logger;
    this.paths = options.paths;
    this.repositories = options.repositories || null;
    this.secretStore = options.secretStore || null;
    this.generator = options.generator || new GeneratorEngine();

    this.extractionProcessor =
      options.extractionProcessor ||
      new ExtractionJobProcessor({
        jobStore: this.jobStore,
        logger: this.logger,
        paths: this.paths,
        repositories: this.repositories,
        secretStore: this.secretStore
      });
  }

  async processGenerationJob(jobId) {
    let job = this.jobStore.get(jobId);
    if (!job) {
      this.logger.warn('Dequeued generation job is missing in job store', { jobId });
      return;
    }

    if (job.status !== 'pending') {
      this.logger.warn('Skipping non-pending generation job', {
        jobId,
        status: job.status
      });
      return;
    }

    this.jobStore.transition(jobId, 'processing');

    job = this.jobStore.get(jobId);
    const resolved = resolveInputForJob(job, {
      samplesDir: path.resolve(process.cwd(), 'samples'),
      companiesRepository: this.repositories ? this.repositories.companies : null
    });

    const requestOptions = (job.request && job.request.options) || {};
    const generationOptions = {
      previewBaseUrl: requestOptions.previewBaseUrl || undefined,
      customizationLevel: requestOptions.customizationLevel || undefined
    };

    const result = resolved.inputPath
      ? this.generator.generate(resolved.inputPath, job.outputDir, generationOptions)
      : this.generator.generateFromObject(resolved.inputObject, job.outputDir, generationOptions);

    if (!result.success) {
      this.jobStore.transition(jobId, 'failed');
      this.jobStore.update(jobId, {
        error: {
          code: 'generation_failed',
          message: result.error || 'Generation failed',
          details: result.errors || []
        }
      });
      return;
    }

    const patch = {
      inputSource: {
        ...(job.inputSource || {}),
        resolvedAs: resolved.mode,
        source: resolved.source
      },
      siteMeta: {
        companyName: resolved.inputObject && resolved.inputObject.meta ? resolved.inputObject.meta.companyName : null,
        brandSlug: resolved.inputObject && resolved.inputObject.meta ? resolved.inputObject.meta.brandSlug : null
      },
      result: {
        outputDir: result.outputDir,
        artifacts: result.artifacts,
        individualization: result.individualization,
        metadataWarnings: result.metadataWarnings || [],
        renderHints: result.renderHints || {}
      }
    };

    if (result.previewUrl) {
      patch.result.previewUrl = result.previewUrl;
    }

    this.jobStore.update(jobId, patch);
    this.jobStore.transition(jobId, 'completed');
  }

  async processNext(workerId = 'worker') {
    const dequeued = this.queue.dequeue(workerId);
    if (!dequeued) {
      return false;
    }

    const { message, receipt } = dequeued;
    const jobId = message.jobId;

    try {
      const job = this.jobStore.get(jobId);
      const jobType = (message.jobType || (job && job.jobType) || 'generation').toLowerCase();

      if (jobType === 'extraction') {
        await this.extractionProcessor.process(jobId);
        return true;
      }

      await this.processGenerationJob(jobId);
      return true;
    } catch (error) {
      const statusMessage = error instanceof InputResolutionError ? 'input_resolution_error' : 'worker_runtime_error';

      try {
        const job = this.jobStore.get(jobId);
        if (job && job.status !== 'failed' && job.status !== 'completed' && job.status !== 'cancelled') {
          this.jobStore.transition(jobId, 'failed');
        }
      } catch (transitionError) {
        this.logger.warn('Failed to mark job as failed', {
          jobId,
          error: transitionError.message
        });
      }

      try {
        this.jobStore.update(jobId, {
          error: {
            code: statusMessage,
            message: error.message
          }
        });
      } catch (updateError) {
        this.logger.warn('Failed to update failed job details', {
          jobId,
          error: updateError.message
        });
      }

      return true;
    } finally {
      this.queue.ack(receipt);
    }
  }
}

module.exports = {
  JobProcessor
};
