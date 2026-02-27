function listPreviews(req, res, next) {
  try {
    const { jobs, deployments } = req.app.locals.repositories;
    const completed = jobs.list().filter((job) => job.status === 'completed');

    const payload = completed.map((job) => {
      const preview = {
        status: job.result && job.result.previewUrl ? 'available' : 'not_configured'
      };

      if (job.result && job.result.previewUrl) {
        preview.url = job.result.previewUrl;
      }

      const latestDeployment = deployments.getLatestByJobId(job.jobId);

      return {
        jobId: job.jobId,
        companyName: job.siteMeta && job.siteMeta.companyName ? job.siteMeta.companyName : null,
        brandSlug: job.siteMeta && job.siteMeta.brandSlug ? job.siteMeta.brandSlug : null,
        generatedAt: job.finishedAt,
        preview,
        outputDir: job.outputDir,
        deployment: latestDeployment
          ? {
              id: latestDeployment.id,
              target: latestDeployment.target,
              status: latestDeployment.status,
              previewUrl: latestDeployment.previewUrl,
              productionUrl: latestDeployment.productionUrl,
              updatedAt: latestDeployment.updatedAt
            }
          : null
      };
    });

    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
}

function getPreviewConfig(req, res, next) {
  try {
    const { previewService } = req.app.locals.services;
    const { jobId } = req.params;
    const payload = previewService.getPreviewConfig(jobId);
    res.status(200).json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listPreviews,
  getPreviewConfig
};
