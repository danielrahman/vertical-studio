const path = require('path');
const { loadEnvFiles } = require('../runtime/load-env');
const { startServer } = require('../api/server');

loadEnvFiles({
  rootDir: path.resolve(__dirname, '..')
});

startServer();
