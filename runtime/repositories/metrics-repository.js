function percentile(values, p) {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

class MetricsRepository {
  constructor(db) {
    this.db = db;
  }

  getAnalytics() {
    const totalsRows = this.db
      .prepare('SELECT status, COUNT(*) AS count FROM jobs GROUP BY status')
      .all();

    const totals = {
      pending: 0,
      processing: 0,
      discovering: 0,
      crawling: 0,
      rendering: 0,
      offsite: 0,
      synthesizing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };

    for (const row of totalsRows) {
      if (Object.prototype.hasOwnProperty.call(totals, row.status)) {
        totals[row.status] = row.count;
      }
    }

    const durationRows = this.db
      .prepare('SELECT duration_ms FROM jobs WHERE duration_ms IS NOT NULL')
      .all();
    const durations = durationRows.map((row) => Number(row.duration_ms)).filter(Number.isFinite);

    const avgMs = durations.length
      ? Math.round(durations.reduce((sum, item) => sum + item, 0) / durations.length)
      : 0;

    const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const throughputRow = this.db
      .prepare('SELECT COUNT(*) AS count FROM jobs WHERE created_at >= ?')
      .get(dayAgoIso);

    return {
      totals,
      durations: {
        avgMs,
        p95Ms: percentile(durations, 95)
      },
      throughput: {
        last24h: throughputRow ? throughputRow.count : 0
      }
    };
  }
}

module.exports = {
  MetricsRepository,
  percentile
};
