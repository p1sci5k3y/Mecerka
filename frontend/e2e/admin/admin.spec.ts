import { accounts } from '../data/accounts';
import { adminFixture as test, expect } from '../fixtures/admin';
import {
  apiGetJson,
  getKnownOrderIdForAdmin,
  getStoredRoleToken,
} from '../fixtures/demo';

test.describe('admin', () => {
  test('logs in, lists providers, views orders through the real API and inspects metrics', async ({
    page,
    request,
    adminToken,
  }) => {
    await page.goto('/es/admin');

    await expect(page.getByRole('heading', { name: /^dashboard$/i })).toBeVisible();
    await expect(page.getByText(/usuarios totales/i)).toBeVisible();
    await expect(page.getByText(/pedidos totales/i)).toBeVisible();

    await page.goto('/es/admin/users');
    await expect(
      page.getByRole('heading', { name: /gestión de usuarios/i }),
    ).toBeVisible();
    await expect(page.getByText(accounts.provider.email)).toBeVisible();
    await expect(page.getByText(accounts.provider2.email)).toBeVisible();

    const userToken = await getStoredRoleToken('user');
    const orderId = await getKnownOrderIdForAdmin(request, userToken);
    const order = await apiGetJson<any>(
      request,
      `/orders/${orderId}`,
      adminToken,
    );
    expect(order.id).toBe(orderId);
    expect(order.providerOrders.length).toBeGreaterThan(0);
  });
});
