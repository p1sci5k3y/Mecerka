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
  const authDir = path.resolve(process.cwd(), 'test-results', '.auth');
  const storageStatePath = path.resolve(
    authDir,
    `${projectName}-${roleName}.json`,
  );

  await mkdir(authDir, { recursive: true });
  await writeFile(
    storageStatePath,
    JSON.stringify({
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
    }),
    'utf8',
  );

  return {
    email: account.email,
    token,
    storageStatePath,
  };
}
