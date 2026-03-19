import { userFixture as test, expect } from '../fixtures/user';

test.describe('profile role request', () => {
  test('uses the real request-role contract without promising direct grants', async ({
    page,
  }) => {
    let capturedPayload: Record<string, unknown> | null = null;

    await page.route('**/users/request-role', async (route) => {
      capturedPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Role request submitted successfully',
          userId: '123',
          requestedRole: 'PROVIDER',
          roleStatus: 'PENDING',
          requestedAt: new Date().toISOString(),
          roles: ['CLIENT'],
        }),
      });
    });

    await page.goto('/es/profile');

    await expect(
      page.getByRole('heading', { name: /ficha personal/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/solicita tu alta como proveedor o repartidor/i),
    ).toBeVisible();
    await expect(
      page.getByText(/alta pública crea solo cuentas cliente/i),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /abrir un taller|licencia de repartidor/i }),
    ).toHaveCount(0);

    await page.getByLabel(/rol solicitado/i).selectOption('PROVIDER');
    await page.getByLabel(/identificador fiscal/i).fill('12345678Z');
    await page
      .getByRole('button', { name: /solicitar alta como proveedor/i })
      .click();

    await expect
      .poll(() => capturedPayload)
      .not.toBeNull();

    expect(capturedPayload).toEqual({
      role: 'PROVIDER',
      country: 'ES',
      fiscalId: '12345678Z',
    });

    await expect(
      page.getByText(/role request submitted successfully/i),
    ).toBeVisible();
  });

  test('shows backend validation or conflict errors coherently', async ({
    page,
  }) => {
    await page.route('**/users/request-role', async (route) => {
      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'There is already a pending privileged role request',
        }),
      });
    });

    await page.goto('/es/profile');

    await page.getByLabel(/rol solicitado/i).selectOption('RUNNER');
    await page.getByLabel(/identificador fiscal/i).fill('12345678Z');
    await page
      .getByRole('button', { name: /solicitar licencia de repartidor/i })
      .click();

    await expect(
      page.getByText(/there is already a pending privileged role request/i),
    ).toBeVisible();
  });
});
