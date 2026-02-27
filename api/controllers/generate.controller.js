function postGenerate(req, res, next) {
  try {
    const { jobService } = req.app.locals.services;
    const payload = req.body;
    const job = jobService.createGenerationJob({
      payload,
      requestId: req.id
    });

    res.status(202).json({
      jobId: job.jobId,
      status: 'pending',
      statusUrl: `/api/v1/generate/${job.jobId}/status`,
      estimatedTimeSec: 5
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  postGenerate
};
