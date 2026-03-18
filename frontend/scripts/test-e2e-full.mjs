import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');
const frontendDir = path.resolve(__dirname, '..');

function run(command, args, cwd, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run('docker', ['compose', 'up', '-d', '--build'], repoRoot, {
  E2E: 'true',
});
run('node', ['scripts/wait-for-backend.mjs'], frontendDir, {
  PLAYWRIGHT_BACKEND_HEALTH_URL: 'http://localhost:3000/health',
  PLAYWRIGHT_FRONTEND_URL: 'http://localhost:3001/es/login',
});
run('npx', ['playwright', 'install', 'chromium'], frontendDir);
run('npx', ['playwright', 'test', '--config=e2e.config.mjs'], frontendDir, {
  E2E: 'true',
  PLAYWRIGHT_EXTERNAL_STACK: 'true',
  PLAYWRIGHT_BASE_URL: 'http://localhost:3001',
});
