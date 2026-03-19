import { test, expect } from '../fixtures/test';

test.describe('public register', () => {
  test('shows only client signup and does not send elevated roles', async ({
    page,
  }) => {
    const email = `client.${Date.now()}@example.com`;

    await page.goto('/es/register');

    await expect(
      page.getByText(/alta pública como cliente/i),
    ).toBeVisible();
    await expect(
      page.getByText(/cuenta CLIENT/i),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /soy artesano|repartidor/i }),
    ).toHaveCount(0);

    await page.getByLabel(/nombre completo|full name/i).fill('Cliente Demo');
    await page.getByLabel(/correo electrónico|email/i).fill(email);
    await page.getByLabel(/contraseña \(mínimo 12 caracteres\)|password/i).fill(
      'StrongPass123!',
    );
    await page.getByPlaceholder(/resultado|result/i).fill('2');
    await page.getByLabel(/acepto los|i agree to the/i).check();

    const registerRequest = page.waitForRequest(
      (request) =>
        request.url().endsWith('/auth/register') && request.method() === 'POST',
    );

    await page
      .getByRole('button', { name: /crear cuenta|create account/i })
      .click();

    const request = await registerRequest;
    const payload = request.postDataJSON() as Record<string, unknown>;

    expect(payload).toEqual({
      name: 'Cliente Demo',
      email,
      password: 'StrongPass123!',
    });
    expect(payload).not.toHaveProperty('role');

    await expect(
      page.getByRole('heading', { name: /revisa tu bandeja de entrada/i }),
    ).toBeVisible();
  });
});
