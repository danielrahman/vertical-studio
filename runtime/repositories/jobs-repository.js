const { parseJson, serializeJson, isoNow } = require('./json-utils');

const GENERATION_TRANSITIONS = {
  pending: ['processing', 'cancelled'],
  processing: ['completed', 'failed', 'cancelled']
};

const EXTRACTION_TRANSITIONS = {
  pending: ['discovering', 'cancelled'],
  discovering: ['crawling', 'failed', 'cancelled'],
  crawling: ['rendering', 'offsite', 'synthesizing', 'failed', 'cancelled'],
  rendering: ['offsite', 'synthesizing', 'failed', 'cancelled'],
  offsite: ['synthesizing', 'failed', 'cancelled'],
  synthesizing: ['completed', 'failed', 'cancelled']
};

function getTransitionMap(jobType) {
  return jobType === 'extraction' ? EXTRACTION_TRANSITIONS : GENERATION_TRANSITIONS;
}

function canTransition(currentStatus, nextStatus, reason, jobType = 'generation') {
  if (reason === 'recovery' && currentStatus !== 'completed' && currentStatus !== 'failed' && currentStatus !== 'cancelled') {
    return nextStatus === 'pending';
  }

  const transitions = getTransitionMap(jobType);
  return Array.isArray(transitions[currentStatus]) && transitions[currentStatus].includes(nextStatus);
}

function mapRowToJob(row, statusHistory = null) {
  if (!row) {
    return null;
  }

  return {
    jobId: row.job_id,
    jobType: row.job_type || 'generation',
    status: row.status,
    request: parseJson(row.request_json, {}),
    inputSource: parseJson(row.input_source_json, null),
    result: parseJson(row.result_json, null),
    error: parseJson(row.error_json, null),
    outputDir: row.output_dir,
    requestId: row.request_id || null,
    siteMeta: parseJson(row.site_meta_json, null),
    progress: parseJson(row.progress_json, null),
    cost: parseJson(row.cost_json, null),
    cancelledAt: row.cancelled_at || null,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    updatedAt: row.updated_at,
    statusHistory: Array.isArray(statusHistory) ? statusHistory : undefined
  };
}

class JobsRepository {
  constructor(db, logger, eventsRepository) {
    this.db = db;
    this.logger = logger;
    this.events = eventsRepository;
  }

  getStatusHistory(jobId) {
    const rows = this.db
      .prepare(
        `SELECT event_type, payload_json, created_at
         FROM events
         WHERE job_id = ?
         ORDER BY id ASC`
      )
      .all(jobId);

    const history = [];

    for (const row of rows) {
      if (row.event_type === 'job_created') {
        const payload = parseJson(row.payload_json, {});
        history.push({
          status: payload.status || 'pending',
          at: row.created_at,
          reason: null,
          jobType: payload.jobType || 'generation'
        });
      }

      if (row.event_type === 'job_status_transition') {
        const payload = parseJson(row.payload_json, {});
        history.push({
          status: payload.to,
          at: row.created_at,
          reason: payload.reason || null,
          jobType: payload.jobType || 'generation'
        });
      }
    }

    return history;
  }

