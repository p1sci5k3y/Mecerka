import { demoProducts } from '../../../e2e/data/accounts';
import { userFixture as test, expect } from '../../../e2e/fixtures/user';
import {
  apiGetJson,
  apiPatchJson,
  apiPostJson,
  findProductByName,
  getStoredRoleToken,
} from '../../../e2e/fixtures/demo';

test.describe('multi-provider order aggregation', () => {
  test('creates one aggregated order for two providers and hands off a single shipment to the runner', async ({
    page,
    request,
    userToken,
  }) => {
    const bread = await findProductByName(request, demoProducts.bread);
    const tomatoes = await findProductByName(request, demoProducts.tomatoes);

    expect(bread.providerId).not.toBe(tomatoes.providerId);

    await page.goto('/es/products');
    await expect(
      page.getByRole('heading', { name: /catálogo de productos/i }),
    ).toBeVisible();

    await apiPostJson(
      request,
      '/cart/items',
      { productId: bread.id, quantity: 1 },
      userToken,
    );
    await apiPostJson(
      request,
      '/cart/items',
      { productId: tomatoes.id, quantity: 1 },
      userToken,
    );
    const cart = await apiGetJson<any>(request, '/cart/me', userToken);
    const cartItemNames = cart.providers.flatMap((provider: any) =>
      provider.items.map((item: any) => item.productNameSnapshot),
    );
    expect(cartItemNames).toContain(demoProducts.bread);
    expect(cartItemNames).toContain(demoProducts.tomatoes);

    const checkoutKey = `pw-multi-provider-${Date.now()}`;
    const createdOrder = await apiPostJson<any>(
      request,
      '/cart/checkout',
      {},
      userToken,
      { 'Idempotency-Key': checkoutKey },
    );

    expect(createdOrder.id).toBeTruthy();
    expect(createdOrder.providerOrders).toHaveLength(2);

    const createdProviderIds = new Set(
      createdOrder.providerOrders.map((providerOrder: any) => providerOrder.providerId),
    );
    expect(createdProviderIds.size).toBe(2);

    const flattenedItems = createdOrder.providerOrders.flatMap(
      (providerOrder: any) => providerOrder.items,
    );
    expect(flattenedItems).toHaveLength(2);

    const providerAOrder = createdOrder.providerOrders.find(
      (providerOrder: any) => providerOrder.providerId === bread.providerId,
    );
    const providerBOrder = createdOrder.providerOrders.find(
      (providerOrder: any) => providerOrder.providerId === tomatoes.providerId,
    );

    expect(providerAOrder.items[0].productId).toBe(bread.id);
    expect(providerBOrder.items[0].productId).toBe(tomatoes.id);

    const providerToken = await getStoredRoleToken('provider');
    const provider2Token = await getStoredRoleToken('provider2');

    const providerOrdersA = await apiGetJson<any[]>(
      request,
      '/orders',
      providerToken,
    );
    const providerOrdersB = await apiGetJson<any[]>(request, '/orders', provider2Token);

    const providerViewA = providerOrdersA.find((order) => order.id === createdOrder.id);
    const providerViewB = providerOrdersB.find((order) => order.id === createdOrder.id);

    expect(providerViewA.providerOrders).toHaveLength(1);
    expect(providerViewB.providerOrders).toHaveLength(1);
    expect(providerViewA.providerOrders[0].items[0].productId).toBe(bread.id);
    expect(providerViewB.providerOrders[0].items[0].productId).toBe(tomatoes.id);

    await apiPatchJson(
      request,
      `/orders/provider-order/${providerAOrder.id}/status`,
      { status: 'ACCEPTED' },
      providerToken,
    );
    await apiPatchJson(
      request,
      `/orders/provider-order/${providerAOrder.id}/status`,
      { status: 'PREPARING' },
      providerToken,
    );
    await apiPatchJson(
      request,
      `/orders/provider-order/${providerAOrder.id}/status`,
      { status: 'READY_FOR_PICKUP' },
      providerToken,
    );

    await apiPatchJson(
      request,
      `/orders/provider-order/${providerBOrder.id}/status`,
      { status: 'ACCEPTED' },
      provider2Token,
    );
    await apiPatchJson(
      request,
      `/orders/provider-order/${providerBOrder.id}/status`,
      { status: 'PREPARING' },
      provider2Token,
    );
    await apiPatchJson(
      request,
      `/orders/provider-order/${providerBOrder.id}/status`,
      { status: 'READY_FOR_PICKUP' },
      provider2Token,
    );

    const userOrders = await apiGetJson<any[]>(request, '/orders', userToken);
    const aggregatedOrder = userOrders.find((order) => order.id === createdOrder.id);
    expect(aggregatedOrder.providerOrders).toHaveLength(2);
    expect(
      aggregatedOrder.providerOrders.every(
        (providerOrder: any) => providerOrder.status === 'READY_FOR_PICKUP',
      ),
    ).toBe(true);

    const runnerToken = await getStoredRoleToken('runner');
    const runnerProfile = await apiGetJson<any>(request, '/auth/me', runnerToken);

    const deliveryOrder = await apiPostJson<any>(
      request,
      '/delivery/orders',
      {
        orderId: createdOrder.id,
        deliveryFee: 4.5,
        currency: 'EUR',
      },
      userToken,
    );

    const assignedOrder = await apiPostJson<any>(
      request,
      `/delivery/orders/${deliveryOrder.id}/assign-runner`,
      {
        runnerId: runnerProfile.userId,
      },
      userToken,
    );
    expect(assignedOrder.orderId).toBe(createdOrder.id);
    expect(assignedOrder.runnerId).toBeTruthy();

    const runnerDelivery = await apiGetJson<any>(
      request,
      `/delivery/orders/${deliveryOrder.id}`,
      runnerToken,
    );
    expect(runnerDelivery.id).toBe(deliveryOrder.id);
    expect(runnerDelivery.orderId).toBe(createdOrder.id);
    expect(runnerDelivery.runnerId).toBe(runnerProfile.userId);
  });
});
