import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { getContainerRuntimeClient } from 'testcontainers';

const TEST_ENV_PREFIX = 'tfm-backend-test-env-';
const PRISMA_BIN = path.resolve(__dirname, '../node_modules/.bin/prisma');
const STARTUP_TIMEOUT_MS = 120_000;
const MIGRATION_TIMEOUT_MS = 120_000;
const STARTUP_RETRIES = 3;
const READINESS_RETRIES = 10;

type TestEnvState = {
  containerId: string;
  database: string;
  databaseUrl: string;
  host: string;
  ownerPid: number;
  port: number;
  startedAt: number;
  stateFile: string;
};

function randomHex(bytes: number) {
  return randomBytes(bytes).toString('hex');
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getStateFilePath() {
  return path.join(
    tmpdir(),
    `${TEST_ENV_PREFIX}${process.pid}-${Date.now()}-${randomHex(4)}.json`,
  );
}

function sanitizeDatabaseUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return '<invalid>';
  }
}

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

function cleanupStateFile(stateFile: string) {
  if (existsSync(stateFile)) {
    rmSync(stateFile, { force: true });
  }
}

async function cleanupContainer(containerId: string) {
  try {
    const client = await getContainerRuntimeClient();
    const container = client.container.getById(containerId);
    await client.container.stop(container, { timeout: 10_000 });
    await client.container.remove(container, { removeVolumes: true });
    return;
  } catch (error) {
    logTestEnv('container.cleanup.fallback', {
      containerId,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  execFileSync('docker', ['rm', '-f', '-v', containerId], {
    stdio: 'ignore',
  });
}

async function startPostgresContainer() {
  const postgresPassword = randomHex(16);
  let lastError: unknown;

  for (let attempt = 1; attempt <= STARTUP_RETRIES; attempt += 1) {
    try {
      return await new PostgreSqlContainer('postgres:15-alpine')
        .withDatabase('marketplace')
        .withUsername('postgres')
        .withPassword(postgresPassword)
        .withStartupTimeout(STARTUP_TIMEOUT_MS)
        .start();
    } catch (error) {
      lastError = error;

      if (attempt === STARTUP_RETRIES) {
        break;
      }

      logTestEnv('postgres.start.retry', {
        attempt,
        reason: error instanceof Error ? error.message : String(error),
      });
      await sleep(1_000 * attempt);
    }
  }

  throw lastError;
}

async function waitForDatabase(databaseUrl: string) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= READINESS_RETRIES; attempt += 1) {
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });

    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      return;
    } catch (error) {
      lastError = error;
      const backoffMs = Math.min(2_000, 100 * 2 ** (attempt - 1));

      logTestEnv('postgres.readiness.retry', {
        attempt,
        backoffMs,
        reason: error instanceof Error ? error.message : String(error),
      });
      await sleep(backoffMs);
    } finally {
      await prisma.$disconnect();
    }
  }

  throw lastError;
}

export default async function globalTestSetup() {
  const backendDir = path.resolve(__dirname, '..');
  const stateFile = getStateFilePath();
  const startupStartedAt = Date.now();
  const container = await startPostgresContainer();
  const startupDurationMs = Date.now() - startupStartedAt;
  const databaseUrl = container.getConnectionUri();
  const sanitizedDatabaseUrl = sanitizeDatabaseUrl(databaseUrl);
  const state: TestEnvState = {
    containerId: container.getId(),
    database: container.getDatabase(),
    databaseUrl: sanitizedDatabaseUrl,
    host: container.getHost(),
    ownerPid: process.pid,
    port: container.getMappedPort(5432),
    startedAt: Date.now(),
    stateFile,
  };

  process.env.NODE_ENV = 'test';
  process.env.E2E = 'true';
  process.env.DEMO_MODE = 'false';
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_SECRET = randomHex(32);
  process.env.JWT_SECRET_CURRENT = process.env.JWT_SECRET;
  process.env.FISCAL_PEPPER = randomHex(32);
  process.env.STRIPE_SECRET_KEY = `sk_test_${randomHex(16)}`;
  process.env.STRIPE_WEBHOOK_SECRET = `whsec_${randomHex(16)}`;
  process.env.DELIVERY_STRIPE_WEBHOOK_SECRET = `whsec_${randomHex(16)}`;
  process.env.DONATIONS_STRIPE_WEBHOOK_SECRET = `whsec_${randomHex(16)}`;
  process.env.FRONTEND_URL = 'http://localhost:3001';

  writeFileSync(stateFile, JSON.stringify(state), 'utf8');

  logTestEnv('postgres.started', {
    containerId: state.containerId,
    host: state.host,
    port: state.port,
    database: state.database,
    databaseUrl: state.databaseUrl,
    startupDurationMs,
    stateFile,
  });

  try {
    const readinessStartedAt = Date.now();
    await waitForDatabase(databaseUrl);
    logTestEnv('postgres.ready', {
      containerId: state.containerId,
      readinessDurationMs: Date.now() - readinessStartedAt,
    });

    const migrationStartedAt = Date.now();
    execFileSync(PRISMA_BIN, ['migrate', 'deploy'], {
      cwd: backendDir,
      stdio: 'inherit',
      env: process.env,
      timeout: MIGRATION_TIMEOUT_MS,
    });

    logTestEnv('prisma.migrate.completed', {
      containerId: state.containerId,
      migrationDurationMs: Date.now() - migrationStartedAt,
    });
  } catch (error) {
    logTestEnv('setup.failed', {
      containerId: state.containerId,
      reason: error instanceof Error ? error.message : String(error),
    });

    try {
      await cleanupContainer(state.containerId);
    } finally {
      cleanupStateFile(stateFile);
    }

    throw error;
  }
}
