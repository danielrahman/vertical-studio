const path = require('path');
const { loadEnvFiles } = require('../runtime/load-env');
const { runWorker } = require('../worker/runner');

loadEnvFiles({
  rootDir: path.resolve(__dirname, '..')
});

runWorker().catch((error) => {
  console.error(error);
  process.exit(1);
});
