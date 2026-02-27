const { spawn } = require('child_process');
const path = require('path');
const { loadEnvFiles } = require('../runtime/load-env');

loadEnvFiles({
  rootDir: path.resolve(__dirname, '..')
});

const uiCwd = path.resolve(__dirname, '..', 'presentation');

const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['next', 'dev', '-p', '3001'], {
  stdio: 'inherit',
  env: process.env,
  cwd: uiCwd
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
