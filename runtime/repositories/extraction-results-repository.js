const { isoNow, parseJson, serializeJson } = require('./json-utils');

class ExtractionResultsRepository {
  constructor(db) {
    this.db = db;
  }

  upsert(jobId, result) {
    const now = isoNow();
    const existing = this.getByJobId(jobId);

    if (!existing) {
      this.db
        .prepare(
          `INSERT INTO extraction_results (job_id, result_json, created_at, updated_at)
           VALUES (?, ?, ?, ?)`
        )
        .run(jobId, serializeJson(result), now, now);
      return this.getByJobId(jobId);
    }

    this.db
      .prepare(
        `UPDATE extraction_results
         SET result_json = ?, updated_at = ?
         WHERE job_id = ?`
      )
      .run(serializeJson(result), now, jobId);

    return this.getByJobId(jobId);
  }

  getByJobId(jobId) {
    const row = this.db
      .prepare(
        `SELECT job_id, result_json, created_at, updated_at
         FROM extraction_results
         WHERE job_id = ?`
      )
      .get(jobId);

    if (!row) {
      return null;
    }

    return {
      jobId: row.job_id,
      result: parseJson(row.result_json, null),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

module.exports = {
  ExtractionResultsRepository
};
