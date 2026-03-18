import { runnerFixture as test, expect } from '../fixtures/runner';
import {
  apiPostJson,
  createAssignedDeliveryForRunner,
  getStoredRoleToken,
} from '../fixtures/demo';

test.describe('runner', () => {
  test('logs in, views assigned deliveries and completes pickup-to-delivered flow', async ({
    page,
    request,
    runnerToken,
  }) => {
    const userToken = await getStoredRoleToken('user');
    const delivery = await createAssignedDeliveryForRunner(
      request,
      undefined,
      undefined,
      userToken,
      runnerToken,
    );

    await page.goto('/es/dashboard');

    await expect(
      page.getByRole('heading', { name: /panel de ruta/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /ruta actual/i }),
    ).toBeVisible();

    const token = runnerToken;

    await apiPostJson(
      request,
      `/delivery/orders/${delivery.deliveryOrderId}/pickup-pending`,
      {},
      token,
    );
    await apiPostJson(
      request,
      `/delivery/orders/${delivery.deliveryOrderId}/pickup`,
      {},
      token,
    );
    await apiPostJson(
      request,
      `/delivery/orders/${delivery.deliveryOrderId}/start-transit`,
      {},
      token,
    );
    const completed = await apiPostJson<any>(
      request,
      `/delivery/orders/${delivery.deliveryOrderId}/delivered`,
      { deliveryNotes: 'Entrega E2E completada' },
      token,
    );

    expect(completed.status).toBe('DELIVERED');
  });
});
