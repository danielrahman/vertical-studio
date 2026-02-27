/**
 * @interface JobRepository
 * - create(jobData)
 * - get(jobId)
 * - list()
 * - update(jobId, patch)
 * - transition(jobId, nextStatus, options)
 * - recoverProcessingJobs()
 */

/**
 * @interface ExtractionResultsRepository
 * - upsert(jobId, result)
 * - getByJobId(jobId)
 */

/**
 * @interface ExtractionArtifactsRepository
 * - create(payload)
 * - getById(id)
 * - listByJobId(jobId)
 * - removeByJobId(jobId)
 */

/**
 * @interface CompanyRepository
 * - create(payload)
 * - getById(id)
 * - getByBrandSlug(brandSlug)
 * - list()
 * - update(id, patch)
 */

/**
 * @interface DeploymentRepository
 * - create(payload)
 * - getById(id)
 * - listByJobId(jobId)
 * - getLatestByJobId(jobId)
 * - update(id, patch)
 */

/**
 * @interface MetricsRepository
 * - getAnalytics()
 */

module.exports = {};
