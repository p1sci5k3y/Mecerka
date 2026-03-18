import { providerFixture as test, expect } from '../fixtures/provider';

test.describe('provider', () => {
  test('logs in, creates a product and updates it from the provider UI', async ({
    page,
  }) => {
    const productName = `Producto PW ${Date.now()}`;
    const updatedName = `${productName} Editado`;

    await page.goto('/es/provider/products/new');

    await page.getByLabel(/nombre del producto/i).fill(productName);
    await page.getByLabel(/descripción/i).fill('Producto E2E de Playwright');
    await page.getByLabel(/precio/i).fill('12.50');
    await page.getByLabel(/stock/i).fill('9');
    await page.getByRole('combobox').nth(0).click();
    await page.getByRole('option', { name: /panadería|verduras|despensa/i }).first().click();
    await page.getByRole('combobox').nth(1).click();
    await page.getByRole('option', { name: /toledo/i }).click();
    await page
      .getByLabel(/url de la imagen/i)
      .fill('https://example.test/demo-products/bread.jpg');
    const createResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith('/products') &&
        response.request().method() === 'POST' &&
        response.status() === 201,
    );
    await page.getByRole('button', { name: /guardar producto/i }).click();

    const createdProduct = await createResponsePromise.then((response) =>
      response.json(),
    );
    await page.goto(`/es/provider/products/${createdProduct.id}`);

    await page.getByLabel(/nombre del producto/i).fill(updatedName);
    await page.getByRole('button', { name: /guardar cambios/i }).click();

    await expect(page).toHaveURL(/\/es\/provider\/products$/);
    await expect(page.getByText(updatedName)).toBeVisible();
  });

  test('views provider orders and updates order status through the kanban flow', async ({
    page,
  }) => {
    await page.goto('/es/provider/sales');

    await expect(
      page.getByRole('heading', { name: /panel operativo/i }),
    ).toBeVisible();

    await page.getByRole('button', { name: /aceptar pedido/i }).first().click();
    await expect(
      page.getByRole('button', { name: /empezar a preparar/i }).first(),
    ).toBeVisible();

    await page.getByRole('button', { name: /empezar a preparar/i }).first().click();
    await expect(
      page.getByRole('button', { name: /marcar listo/i }).first(),
    ).toBeVisible();

    await page.getByRole('button', { name: /marcar listo/i }).first().click();
    await expect(page.getByRole('heading', { name: /listos/i })).toBeVisible();
  });
});
