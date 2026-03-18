import { expect } from '@playwright/test';
import { test as base } from './test';
import { getStoredRoleAuth } from './auth-cache';

export const userFixture = base.extend<{
  userAuth: Awaited<ReturnType<typeof getStoredRoleAuth>>;
  userEmail: string;
  userToken: string;
}>({
  userAuth: async ({}, apply) => {
    const auth = await getStoredRoleAuth('user');
    await apply(auth);
  },
  storageState: async ({ userAuth }, apply) => {
    await apply(userAuth.storageStatePath);
  },
  userEmail: async ({ userAuth }, apply) => {
    await apply(userAuth.email);
  },
  userToken: async ({ userAuth }, apply) => {
    await apply(userAuth.token);
  },
});

export { expect };
