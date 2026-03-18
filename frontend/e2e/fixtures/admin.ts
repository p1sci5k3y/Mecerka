import { expect } from '@playwright/test';
import { test as base } from './test';
import { getStoredRoleAuth } from './auth-cache';

export const adminFixture = base.extend<{
  adminAuth: Awaited<ReturnType<typeof getStoredRoleAuth>>;
  adminEmail: string;
  adminToken: string;
}>({
  adminAuth: async ({}, apply) => {
    const auth = await getStoredRoleAuth('admin');
    await apply(auth);
  },
  storageState: async ({ adminAuth }, apply) => {
    await apply(adminAuth.storageStatePath);
  },
  adminEmail: async ({ adminAuth }, apply) => {
    await apply(adminAuth.email);
  },
  adminToken: async ({ adminAuth }, apply) => {
    await apply(adminAuth.token);
  },
});

export { expect };
