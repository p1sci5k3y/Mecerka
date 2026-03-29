import { execFileSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadTestEnv } from '../load-test-env.mjs';
import { accounts } from '../data/accounts';

const BACKEND_URL = 'http://localhost:3000';
const FRONTEND_URL = 'http://localhost:3001';

type AuthManifestEntry = {
  email: string;
  token: string;
  storageStatePath: string;
};

type LoginResult = {
  accessToken: string;
  cookieValue: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractAccessTokenCookie(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    throw new Error('Login response did not include access_token cookie');
  }

  const cookiePart = setCookieHeader
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.startsWith('access_token='));

  if (!cookiePart) {
    throw new Error('access_token cookie was not found in login response');
  }

  const [nameValue] = cookiePart.split(';');
  const eqIdx = nameValue.indexOf('=');
  const cookieValue = eqIdx >= 0 ? nameValue.slice(eqIdx + 1) : '';

  if (!cookieValue) {
    throw new Error('access_token cookie value is empty');
  }

  return cookieValue;
}

async function apiLogin(email: string, password: string): Promise<LoginResult> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await fetch(`${BACKEND_URL}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      const body = (await response.json()) as { access_token: string };
      return {
        accessToken: body.access_token,
        cookieValue: extractAccessTokenCookie(response.headers.get('set-cookie')),
      };
    }

    if (response.status !== 429 || attempt === 9) {
      throw new Error(
        `Login failed for ${email}: ${response.status} ${await response.text()}`,
      );
    }

    await sleep(1000 * (attempt + 1));
  }

  throw new Error(`Login failed for ${email}: retry budget exhausted`);
}

function buildStorageState(cookieValue: string) {
  return {
    cookies: [
      {
        name: 'access_token',
        value: cookieValue,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
        expires: Math.floor(Date.now() / 1000) + 15 * 60,
      },
    ],
    origins: [
      {
        origin: FRONTEND_URL,
        localStorage: [],
      },
    ],
  };
}

async function waitForDemoAccounts() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await apiLogin(accounts.admin.email, accounts.admin.password);
      return;
    } catch {
      await sleep(1000);
    }
  }

  throw new Error('Demo accounts were not ready for presentation auth setup');
}

export default async function presentationGlobalSetup() {
  loadTestEnv(path.resolve(__dirname, '../..'));

  const workspaceRoot = path.resolve(__dirname, '../../..');
  const backendRoot = path.resolve(__dirname, '../../../backend');
  const authDir = path.resolve(process.cwd(), 'test-results', '.auth');
  const databaseUrl =
    process.env.DATABASE_URL ||
    'postgresql://postgres:change_me@localhost:5432/marketplace';
  const baseEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl,
  };

  execFileSync(path.resolve(backendRoot, 'node_modules/.bin/prisma'), [
    'migrate',
    'deploy',
  ], {
    stdio: 'inherit',
    cwd: backendRoot,
    env: baseEnv,
  });

  execFileSync(
    'node',
    [path.resolve(__dirname, '../../../backend/seed-e2e-admin.js')],
    {
      stdio: 'inherit',
      cwd: workspaceRoot,
      env: baseEnv,
    },
  );

  execFileSync(
    'node',
    [path.resolve(__dirname, '../../../backend/seed-e2e-demo-dataset.js')],
    {
      stdio: 'inherit',
      cwd: backendRoot,
      env: baseEnv,
    },
  );

  execFileSync(
    'node',
    [path.resolve(__dirname, '../../../backend/seed-e2e-demo-accounts.js')],
    {
      stdio: 'inherit',
      cwd: workspaceRoot,
      env: {
        ...baseEnv,
        E2E_DEMO_PASSWORD: accounts.admin.password,
      },
    },
  );
  await waitForDemoAccounts();

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
    const loginResult = await apiLogin(account.email, account.password);
    const storageStatePath = path.resolve(authDir, `${roleName}.json`);

    await writeFile(
      storageStatePath,
      JSON.stringify(buildStorageState(loginResult.cookieValue)),
      'utf8',
    );

    manifest[roleName] = {
      email: account.email,
      token: loginResult.accessToken,
      storageStatePath,
    };
  }

  await writeFile(
    path.resolve(authDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
}
