function postDeploy(req, res, next) {
  try {
    const { deployService } = req.app.locals.services;
    const { jobId, target, domain } = req.body || {};

    if (!jobId || typeof jobId !== 'string') {
      const error = new Error('jobId is required');
      error.statusCode = 400;
      error.code = 'validation_error';
      throw error;
    }

    if (!target || typeof target !== 'string') {
      const error = new Error('target is required');
      error.statusCode = 400;
      error.code = 'validation_error';
      throw error;
    }

    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const requestBaseUrl = host ? `${proto}://${host}` : null;

    const result = deployService.deployJob({
      jobId,
      target,
      domain: domain || null,
      requestBaseUrl
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  postDeploy
};
