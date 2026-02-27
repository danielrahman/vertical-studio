function errorHandler(err, req, res, _next) {
  let statusCode = Number.isInteger(err.statusCode) ? err.statusCode : 500;
  let code = err.code || (statusCode >= 500 ? 'internal_error' : 'bad_request');

  const message = String(err.message || '');
  if (!Number.isInteger(err.statusCode) && message.includes('UNIQUE constraint failed')) {
    statusCode = 409;
    code = 'conflict';
  }

  if (!Number.isInteger(err.statusCode) && message.includes('FOREIGN KEY constraint failed')) {
    statusCode = 400;
    code = 'invalid_reference';
  }

  const response = {
    code,
    message: err.message || 'Unexpected error',
    requestId: req.id
  };

  if (err.details) {
    response.details = err.details;
  }

  res.status(statusCode).json(response);
}

module.exports = {
  errorHandler
};
