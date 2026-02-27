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
const {
  postCreateTenant,
  getTenantDetail,
  postBootstrapFromExtraction,
  postVerticalResearchBuild,
  getVerticalResearchLatest,
  getVerticalStandardVersion,
  getComponentContracts,
  getComponentContractDefinition,
  postComposePropose,
  postComposeSelect,
  postCopyGenerate,
  getCopySlots,
  postCopySelect,
  postOverrides,
  postReviewTransition,
  postPublishSite,
  postRollbackVersion,
  getSiteVersions,
  getLatestQualityReport,
  getLatestSecurityReport,
  getAuditEvents,
  getPublicRuntimeResolve,
  getPublicRuntimeSnapshot,
  getPublicRuntimeSnapshotByStorageKey,
  postCmsPublishWebhook,
  postSecretRef
} = require('../controllers/v3-orchestration.controller');
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

router.post('/tenants', postCreateTenant);
router.get('/tenants/:tenantId', getTenantDetail);
router.post('/sites/:siteId/bootstrap-from-extraction', postBootstrapFromExtraction);

router.post('/verticals/:verticalKey/research/build', postVerticalResearchBuild);
router.get('/verticals/:verticalKey/research/latest', getVerticalResearchLatest);
router.get('/verticals/:verticalKey/standards/:version', getVerticalStandardVersion);

router.get('/component-contracts', getComponentContracts);
router.get('/component-contracts/:componentId/:version', getComponentContractDefinition);

router.post('/sites/:siteId/compose/propose', postComposePropose);
router.post('/sites/:siteId/compose/select', postComposeSelect);

router.post('/sites/:siteId/copy/generate', postCopyGenerate);
router.get('/sites/:siteId/copy/slots', getCopySlots);
router.post('/sites/:siteId/copy/select', postCopySelect);

router.post('/sites/:siteId/overrides', postOverrides);
router.post('/sites/:siteId/review/transition', postReviewTransition);

router.post('/sites/:siteId/publish', postPublishSite);
router.post('/sites/:siteId/rollback/:versionId', postRollbackVersion);
router.get('/sites/:siteId/versions', getSiteVersions);
router.get('/sites/:siteId/quality/latest', getLatestQualityReport);
router.get('/sites/:siteId/security/latest', getLatestSecurityReport);
router.get('/audit/events', getAuditEvents);
router.get('/public/runtime/resolve', getPublicRuntimeResolve);
router.get('/public/runtime/snapshot', getPublicRuntimeSnapshot);
router.get('/public/runtime/snapshot/by-storage-key', getPublicRuntimeSnapshotByStorageKey);

router.post('/cms/webhooks/publish', postCmsPublishWebhook);
router.post('/secrets/refs', postSecretRef);

module.exports = {
  v1Router: router
};