  create(jobData) {
    const now = isoNow();
    const status = jobData.status || 'pending';
    const jobType = jobData.jobType || 'generation';

    const row = {
      jobId: jobData.jobId,
      jobType,
      status,
      request: jobData.request || {},
      inputSource: jobData.inputSource || null,
      result: jobData.result || null,
      error: jobData.error || null,
      outputDir: jobData.outputDir,
      requestId: jobData.requestId || null,
      siteMeta: jobData.siteMeta || null,
      progress: jobData.progress || null,
      cost: jobData.cost || null,
      cancelledAt: jobData.cancelledAt || null,
      createdAt: jobData.createdAt || now,
      startedAt: jobData.startedAt || null,
      finishedAt: jobData.finishedAt || null,
      durationMs: typeof jobData.durationMs === 'number' ? jobData.durationMs : null,
      updatedAt: now
    };

    this.db
      .prepare(
        `INSERT INTO jobs (
           job_id, job_type, status, request_json, input_source_json, result_json, error_json,
           output_dir, request_id, site_meta_json, progress_json, cost_json, cancelled_at,
           created_at, started_at, finished_at, duration_ms, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        row.jobId,
        row.jobType,
        row.status,
        serializeJson(row.request),
        serializeJson(row.inputSource),
        serializeJson(row.result),
        serializeJson(row.error),
        row.outputDir,
        row.requestId,
        serializeJson(row.siteMeta),
        serializeJson(row.progress),
        serializeJson(row.cost),
        row.cancelledAt,
        row.createdAt,
        row.startedAt,
        row.finishedAt,
        row.durationMs,
        row.updatedAt
      );

    this.events.append({
      jobId: row.jobId,
      level: 'info',
      eventType: 'job_created',
      payload: { status: row.status, jobType: row.jobType }
    });

    return this.get(row.jobId);
  }

  get(jobId) {
    const row = this.db.prepare('SELECT * FROM jobs WHERE job_id = ?').get(jobId);
    return mapRowToJob(row, row ? this.getStatusHistory(jobId) : undefined);
  }

  list() {
    const rows = this.db.prepare('SELECT * FROM jobs ORDER BY created_at ASC').all();
    return rows.map((row) => mapRowToJob(row, this.getStatusHistory(row.job_id)));
  }

  update(jobId, patch) {
    const existing = this.get(jobId);
    if (!existing) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const columns = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(patch, 'request')) {
      columns.push('request_json = ?');
      params.push(serializeJson(patch.request));
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'inputSource')) {
      columns.push('input_source_json = ?');
      params.push(serializeJson(patch.inputSource));
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'result')) {
      columns.push('result_json = ?');
      params.push(serializeJson(patch.result));
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'error')) {
      columns.push('error_json = ?');
      params.push(serializeJson(patch.error));
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'outputDir')) {
      columns.push('output_dir = ?');
      params.push(patch.outputDir);
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'siteMeta')) {
      columns.push('site_meta_json = ?');
      params.push(serializeJson(patch.siteMeta));
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'progress')) {
      columns.push('progress_json = ?');
      params.push(serializeJson(patch.progress));
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'cost')) {
      columns.push('cost_json = ?');
      params.push(serializeJson(patch.cost));
    }

    if (Object.prototype.hasOwnProperty.call(patch, 'cancelledAt')) {
      columns.push('cancelled_at = ?');
      params.push(patch.cancelledAt || null);
    }

    if (!columns.length) {
      return existing;
    }

    columns.push('updated_at = ?');
    params.push(isoNow(), jobId);

    const sql = `UPDATE jobs SET ${columns.join(', ')} WHERE job_id = ?`;
    this.db.prepare(sql).run(...params);

    this.events.append({
      jobId,
      level: 'info',
      eventType: 'job_updated',
      payload: { fields: Object.keys(patch) }
    });

    return this.get(jobId);
  }

  transition(jobId, nextStatus, options = {}) {
    const reason = options.reason || null;
    const existing = this.get(jobId);

    if (!existing) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const currentStatus = existing.status;
    const jobType = existing.jobType || 'generation';
    if (!canTransition(currentStatus, nextStatus, reason, jobType)) {
      const error = new Error(`Invalid job transition ${currentStatus} -> ${nextStatus}`);
      error.code = 'INVALID_TRANSITION';
      throw error;
    }

    const now = new Date();
    const nowIso = now.toISOString();
    let startedAt = existing.startedAt;
    let finishedAt = existing.finishedAt;
    let durationMs = existing.durationMs;
    let cancelledAt = existing.cancelledAt;

    if ((nextStatus === 'processing' || nextStatus === 'discovering') && !startedAt) {
      startedAt = nowIso;
    }

    if (nextStatus === 'cancelled') {
      cancelledAt = nowIso;
      finishedAt = nowIso;
    }

    if (nextStatus === 'completed' || nextStatus === 'failed' || nextStatus === 'cancelled') {
      finishedAt = nowIso;
      const startedTs = startedAt ? new Date(startedAt).getTime() : new Date(existing.createdAt).getTime();
      durationMs = Math.max(0, now.getTime() - startedTs);
    }

    this.db
      .prepare(
        `UPDATE jobs
         SET status = ?, started_at = ?, finished_at = ?, duration_ms = ?, cancelled_at = ?, updated_at = ?
         WHERE job_id = ?`
      )
      .run(nextStatus, startedAt, finishedAt, durationMs, cancelledAt, nowIso, jobId);

    this.events.append({
      jobId,
      level: 'info',
      eventType: 'job_status_transition',
      payload: {
        from: currentStatus,
        to: nextStatus,
        reason,
        jobType
      }
    });

    return this.get(jobId);
  }

  recoverProcessingJobs() {
    const rows = this.db
      .prepare(
        `SELECT job_id
         FROM jobs
         WHERE status IN ('processing', 'discovering', 'crawling', 'rendering', 'offsite', 'synthesizing')
         ORDER BY created_at ASC`
      )
      .all();

    const recovered = [];

    for (const row of rows) {
      try {
        this.transition(row.job_id, 'pending', { reason: 'recovery' });
        recovered.push(row.job_id);
      } catch (error) {
        if (this.logger) {
          this.logger.warn('Failed to recover processing job', {
            jobId: row.job_id,
            error: error.message
          });
        }
      }
    }

    return recovered;
  }

  canTransition(currentStatus, nextStatus, reason, jobType) {
    return canTransition(currentStatus, nextStatus, reason, jobType);
  }
}

module.exports = {
  JobsRepository,
  canTransition
};
