const fs = require('fs');
const path = require('path');

function ensureExtractionJob(job) {
  return job && (job.jobType || 'generation') === 'extraction';
}

function toStatusPayload(job, extractionResult) {
  return {
    jobId: job.jobId,
    jobType: job.jobType,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    durationMs: job.durationMs,
    progress: job.progress || null,
    cost: job.cost || null,
    cancelledAt: job.cancelledAt || null,
    warnings:
      extractionResult && extractionResult.result && Array.isArray(extractionResult.result.warnings)
        ? extractionResult.result.warnings
        : [],
    error: job.error || null
  };
}

function getExtractJobStatus(req, res, next) {
  try {
    const { jobs, extractionResults } = req.app.locals.repositories;
    const job = jobs.get(req.params.jobId);

    if (!ensureExtractionJob(job)) {
      const error = new Error('Extraction job not found');
      error.statusCode = 404;
      error.code = 'extract_job_not_found';
      throw error;
    }

    const result = extractionResults.getByJobId(job.jobId);
    res.status(200).json(toStatusPayload(job, result));
  } catch (error) {
    next(error);
  }
}

function getExtractJobResult(req, res, next) {
  try {
    const { jobs, extractionResults } = req.app.locals.repositories;
    const job = jobs.get(req.params.jobId);

    if (!ensureExtractionJob(job)) {
      const error = new Error('Extraction job not found');
      error.statusCode = 404;
      error.code = 'extract_job_not_found';
      throw error;
    }

    const result = extractionResults.getByJobId(job.jobId);
    if (!result || !result.result) {
      if (job.status === 'failed') {
        const error = new Error('Extraction job failed');
        error.statusCode = 422;
        error.code = 'extract_job_failed';
        error.details = job.error || null;
        throw error;
      }

      const error = new Error('Extraction result is not ready yet');
      error.statusCode = 409;
      error.code = 'extract_result_not_ready';
      throw error;
    }

    res.status(200).json(result.result);
  } catch (error) {
    next(error);
  }
}

function listExtractJobArtifacts(req, res, next) {
  try {
    const { jobs, extractionArtifacts } = req.app.locals.repositories;
    const job = jobs.get(req.params.jobId);

    if (!ensureExtractionJob(job)) {
      const error = new Error('Extraction job not found');
      error.statusCode = 404;
      error.code = 'extract_job_not_found';
      throw error;
    }

    const artifacts = extractionArtifacts.listByJobId(job.jobId);
    res.status(200).json({
      jobId: job.jobId,
      count: artifacts.length,
      artifacts
    });
  } catch (error) {
    next(error);
  }
}

function getExtractJobArtifact(req, res, next) {
  try {
    const { jobs, extractionArtifacts } = req.app.locals.repositories;
    const job = jobs.get(req.params.jobId);

    if (!ensureExtractionJob(job)) {
      const error = new Error('Extraction job not found');
      error.statusCode = 404;
      error.code = 'extract_job_not_found';
      throw error;
    }

    const artifact = extractionArtifacts.getById(req.params.artifactId);
    if (!artifact || artifact.jobId !== job.jobId) {
      const error = new Error('Artifact not found');
      error.statusCode = 404;
      error.code = 'extract_artifact_not_found';
      throw error;
    }

    if (!artifact.path || !fs.existsSync(artifact.path)) {
      const error = new Error('Artifact file missing');
      error.statusCode = 404;
      error.code = 'extract_artifact_file_missing';
      throw error;
    }

    const ext = path.extname(artifact.path).toLowerCase();
    if (ext === '.json') {
      res.setHeader('content-type', 'application/json; charset=utf-8');
    }
    if (ext === '.png') {
      res.setHeader('content-type', 'image/png');
    }
    if (ext === '.html') {
      res.setHeader('content-type', 'text/html; charset=utf-8');
    }

    res.setHeader('x-artifact-type', artifact.type);
    res.sendFile(path.resolve(artifact.path));
  } catch (error) {
    next(error);
  }
}

function cancelExtractJob(req, res, next) {
  try {
    const { jobs } = req.app.locals.repositories;
    const job = jobs.get(req.params.jobId);

    if (!ensureExtractionJob(job)) {
      const error = new Error('Extraction job not found');
      error.statusCode = 404;
      error.code = 'extract_job_not_found';
      throw error;
    }

    if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
      res.status(200).json({
        jobId: job.jobId,
        status: job.status,
        cancelled: job.status === 'cancelled'
      });
      return;
    }

    jobs.transition(job.jobId, 'cancelled');
    jobs.update(job.jobId, {
      progress: {
        phase: 'cancelled',
        ratio: 1,
        message: 'Cancelled by user'
      }
    });

    const updated = jobs.get(job.jobId);
    res.status(200).json({
      jobId: updated.jobId,
      status: updated.status,
      cancelled: updated.status === 'cancelled'
    });
  } catch (error) {
    if (error.code === 'INVALID_TRANSITION') {
      error.statusCode = 409;
      error.code = 'invalid_extract_job_transition';
    }
    next(error);
  }
}

module.exports = {
  getExtractJobStatus,
  getExtractJobResult,
  listExtractJobArtifacts,
  getExtractJobArtifact,
  cancelExtractJob
};
