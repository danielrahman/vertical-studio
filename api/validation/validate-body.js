const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

function validateBody(schema) {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  return (req, _res, next) => {
    const valid = validate(req.body);
    if (valid) {
      next();
      return;
    }

    const error = new Error('Invalid request body');
    error.statusCode = 400;
    error.code = 'validation_error';
    error.details = validate.errors || [];
    next(error);
  };
}

module.exports = {
  validateBody
};
