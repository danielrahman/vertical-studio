async function postExtract(req, res, next) {
  try {
    const { jobService } = req.app.locals.services;
    const payload = req.body || {};

    const job = jobService.createExtractionJob({
      payload,
      requestId: req.id
    });

    res.status(202).json({
      jobId: job.jobId,
      status: 'pending',
      statusUrl: `/api/v1/extract/jobs/${job.jobId}`,
      resultUrl: `/api/v1/extract/jobs/${job.jobId}/result`
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  postExtract
};
