function getHealth(req, res) {
  const { queue, startedAt, repositories } = req.app.locals;
  const queueStats = queue.stats();
  const totals = repositories.metrics.getAnalytics().totals;

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    queue: queueStats,
    jobs: totals
  });
}

module.exports = {
  getHealth
};
