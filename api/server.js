const express = require('express');
const { v1Router } = require('./routes/v1');
const { requestIdMiddleware } = require('./middleware/request-id');
const { errorHandler } = require('./middleware/error-handler');
const { apiKeyAuthMiddleware } = require('./middleware/auth');
const { createRuntime } = require('../runtime/create-runtime');
const { JobService } = require('../services/job-service');
const { PreviewService } = require('../services/preview-service');
const { DeployService } = require('../services/deploy-service');
const { CompanyService } = require('../services/company-service');
const { ExtractionService } = require('../services/extraction-service');
const { validateBody } = require('./validation/validate-body');
const { postExtract } = require('./controllers/extract.controller');
const extractRequestSchema = require('./validation/extract-request.schema.json');

function createApp(options = {}) {
  const runtime = createRuntime({
    ...options,
    context: 'api'
  });
  const { paths, logger, jobStore, queue, repositories, db, secretStore } = runtime;

  const app = express();
  app.locals.paths = paths;
  app.locals.logger = logger;
  app.locals.jobStore = jobStore;
  app.locals.queue = queue;
  app.locals.repositories = repositories;
  app.locals.db = db;
  app.locals.secretStore = secretStore;
  app.locals.startedAt = Date.now();
  const jobService = new JobService({
    jobsRepository: repositories.jobs,
    companiesRepository: repositories.companies,
    extractionResultsRepository: repositories.extractionResults,
    extractionArtifactsRepository: repositories.extractionArtifacts,
    queue,
    paths
  });

  app.locals.services = {
    extractionService: new ExtractionService({ logger }),
    jobService,
    previewService: new PreviewService({
      jobsRepository: repositories.jobs
    }),
    deployService: new DeployService({
      jobsRepository: repositories.jobs,
      deploymentsRepository: repositories.deployments,
      paths,
      logger
    }),
    companyService: new CompanyService({
      companiesRepository: repositories.companies,
      jobsRepository: repositories.jobs,
      jobService,
      logger
    })
  };

  app.use(express.json({ limit: '5mb' }));
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-request-id');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(requestIdMiddleware);
  app.use(
    '/api',
    apiKeyAuthMiddleware({
      ...(options.auth || {})
    })
  );

  app.post('/api/extract', validateBody(extractRequestSchema), postExtract);
  app.use('/api/v1', v1Router);

  app.use((_req, res) => {
    res.status(404).json({
      code: 'not_found',
      message: 'Route not found',
      requestId: _req.id,
      details: {}
    });
  });

  app.use(errorHandler);

  return app;
}

function startServer(options = {}) {
  const app = createApp(options);
  const port = Number(process.env.PORT || options.port || 3000);

  const server = app.listen(port, () => {
    app.locals.logger.info('API server started', { port });
  });

  return {
    app,
    server
  };
}

if (require.main === module) {
  startServer();
}

module.exports = {
  createApp,
  startServer
};
