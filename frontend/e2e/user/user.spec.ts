import { accounts, demoProducts } from '../data/accounts';
import { userFixture as test, expect } from '../fixtures/user';
import {
  apiGetJson,
  apiPostJson,
  createPendingOrderForUser,
  findProductByName,
} from '../fixtures/demo';

test.describe('user', () => {
  test('logs in, browses products and adds items from multiple providers to the cart', async ({
    page,
    request,
    userToken,
  }) => {
    await page.goto('/es/products');

    await expect(
      page.getByRole('heading', { name: /catálogo de productos/i }),
    ).toBeVisible();

    const bread = await findProductByName(request, demoProducts.bread);
    const tomatoes = await findProductByName(request, demoProducts.tomatoes);

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
  });

  test('places an order through the real backend and can see its status', async ({
    page,
    request,
    userToken,
  }) => {
    const { order } = await createPendingOrderForUser(
      request,
      accounts.user,
      demoProducts.bread,
      userToken,
    );

    await page.goto('/es/dashboard');
    await expect(
      page.getByRole('heading', { name: /cuaderno de pedidos/i }),
    ).toBeVisible();
    await expect(
      page.getByText(`#${order.id.slice(0, 8).toUpperCase()}`),
    ).toBeVisible();
  });
});
