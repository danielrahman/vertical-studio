const { getRuntimePaths, ensureRuntimeDirs } = require('./paths');
const { createLogger } = require('./logger');
const { openDatabase } = require('./db');
const { createRepositories } = require('./repositories');
const { FSQueue } = require('./fs-queue');
const { JobStore } = require('./job-store');
const { SecretStore } = require('./secret-store');

function createRuntime(options = {}) {
  const paths = options.paths || getRuntimePaths();
  ensureRuntimeDirs(paths);

  const logger = options.logger || createLogger(options.context || 'runtime');
  const existingJobStore = options.jobStore || null;
  const db = options.db || (existingJobStore && existingJobStore.db) || openDatabase(paths, logger);
  const repositories =
    options.repositories ||
    (existingJobStore && existingJobStore.repositories) ||
    createRepositories(db, logger);
  const queue = options.queue || new FSQueue(paths, logger);
  const jobStore = existingJobStore || new JobStore(paths, logger, { db, repositories });
  const secretStore = options.secretStore || new SecretStore(paths);

  return {
    paths,
    logger,
    db,
    repositories,
    queue,
    jobStore,
    secretStore
  };
}

module.exports = {
  createRuntime
};
