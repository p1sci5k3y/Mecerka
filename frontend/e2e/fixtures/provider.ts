import { expect } from '@playwright/test';
import { test as base } from './test';
import { getStoredRoleAuth } from './auth-cache';

export const providerFixture = base.extend<{
  providerAuth: Awaited<ReturnType<typeof getStoredRoleAuth>>;
  providerEmail: string;
  providerToken: string;
}>({
  providerAuth: async ({}, apply) => {
    const auth = await getStoredRoleAuth('provider');
    await apply(auth);
  },
  storageState: async ({ providerAuth }, apply) => {
    await apply(providerAuth.storageStatePath);
  },
  providerEmail: async ({ providerAuth }, apply) => {
    await apply(providerAuth.email);
  },
  providerToken: async ({ providerAuth }, apply) => {
    await apply(providerAuth.token);
  },
});

export { expect };
