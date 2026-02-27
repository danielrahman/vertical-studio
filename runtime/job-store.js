const { openDatabase } = require('./db');
const { createRepositories } = require('./repositories');

class JobStore {
  constructor(paths, logger, options = {}) {
    this.paths = paths;
    this.logger = logger;
    this.db = options.db || openDatabase(paths, logger);
    this.repositories = options.repositories || createRepositories(this.db, logger);
    this.jobs = this.repositories.jobs;
  }

  create(jobData) {
    return this.jobs.create(jobData);
  }

  get(jobId) {
    return this.jobs.get(jobId);
  }

  list() {
    return this.jobs.list();
  }

  update(jobId, patch) {
    return this.jobs.update(jobId, patch);
  }

  transition(jobId, nextStatus, options = {}) {
    return this.jobs.transition(jobId, nextStatus, options);
  }

  canTransition(current, next, reason) {
    return this.jobs.canTransition(current, next, reason);
  }

  recoverProcessingJobs() {
    return this.jobs.recoverProcessingJobs();
  }
}

module.exports = {
  JobStore
};
