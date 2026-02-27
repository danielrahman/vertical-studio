const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const MIGRATIONS = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        request_json TEXT NOT NULL,
        input_source_json TEXT,
        result_json TEXT,
        error_json TEXT,
        output_dir TEXT NOT NULL,
        request_id TEXT,
        site_meta_json TEXT,
        created_at TEXT NOT NULL,
        started_at TEXT,
        finished_at TEXT,
        duration_ms INTEGER,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at)`,
      `CREATE TABLE IF NOT EXISTS companies (
        id TEXT PRIMARY KEY,
        name TEXT,
        brand_slug TEXT UNIQUE,
        locale TEXT,
        industry TEXT,
        website_url TEXT,
        source_json TEXT,
        normalized_input_json TEXT,
        extraction_status TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_companies_brand_slug ON companies(brand_slug)`,
      `CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        target TEXT NOT NULL,
        status TEXT NOT NULL,
        preview_url TEXT,
        production_url TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(job_id) REFERENCES jobs(job_id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_deployments_job_id ON deployments(job_id)`,
      `CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT,
        level TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(job_id) REFERENCES jobs(job_id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_events_job_id_created_at ON events(job_id, created_at)`
    ]
  },
  {
    version: 2,
    statements: [
      `ALTER TABLE jobs ADD COLUMN job_type TEXT NOT NULL DEFAULT 'generation'`,
      `ALTER TABLE jobs ADD COLUMN progress_json TEXT`,
      `ALTER TABLE jobs ADD COLUMN cost_json TEXT`,
      `ALTER TABLE jobs ADD COLUMN cancelled_at TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_jobs_job_type_status ON jobs(job_type, status)`,
      `CREATE TABLE IF NOT EXISTS extraction_results (
        job_id TEXT PRIMARY KEY,
        result_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(job_id) REFERENCES jobs(job_id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS extraction_artifacts (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL,
        artifact_type TEXT NOT NULL,
        path TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(job_id) REFERENCES jobs(job_id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_extraction_artifacts_job_id ON extraction_artifacts(job_id)`
    ]
  },
  {
    version: 3,
    statements: [
      `ALTER TABLE companies ADD COLUMN extraction_job_id TEXT`,
      `ALTER TABLE companies ADD COLUMN extraction_updated_at TEXT`,
      `ALTER TABLE companies ADD COLUMN extraction_history_json TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_companies_extraction_job_id ON companies(extraction_job_id)`
    ]
  }
];

function getCurrentVersion(db) {
  db.exec(
    `CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`
  );

  const row = db.prepare('SELECT MAX(version) AS version FROM schema_version').get();
  return row && typeof row.version === 'number' ? row.version : 0;
}

function applyMigration(db, migration) {
  db.exec('BEGIN');
  try {
    for (const statement of migration.statements) {
      db.exec(statement);
    }

    db.prepare('INSERT INTO schema_version(version, applied_at) VALUES(?, ?)').run(
      migration.version,
      new Date().toISOString()
    );

    db.exec('COMMIT');
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback errors to preserve the original migration failure.
    }
    throw error;
  }
}

function initializeDatabase(db, logger) {
  const currentVersion = getCurrentVersion(db);
  const pending = MIGRATIONS.filter((migration) => migration.version > currentVersion).sort(
    (a, b) => a.version - b.version
  );

  for (const migration of pending) {
    applyMigration(db, migration);
    if (logger) {
      logger.info('Applied DB migration', { version: migration.version });
    }
  }
}

function openDatabase(paths, logger) {
  const dbPath = paths.databasePath || path.join(paths.runtimeRoot, 'vertical-studio.sqlite');
  const db = new DatabaseSync(dbPath);

  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA synchronous=NORMAL');
  db.exec('PRAGMA foreign_keys=ON');

  initializeDatabase(db, logger);

  return db;
}

module.exports = {
  openDatabase,
  initializeDatabase
};
