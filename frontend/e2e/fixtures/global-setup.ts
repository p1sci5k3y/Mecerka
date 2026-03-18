import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadTestEnv } from '../load-test-env.mjs';
import {
  accounts,
  BOOTSTRAP_ADMIN_EMAIL,
  BOOTSTRAP_ADMIN_PASSWORD,
} from '../data/accounts';

const BACKEND_URL = 'http://localhost:3000';
const FRONTEND_URL = 'http://localhost:3001';

type AuthManifestEntry = {
  email: string;
  token: string;
  storageStatePath: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiLogin(email: string, password: string) {
  const response = await fetch(`${BACKEND_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(
      `Login failed for ${email}: ${response.status} ${await response.text()}`,
    );
  }

  const body = (await response.json()) as { access_token: string };
  return body.access_token;
}

async function resetDemoOnce(bootstrapToken: string) {
  const response = await fetch(`${BACKEND_URL}/demo/reset`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bootstrapToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Demo reset failed: ${response.status} ${await response.text()}`,
    );
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const loginResponse = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: accounts.admin.email,
        password: accounts.admin.password,
      }),
    });

    if (loginResponse.ok) {
      return;
    }

    await sleep(500);
  }

  throw new Error('Demo data was not ready after reset');
}

function buildStorageState(token: string) {
  return {
    cookies: [],
    origins: [
      {
        origin: FRONTEND_URL,
        localStorage: [
          {
            name: 'token',
            value: token,
          },
        ],
      },
    ],
  };
}

export default async function globalSetup() {
  loadTestEnv(path.resolve(__dirname, '../..'));
  const scriptPath = path.resolve(
    __dirname,
    '../../../backend/seed-e2e-admin.js',
  );
  const env = { ...process.env };
  const authDir = path.resolve(process.cwd(), 'test-results', '.auth');

  if (!env.DATABASE_URL || env.DATABASE_URL.includes('@postgres:')) {
    env.DATABASE_URL =
      'postgresql://postgres:change_me@localhost:5432/marketplace';
  }

  execFileSync('node', [scriptPath], {
    stdio: 'inherit',
    cwd: path.resolve(__dirname, '../../..'),
    env,
  });

  const bootstrapToken = await apiLogin(
    BOOTSTRAP_ADMIN_EMAIL,
    BOOTSTRAP_ADMIN_PASSWORD,
  );
  await resetDemoOnce(bootstrapToken);

  await rm(authDir, { recursive: true, force: true });
  await mkdir(authDir, { recursive: true });

  const roles = {
    admin: accounts.admin,
    provider: accounts.provider,
    provider2: accounts.provider2,
    runner: accounts.runner,
    runner2: accounts.runner2,
    user: accounts.user,
    user2: accounts.user2,
  } as const;

  const manifest = {} as Record<string, AuthManifestEntry>;

  for (const [roleName, account] of Object.entries(roles)) {
    const token = await apiLogin(account.email, account.password);
    const storageStatePath = path.resolve(authDir, `${roleName}.json`);

    await writeFile(
      storageStatePath,
      JSON.stringify(buildStorageState(token)),
      'utf8',
    );

    manifest[roleName] = {
      email: account.email,
      token,
      storageStatePath,
    };
  }

  await writeFile(
    path.resolve(authDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
}
