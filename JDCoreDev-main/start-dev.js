const { spawn } = require('child_process');
const { join } = require('path');

const projectDir = join(__dirname, 'JDCoreDev-main');

const isWin = process.platform === 'win32';
const child = spawn(
  isWin ? 'npx.cmd' : 'npx',
  ['tsx', '--env-file=.env', 'server/index.ts'],
  {
    cwd: projectDir,
    stdio: 'inherit',
    shell: isWin,
    env: { ...process.env, NODE_ENV: 'development' }
  }
);

child.on('exit', (code) => process.exit(code));
process.on('SIGTERM', () => child.kill());
process.on('SIGINT', () => child.kill());
