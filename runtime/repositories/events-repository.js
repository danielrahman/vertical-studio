const { serializeJson, parseJson, isoNow } = require('./json-utils');

class EventsRepository {
  constructor(db) {
    this.db = db;
  }

  append({ jobId = null, level = 'info', eventType, payload = null }) {
    const createdAt = isoNow();

    this.db
      .prepare(
        `INSERT INTO events (job_id, level, event_type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(jobId, level, eventType, serializeJson(payload), createdAt);

    return {
      jobId,
      level,
      eventType,
      payload,
      createdAt
    };
  }

  listByJobId(jobId) {
    const rows = this.db
      .prepare(
        `SELECT id, job_id, level, event_type, payload_json, created_at
         FROM events
         WHERE job_id = ?
         ORDER BY id ASC`
      )
      .all(jobId);

    return rows.map((row) => ({
      id: row.id,
      jobId: row.job_id,
      level: row.level,
      eventType: row.event_type,
      payload: parseJson(row.payload_json, null),
      createdAt: row.created_at
    }));
  }
}

module.exports = {
  EventsRepository
};
