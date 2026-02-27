const fs = require('fs');
const path = require('path');

class PreviewService {
  constructor(options = {}) {
    this.jobs = options.jobsRepository;
  }

  getPreviewConfig(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      const error = new Error('Job not found');
      error.statusCode = 404;
      error.code = 'job_not_found';
      throw error;
    }

    if (job.status !== 'completed') {
      const error = new Error('Preview config is available only for completed jobs');
      error.statusCode = 409;
      error.code = 'preview_not_ready';
      throw error;
    }

    const artifacts = (job.result && job.result.artifacts) || {};
    const siteConfigPath = artifacts.siteConfig || path.join(job.outputDir, 'site-config.json');
    const themeConfigPath = artifacts.themeConfig || path.join(job.outputDir, 'theme-config.json');
    const manifestPath = artifacts.manifest || path.join(job.outputDir, 'manifest.json');

    return {
      siteConfig: JSON.parse(fs.readFileSync(siteConfigPath, 'utf8')),
      themeConfig: JSON.parse(fs.readFileSync(themeConfigPath, 'utf8')),
      manifest: JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    };
  }
}

module.exports = {
  PreviewService
};
