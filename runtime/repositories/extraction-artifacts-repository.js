const { randomUUID } = require('crypto');
const { isoNow, parseJson, serializeJson } = require('./json-utils');

function mapArtifact(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    jobId: row.job_id,
    type: row.artifact_type,
    path: row.path,
    metadata: parseJson(row.metadata_json, null),
    createdAt: row.created_at
  };
}

class ExtractionArtifactsRepository {
  constructor(db) {
    this.db = db;
  }

  create(payload) {
    const id = payload.id || randomUUID();
    const createdAt = isoNow();

    this.db
      .prepare(
        `INSERT INTO extraction_artifacts (id, job_id, artifact_type, path, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        payload.jobId,
        payload.type,
        payload.path,
        serializeJson(payload.metadata || null),
        createdAt
      );

    return this.getById(id);
  }

  getById(id) {
    const row = this.db
      .prepare(
        `SELECT id, job_id, artifact_type, path, metadata_json, created_at
         FROM extraction_artifacts
         WHERE id = ?`
      )
      .get(id);

    return mapArtifact(row);
  }

  listByJobId(jobId) {
    const rows = this.db
      .prepare(
        `SELECT id, job_id, artifact_type, path, metadata_json, created_at
         FROM extraction_artifacts
         WHERE job_id = ?
         ORDER BY created_at ASC`
      )
      .all(jobId);

    return rows.map(mapArtifact);
  }

  removeByJobId(jobId) {
    const result = this.db.prepare('DELETE FROM extraction_artifacts WHERE job_id = ?').run(jobId);
    return result.changes || 0;
  }
}

module.exports = {
  ExtractionArtifactsRepository
};
