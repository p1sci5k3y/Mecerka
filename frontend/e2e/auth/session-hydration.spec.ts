import { test, expect } from '../fixtures/test';
import { userFixture as authenticatedTest } from '../fixtures/user';

test.describe('auth hydration', () => {
  test('does not request /auth/me on public pages without a session', async ({
    page,
  }) => {
    let authMeRequests = 0;

    page.on('request', (request) => {
      if (request.url().endsWith('/auth/me')) {
        authMeRequests += 1;
      }
    });

    await page.goto('/es/register');
    await page.waitForTimeout(500);

    expect(authMeRequests).toBe(0);
  });

});

authenticatedTest('hydrates /auth/me on authenticated pages that require session state', async ({
    page,
  }) => {
    let authMeRequests = 0;

    page.on('request', (request) => {
      if (request.url().endsWith('/auth/me')) {
        authMeRequests += 1;
      }
    });

    await page.goto('/es/profile');
    await expect(
      page.getByRole('heading', { name: /ficha personal/i }),
    ).toBeVisible();

    expect(authMeRequests).toBeGreaterThan(0);
  });
