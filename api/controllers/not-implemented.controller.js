function notImplemented(message) {
  return (_req, res) => {
    res.status(501).json({
      code: 'not_implemented',
      message
    });
  };
}

module.exports = {
  notImplemented
};
