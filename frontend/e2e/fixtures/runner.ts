import { expect } from '@playwright/test';
import { test as base } from './test';
import { getStoredRoleAuth } from './auth-cache';

export const runnerFixture = base.extend<{
  runnerAuth: Awaited<ReturnType<typeof getStoredRoleAuth>>;
  runnerEmail: string;
  runnerToken: string;
}>({
  runnerAuth: async ({}, apply) => {
    const auth = await getStoredRoleAuth('runner');
    await apply(auth);
  },
  storageState: async ({ runnerAuth }, apply) => {
    await apply(runnerAuth.storageStatePath);
  },
  runnerEmail: async ({ runnerAuth }, apply) => {
    await apply(runnerAuth.email);
  },
  runnerToken: async ({ runnerAuth }, apply) => {
    await apply(runnerAuth.token);
  },
});

export { expect };
