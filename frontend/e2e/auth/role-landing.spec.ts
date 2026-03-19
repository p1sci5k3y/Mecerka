import { accounts } from '../data/accounts';
import { test, expect } from '../fixtures/test';
import { loginThroughUi } from '../fixtures/demo';

test.describe('role landing', () => {
  test('sends a provider to the operational sales panel', async ({ page }) => {
    await loginThroughUi(page, accounts.provider);

    await expect(page).toHaveURL(/\/es\/provider\/sales$/);
    await expect(
      page.getByRole('heading', { name: /panel operativo/i }),
    ).toBeVisible();
  });

  test('sends a runner to the operational delivery panel', async ({ page }) => {
    await loginThroughUi(page, accounts.runner);

    await expect(page).toHaveURL(/\/es\/runner$/);
    await expect(
      page.getByRole('heading', { name: /panel de repartidor/i }),
    ).toBeVisible();
  });

  test('sends an admin to the admin panel', async ({ page }) => {
    await loginThroughUi(page, accounts.admin);

    await expect(page).toHaveURL(/\/es\/admin$/);
    await expect(
      page.getByRole('heading', { name: /^dashboard$/i }),
    ).toBeVisible();
  });
});
