function getStatus(req, res, next) {
  try {
    const { jobs } = req.app.locals.repositories;
    const { jobId } = req.params;
    const job = jobs.get(jobId);

    if (!job) {
      const error = new Error('Job not found');
      error.statusCode = 404;
      error.code = 'job_not_found';
      throw error;
    }

    const response = {
      jobId: job.jobId,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      durationMs: job.durationMs,
      inputSource: job.inputSource,
      outputDir: job.outputDir
    };

    if (job.result && job.result.previewUrl) {
      response.previewUrl = job.result.previewUrl;
    }

    if (job.result && job.result.artifacts) {
      response.artifacts = job.result.artifacts;
    }

    if (job.result && Array.isArray(job.result.metadataWarnings)) {
      response.warnings = job.result.metadataWarnings;
    }

    if (job.result && job.result.renderHints) {
      response.renderHints = job.result.renderHints;
    }

    if (job.error) {
      response.error = job.error;
    }

    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getStatus
};
