import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadTestEnv } from '../load-test-env.mjs';
import { accounts } from '../data/accounts';

type AuthManifestEntry = {
  email: string;
  token: string;
  storageStatePath: string;
};

type LoginResult = {
  accessToken: string;
  cookieValue: string | null;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractAccessTokenCookie(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    return null;
  }

  const cookiePart = setCookieHeader
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.startsWith('access_token='));

  if (!cookiePart) {
    return null;
  }

  const [nameValue] = cookiePart.split(';');
  const eqIdx = nameValue.indexOf('=');
  const cookieValue = eqIdx >= 0 ? nameValue.slice(eqIdx + 1) : '';
  return cookieValue || null;
}

async function apiLogin(
  backendUrl: string,
  email: string,
  password: string,
): Promise<LoginResult> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch(`${backendUrl}/auth/login`, {
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
        cookieValue: extractAccessTokenCookie(
          response.headers.get('set-cookie'),
        ),
      };
    }

    if (response.status !== 429 || attempt === 11) {
      throw new Error(
        `Login failed for ${email}: ${response.status} ${await response.text()}`,
      );
    }

    await sleep(1500 * (attempt + 1));
  }

  throw new Error(`Login failed for ${email}: retry budget exhausted`);
}

function buildStorageState(frontendOrigin: string, cookieValue: string | null) {
  const { hostname, protocol } = new URL(frontendOrigin);
  const expiresAt = Math.floor(Date.now() / 1000) + 15 * 60;

  return {
    cookies: cookieValue
      ? [
          {
            name: 'access_token',
            value: cookieValue,
            domain: hostname,
            path: '/',
            httpOnly: true,
            secure: protocol === 'https:',
            sameSite: 'Lax',
            expires: expiresAt,
          },
        ]
      : [],
    origins: [
      {
        origin: frontendOrigin,
        localStorage: [],
      },
    ],
  };
}

export default async function presentationDemoGlobalSetup() {
  loadTestEnv(path.resolve(__dirname, '../..'));

  const frontendOrigin =
    process.env.PLAYWRIGHT_PRESENTATION_BASE_URL ??
    'https://demo.mecerka.me';
  const backendUrl = `${new URL(frontendOrigin).origin}/api`;
  const authDir = path.resolve(process.cwd(), 'test-results', '.auth');

  await rm(authDir, { recursive: true, force: true });
  await mkdir(authDir, { recursive: true });

  const roles = {
    admin: accounts.admin,
    provider: accounts.provider2,
    runner: accounts.runner,
    runnerSevilla: accounts.runnerSevilla,
    user2: accounts.user2,
  } as const;

  const manifest = {} as Record<string, AuthManifestEntry>;

  for (const [roleName, account] of Object.entries(roles)) {
    const loginResult = await apiLogin(
      backendUrl,
      account.email,
      account.password,
    );
    const storageStatePath = path.resolve(authDir, `${roleName}.json`);

    await writeFile(
      storageStatePath,
      JSON.stringify(
        buildStorageState(new URL(frontendOrigin).origin, loginResult.cookieValue),
      ),
      'utf8',
    );

    manifest[roleName] = {
      email: account.email,
      token: loginResult.accessToken,
      storageStatePath,
    };

    await sleep(1200);
  }

  await writeFile(
    path.resolve(authDir, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
}
