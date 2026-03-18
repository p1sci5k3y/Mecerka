import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { getContainerRuntimeClient } from 'testcontainers';

const TEST_ENV_PREFIX = 'tfm-backend-test-env-';

type TestEnvState = {
  containerId?: string;
  databaseUrl?: string;
  host?: string;
  ownerPid?: number;
  port?: number;
};

function logTestEnv(event: string, fields: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      scope: 'test-env',
      event,
      timestamp: new Date().toISOString(),
      ...fields,
    }),
  );
}

function getStateFiles() {
  return readdirSync(tmpdir())
    .filter(
      (entry) => entry.startsWith(TEST_ENV_PREFIX) && entry.endsWith('.json'),
    )
    .map((entry) => path.join(tmpdir(), entry));
}

function isProcessAlive(pid?: number) {
  if (!pid || pid <= 0) {
    return false;
  }

  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function cleanupContainer(containerId: string) {
  try {
    const client = await getContainerRuntimeClient();
    const container = client.container.getById(containerId);
    await client.container.stop(container, { timeout: 10_000 });
    await client.container.remove(container, { removeVolumes: true });
    return 'testcontainers';
  } catch (error) {
    logTestEnv('container.cleanup.fallback', {
      containerId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  execFileSync('docker', ['rm', '-f', '-v', containerId], {
    stdio: 'ignore',
  });
  return 'docker-cli';
}

export default async function globalTestTeardown() {
  for (const stateFile of getStateFiles()) {
    try {
      if (!existsSync(stateFile)) {
        continue;
      }

      const state = JSON.parse(readFileSync(stateFile, 'utf8')) as TestEnvState;

      if (
        state.ownerPid !== undefined &&
        state.ownerPid !== process.pid &&
        isProcessAlive(state.ownerPid)
      ) {
        logTestEnv('teardown.skip.active-run', {
          stateFile,
          ownerPid: state.ownerPid,
        });
        continue;
      }

      if (state.containerId) {
        const strategy = await cleanupContainer(state.containerId);
        logTestEnv('teardown.cleaned', {
          containerId: state.containerId,
          databaseUrl: state.databaseUrl ?? '<unknown>',
          host: state.host ?? '<unknown>',
          port: state.port ?? '<unknown>',
          stateFile,
          strategy,
        });
      }
    } finally {
      if (existsSync(stateFile)) {
        rmSync(stateFile, { force: true });
      }
    }
  }
}
