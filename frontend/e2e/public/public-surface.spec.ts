import { test, expect } from '../fixtures/test';

test.describe('public surface', () => {
  test('home and auth pages do not expose public placeholders as product features', async ({ page }) => {
    await page.goto('/es');

    await expect(
      page.getByRole('heading', { name: /lo que ya puedes hacer/i }),
    ).toBeVisible();
    await expect(page.getByText(/talleres con historia/i)).toHaveCount(0);
    await expect(page.locator('a[href*="/store/"]')).toHaveCount(0);

    await page.goto('/es/login');
    await expect(page.getByRole('button', { name: /google/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /apple/i })).toHaveCount(0);

    await page.goto('/es/auth/callback?token=fake');
    await expect(
      page.getByRole('heading', { name: /acceso por enlace no disponible/i }),
    ).toBeVisible();
  });
});
