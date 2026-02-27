const { randomUUID } = require('crypto');
const { parseJson, serializeJson, isoNow } = require('./json-utils');

function mapCompany(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    brandSlug: row.brand_slug,
    locale: row.locale,
    industry: row.industry,
    websiteUrl: row.website_url,
    source: parseJson(row.source_json, null),
    normalizedInput: parseJson(row.normalized_input_json, null),
    extractionStatus: row.extraction_status,
    extractionJobId: row.extraction_job_id || null,
    extractionUpdatedAt: row.extraction_updated_at || null,
    extractionHistory: parseJson(row.extraction_history_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

class CompaniesRepository {
  constructor(db) {
    this.db = db;
  }

  create(payload) {
    const now = isoNow();
    const id = payload.id || randomUUID();

    this.db
      .prepare(
        `INSERT INTO companies (
          id, name, brand_slug, locale, industry, website_url,
          source_json, normalized_input_json, extraction_status, extraction_job_id, extraction_updated_at, extraction_history_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        payload.name || null,
        payload.brandSlug || null,
        payload.locale || null,
        payload.industry || null,
        payload.websiteUrl || null,
        serializeJson(payload.source || null),
        serializeJson(payload.normalizedInput || null),
        payload.extractionStatus || 'none',
        payload.extractionJobId || null,
        payload.extractionUpdatedAt || null,
        serializeJson(payload.extractionHistory || []),
        now,
        now
      );

    return this.getById(id);
  }

  getById(id) {
    const row = this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id);
    return mapCompany(row);
  }

  getByBrandSlug(brandSlug) {
    const row = this.db.prepare('SELECT * FROM companies WHERE brand_slug = ?').get(brandSlug);
    return mapCompany(row);
  }

  list() {
    const rows = this.db.prepare('SELECT * FROM companies ORDER BY created_at DESC').all();
    return rows.map(mapCompany);
  }

  update(id, patch) {
    const existing = this.getById(id);
    if (!existing) {
      return null;
    }

    const columns = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
      columns.push('name = ?');
      params.push(patch.name || null);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'brandSlug')) {
      columns.push('brand_slug = ?');
      params.push(patch.brandSlug || null);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'locale')) {
      columns.push('locale = ?');
      params.push(patch.locale || null);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'industry')) {
      columns.push('industry = ?');
      params.push(patch.industry || null);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'websiteUrl')) {
      columns.push('website_url = ?');
      params.push(patch.websiteUrl || null);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'source')) {
      columns.push('source_json = ?');
      params.push(serializeJson(patch.source));
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'normalizedInput')) {
      columns.push('normalized_input_json = ?');
      params.push(serializeJson(patch.normalizedInput));
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'extractionStatus')) {
      columns.push('extraction_status = ?');
      params.push(patch.extractionStatus || 'none');
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'extractionJobId')) {
      columns.push('extraction_job_id = ?');
      params.push(patch.extractionJobId || null);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'extractionUpdatedAt')) {
      columns.push('extraction_updated_at = ?');
      params.push(patch.extractionUpdatedAt || null);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'extractionHistory')) {
      columns.push('extraction_history_json = ?');
      params.push(serializeJson(patch.extractionHistory || []));
    }

    if (!columns.length) {
      return existing;
    }

    columns.push('updated_at = ?');
    params.push(isoNow(), id);

    const sql = `UPDATE companies SET ${columns.join(', ')} WHERE id = ?`;
    this.db.prepare(sql).run(...params);

    return this.getById(id);
  }
}

module.exports = {
  CompaniesRepository
};
