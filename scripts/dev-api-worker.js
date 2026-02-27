const { spawn } = require('child_process');
const path = require('path');
const { loadEnvFiles } = require('../runtime/load-env');

loadEnvFiles({
  rootDir: path.resolve(__dirname, '..')
});

const node = process.execPath;
const apiScript = path.join(__dirname, 'start-api.js');
const workerScript = path.join(__dirname, 'start-worker.js');

const apiProcess = spawn(node, [apiScript], { stdio: 'inherit', env: process.env });
const workerProcess = spawn(node, [workerScript], { stdio: 'inherit', env: process.env });

let exiting = false;

function shutdown(code) {
  if (exiting) {
    return;
  }
  exiting = true;

  if (!apiProcess.killed) {
    apiProcess.kill('SIGTERM');
  }

  if (!workerProcess.killed) {
    workerProcess.kill('SIGTERM');
  }

  setTimeout(() => {
    process.exit(code);
  }, 250);
}

apiProcess.on('exit', (code) => {
  shutdown(code || 0);
});

workerProcess.on('exit', (code) => {
  shutdown(code || 0);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
