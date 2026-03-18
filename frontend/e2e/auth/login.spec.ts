import { accounts } from '../data/accounts';
import { test, expect } from '../fixtures/test';
import { loginThroughUi } from '../fixtures/demo';

test.describe('auth', () => {
  test('allows a demo user to log in through the UI', async ({ page }) => {
    await loginThroughUi(page, accounts.user);

    await expect(
      page.getByRole('heading', { name: /cuaderno de pedidos/i }),
    ).toBeVisible();
  });

  test('rejects invalid credentials without leaving the login screen', async ({
    page,
  }) => {
    await page.goto('/es/login');
    await page.getByLabel(/correo electrónico|email/i).fill(accounts.user.email);
    await page.getByLabel(/contraseña|password/i).fill('incorrect-password');
    await page.getByRole('button', { name: /entrar|iniciar sesión|login/i }).click();

    await expect(page).toHaveURL(/\/es\/login/);
    await expect(page.getByText(/credenciales inválidas/i)).toBeVisible();
  });
});
