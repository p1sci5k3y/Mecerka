import { test, expect } from '../fixtures/test';

const mockedProducts = [
  {
    id: 'product-1',
    name: 'Cuenco Terra',
    description: 'Cerámica local',
    price: '12.00',
    stock: 5,
    imageUrl: undefined,
    cityId: 'city-1',
    city: { id: 'city-1', name: 'Sevilla', slug: 'sevilla' },
    categoryId: 'category-1',
    category: { id: 'category-1', name: 'Cerámica', slug: 'ceramica' },
    providerId: 'provider-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'product-2',
    name: 'Lámpara Barrio',
    description: 'Luz artesanal',
    price: '19.00',
    stock: 3,
    imageUrl: undefined,
    cityId: 'city-1',
    city: { id: 'city-1', name: 'Sevilla', slug: 'sevilla' },
    categoryId: 'category-2',
    category: { id: 'category-2', name: 'Iluminación', slug: 'iluminacion' },
    providerId: 'provider-2',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
] as const;

test.describe('public cart flow', () => {
  test('keeps the cart visible without session and returns to /cart after login', async ({
    page,
  }) => {
    let authenticated = false;

    await page.route('**/products', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockedProducts),
      });
    });

    await page.route('**/auth/me', async (route) => {
      if (!authenticated) {
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Unauthorized',
            statusCode: 401,
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          userId: 'client-1',
          email: 'buyer@example.com',
          name: 'Buyer',
          roles: ['CLIENT'],
          mfaEnabled: false,
          hasPin: false,
          stripeAccountId: null,
        }),
      });
    });

    await page.route('**/auth/login', async (route) => {
      authenticated = true;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'cookie-session-token',
          mfaRequired: false,
          user: {
            id: 'client-1',
            email: 'buyer@example.com',
            roles: ['CLIENT'],
            mfaEnabled: false,
            hasPin: false,
          },
        }),
      });
    });

    await page.goto('/es/products');

    await expect(page.locator('header a[href$="/cart"]').first()).toBeVisible();

    await page.getByRole('button', { name: /añadir/i }).first().click();

    await page.goto('/es/cart');
    await expect(
      page.getByRole('heading', { name: /tu cesta/i }),
    ).toBeVisible();
    await expect(page.getByText(/cuenco terra/i)).toBeVisible();

    await page.getByLabel(/dirección para la entrega/i).fill('Calle Real 12');
    await page.getByRole('button', { name: /confirmar y pagar/i }).click();

    await expect(page).toHaveURL(/\/es\/login\?returnTo=%2Fcart/);

    await page.getByLabel(/correo electrónico|email/i).fill('buyer@example.com');
    await page.getByLabel(/contraseña|password/i).fill('StrongPass123!');
    await page.getByRole('button', { name: /iniciar sesión|login/i }).click();

    await expect(page).toHaveURL(/\/es\/cart$/);
    await expect(page.getByText(/cuenco terra/i)).toBeVisible();
  });

  test('blocks products from different providers in the same cart', async ({
    page,
  }) => {
    await page.route('**/products', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockedProducts),
      });
    });

    await page.goto('/es/products');

    const addButtons = page.getByRole('button', { name: /añadir/i });
    await addButtons.nth(0).click();
    await addButtons.nth(1).click();

    await expect(
      page.getByText(/solo admite productos de un mismo taller/i),
    ).toBeVisible();

    await page.goto('/es/cart');
    await expect(page.getByText(/cuenco terra/i)).toBeVisible();
    await expect(page.getByText(/lámpara barrio/i)).toHaveCount(0);
    await expect(page.getByText(/1 artículo esperando/i)).toBeVisible();
  });
});
