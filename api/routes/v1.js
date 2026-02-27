const express = require('express');
const { postGenerate } = require('../controllers/generate.controller');
const { getStatus } = require('../controllers/status.controller');
const { listPreviews, getPreviewConfig } = require('../controllers/previews.controller');
const { getAnalytics } = require('../controllers/analytics.controller');
const { getHealth } = require('../controllers/health.controller');
const { postDeploy } = require('../controllers/deploy.controller');
const {
  createCompany,
  listCompanies,
  updateCompany,
  getCompanyExtractionStatus
} = require('../controllers/companies.controller');
const { postExtract } = require('../controllers/extract.controller');
const {
  getExtractJobStatus,
  getExtractJobResult,
  listExtractJobArtifacts,
  getExtractJobArtifact,
  cancelExtractJob
} = require('../controllers/extract-jobs.controller');
const { validateBody } = require('../validation/validate-body');
const generateRequestSchema = require('../validation/generate-request.schema.json');
const deployRequestSchema = require('../validation/deploy-request.schema.json');
const companyRequestSchema = require('../validation/company-request.schema.json');
const extractRequestSchema = require('../validation/extract-request.schema.json');

const router = express.Router();

router.post('/generate', validateBody(generateRequestSchema), postGenerate);
router.get('/generate/:jobId/status', getStatus);
router.get('/previews', listPreviews);
router.get('/previews/:jobId/config', getPreviewConfig);
router.get('/analytics', getAnalytics);
router.get('/health', getHealth);

router.post('/extract', validateBody(extractRequestSchema), postExtract);
router.get('/extract/jobs/:jobId', getExtractJobStatus);
router.get('/extract/jobs/:jobId/result', getExtractJobResult);
router.get('/extract/jobs/:jobId/artifacts', listExtractJobArtifacts);
router.get('/extract/jobs/:jobId/artifacts/:artifactId', getExtractJobArtifact);
router.post('/extract/jobs/:jobId/cancel', cancelExtractJob);
router.post('/deploy', validateBody(deployRequestSchema), postDeploy);
router.post('/companies', validateBody(companyRequestSchema), createCompany);
router.get('/companies', listCompanies);
router.put('/companies/:id', validateBody(companyRequestSchema), updateCompany);
router.get('/companies/:id/extraction', getCompanyExtractionStatus);

module.exports = {
  v1Router: router
};
