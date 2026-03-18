import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { apiLogin, FRONTEND_URL } from './demo';

type DemoAccount = {
  email: string;
  password: string;
};

export type StoredRoleAuth = {
  email: string;
  token: string;
  storageStatePath: string;
};

function extractAccessTokenCookie(setCookieHeader: string | undefined) {
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
  const [, cookieValue] = nameValue.split('=');

  if (!cookieValue) {
    throw new Error('access_token cookie value is empty');
  }

  return cookieValue;
}

export async function createStoredRoleAuth(
  request: APIRequestContext,
  roleName: string,
  account: DemoAccount,
  projectName: string,
): Promise<StoredRoleAuth> {
  if (!account.email.endsWith('@local.test')) {
    throw new Error(
      `Refusing to create auth state for non-demo account: ${account.email}`,
    );
  }

  const token = await apiLogin(request, account);
  const loginResponse = await request.post('http://localhost:3000/auth/login', {
    data: account,
  });
  const cookieValue = extractAccessTokenCookie(loginResponse.headers()['set-cookie']);
  const authDir = path.resolve(process.cwd(), 'test-results', '.auth');
  const storageStatePath = path.resolve(
    authDir,
    `${projectName}-${roleName}.json`,
  );

  await mkdir(authDir, { recursive: true });
  await writeFile(
    storageStatePath,
    JSON.stringify({
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
    }),
    'utf8',
  );

  return {
    email: account.email,
    token,
    storageStatePath,
  };
}
