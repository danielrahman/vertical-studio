const { randomUUID } = require('crypto');
const { parseJson, serializeJson, isoNow } = require('./json-utils');

function mapDeployment(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    jobId: row.job_id,
    target: row.target,
    status: row.status,
    previewUrl: row.preview_url,
    productionUrl: row.production_url,
    metadata: parseJson(row.metadata_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

class DeploymentsRepository {
  constructor(db) {
    this.db = db;
  }

  create(payload) {
    const now = isoNow();
    const id = payload.id || randomUUID();

    this.db
      .prepare(
        `INSERT INTO deployments (
          id, job_id, target, status, preview_url, production_url,
          metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        payload.jobId,
        payload.target,
        payload.status,
        payload.previewUrl || null,
        payload.productionUrl || null,
        serializeJson(payload.metadata || null),
        now,
        now
      );

    return this.getById(id);
  }

  getById(id) {
    const row = this.db.prepare('SELECT * FROM deployments WHERE id = ?').get(id);
    return mapDeployment(row);
  }

  list() {
    const rows = this.db.prepare('SELECT * FROM deployments ORDER BY created_at DESC').all();
    return rows.map(mapDeployment);
  }

  listByJobId(jobId) {
    const rows = this.db
      .prepare('SELECT * FROM deployments WHERE job_id = ? ORDER BY created_at DESC')
      .all(jobId);
    return rows.map(mapDeployment);
  }

  getLatestByJobId(jobId) {
    const row = this.db
      .prepare('SELECT * FROM deployments WHERE job_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(jobId);
    return mapDeployment(row);
  }

  update(id, patch) {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const columns = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
      columns.push('status = ?');
      params.push(patch.status);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'previewUrl')) {
      columns.push('preview_url = ?');
      params.push(patch.previewUrl || null);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'productionUrl')) {
      columns.push('production_url = ?');
      params.push(patch.productionUrl || null);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'metadata')) {
      columns.push('metadata_json = ?');
      params.push(serializeJson(patch.metadata || null));
    }

    if (!columns.length) {
      return existing;
    }

    columns.push('updated_at = ?');
    params.push(isoNow(), id);

    const sql = `UPDATE deployments SET ${columns.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...params);

    return this.getById(id);
  }
}

module.exports = {
  DeploymentsRepository
};
