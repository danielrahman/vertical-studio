const { randomUUID } = require('crypto');
const { createDeployAdapters } = require('../infrastructure/deploy');
const { LocalStorageAdapter } = require('../infrastructure/storage/local-storage-adapter');
const { DeployError } = require('../infrastructure/deploy/errors');

class DeployService {
  constructor(options = {}) {
    this.jobs = options.jobsRepository;
    this.deployments = options.deploymentsRepository;
    this.logger = options.logger;
    this.paths = options.paths;

    this.storage = options.storage || new LocalStorageAdapter(options);
    this.adapters = options.adapters || createDeployAdapters({
      ...options,
      storage: this.storage,
      paths: this.paths
    });
  }

  deployJob({ jobId, target, domain = null, requestBaseUrl = null }) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new DeployError('Job not found', 404, 'job_not_found');
    }

    if (job.status !== 'completed') {
      throw new DeployError('Only completed jobs can be deployed', 409, 'job_not_completed');
    }

    const adapter = this.adapters[target];
    if (!adapter) {
      throw new DeployError(`Unsupported deploy target: ${target}`, 400, 'unsupported_deploy_target');
    }

    const deploymentId = randomUUID();
    const deploymentResult = adapter.deploy({
      job,
      deploymentId,
      domain,
      requestBaseUrl,
      artifacts: job.result && job.result.artifacts ? job.result.artifacts : null
    });

    const stored = this.deployments.create({
      id: deploymentId,
      jobId: job.jobId,
      target,
      status: deploymentResult.status,
      previewUrl: deploymentResult.previewUrl || null,
      productionUrl: deploymentResult.productionUrl || null,
      metadata: deploymentResult.metadata || null
    });

    if (this.logger) {
      this.logger.info('Deployment created', {
        deploymentId: stored.id,
        jobId: stored.jobId,
        target: stored.target,
        status: stored.status
      });
    }

    return {
      deploymentId: stored.id,
      status: stored.status,
      target: stored.target,
      previewUrl: stored.previewUrl,
      productionUrl: stored.productionUrl,
      message: deploymentResult.message || 'Deployment completed.'
    };
  }
}

module.exports = {
  DeployService
};
