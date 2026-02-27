const { EventsRepository } = require('./events-repository');
const { JobsRepository } = require('./jobs-repository');
const { CompaniesRepository } = require('./companies-repository');
const { DeploymentsRepository } = require('./deployments-repository');
const { MetricsRepository } = require('./metrics-repository');
const { ExtractionResultsRepository } = require('./extraction-results-repository');
const { ExtractionArtifactsRepository } = require('./extraction-artifacts-repository');

function createRepositories(db, logger) {
  const events = new EventsRepository(db);
  const jobs = new JobsRepository(db, logger, events);
  const companies = new CompaniesRepository(db);
  const deployments = new DeploymentsRepository(db);
  const metrics = new MetricsRepository(db);
  const extractionResults = new ExtractionResultsRepository(db);
  const extractionArtifacts = new ExtractionArtifactsRepository(db);

  return {
    jobs,
    companies,
    deployments,
    events,
    metrics,
    extractionResults,
    extractionArtifacts
  };
}

module.exports = {
  createRepositories
};
