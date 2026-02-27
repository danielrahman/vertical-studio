const { spawn } = require('child_process');
const path = require('path');
const { loadEnvFiles } = require('../runtime/load-env');

loadEnvFiles({
  rootDir: path.resolve(__dirname, '..')
});

const node = process.execPath;
const apiScript = path.join(__dirname, 'start-api.js');
const workerScript = path.join(__dirname, 'start-worker.js');
const uiCwd = path.resolve(__dirname, '..', 'presentation');

const apiProcess = spawn(node, [apiScript], { stdio: 'inherit', env: process.env });
const workerProcess = spawn(node, [workerScript], { stdio: 'inherit', env: process.env });
const uiProcess = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'dev', '-p', '3001'], {
  stdio: 'inherit',
  env: process.env,
  cwd: uiCwd
});

let exiting = false;

function shutdown(code) {
  if (exiting) {
    return;
  }

  exiting = true;

  for (const child of [apiProcess, workerProcess, uiProcess]) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    process.exit(code);
  }, 500);
}

apiProcess.on('exit', (code) => shutdown(code || 0));
workerProcess.on('exit', (code) => shutdown(code || 0));
uiProcess.on('exit', (code) => shutdown(code || 0));

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
