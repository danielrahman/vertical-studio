function getAnalytics(req, res, next) {
  try {
    const { metrics } = req.app.locals.repositories;
    res.status(200).json(metrics.getAnalytics());
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAnalytics
};
