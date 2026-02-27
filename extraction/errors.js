class ExtractionError extends Error {
  constructor(message, statusCode = 400, code = 'extraction_error') {
    super(message);
    this.name = 'ExtractionError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

module.exports = {
  ExtractionError
};
