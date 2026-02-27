class DeployError extends Error {
  constructor(message, statusCode = 400, code = 'deploy_error') {
    super(message);
    this.name = 'DeployError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

module.exports = {
  DeployError
};
