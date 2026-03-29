import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type {
  Browser,
  BrowserContext,
  Locator,
  Page,
} from '@playwright/test';
import { expect } from '@playwright/test';
import {
  getStoredRoleAuth,
  type DemoRoleName,
} from './auth-cache';
import { loginThroughUi } from './demo';

export type PresentationRole = DemoRoleName | 'guest';
type PresentationAccount = {
  email: string;
  password: string;
};

const PRESENTATION_BACKEND_ORIGIN =
  process.env.PLAYWRIGHT_PRESENTATION_BACKEND_ORIGIN ??
  (process.env.PLAYWRIGHT_PRESENTATION_BASE_URL
    ? new URL(process.env.PLAYWRIGHT_PRESENTATION_BASE_URL).origin
    : null) ??
  process.env.NEXT_PUBLIC_API_URL ??
  'http://localhost:3000';

export const PRESENTATION_VIEWPORT = {
  width: 1600,
  height: 1100,
};

export const PRESENTATION_OUTPUT_DIR = path.resolve(
  __dirname,
  '../../../output/playwright/presentation',
);

const PRESENTATION_CSS = `
  .toaster,
  [data-sonner-toaster],
  [aria-live="polite"][role="status"],
  [aria-live="assertive"],
  [data-next-badge-root],
  nextjs-portal,
  #__next-build-watcher {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
  }

  html {
    scroll-behavior: auto !important;
  }
`;

const AUTH_SESSION_HINT_STORAGE_SLOT = 'mecerka-auth-session-hydration';

function buildAuthSessionHint() {
  return JSON.stringify({
    marker: 'active',
    expiresAt: Date.now() + 12 * 60 * 60 * 1000,
  });
}

async function attachPresentationAuth(
  context: BrowserContext,
  accessToken: string,
) {
  const backendOriginUrl = new URL(PRESENTATION_BACKEND_ORIGIN);
  await context.addCookies([
    {
      name: 'access_token',
      value: accessToken,
      domain: backendOriginUrl.hostname,
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      httpOnly: false,
      sameSite: 'Lax',
      secure: backendOriginUrl.protocol === 'https:',
    },
  ]);

  const authSessionHint = buildAuthSessionHint();
  await context.addInitScript(
    ({ storageSlot, value, backendOrigin, token }) => {
      window.sessionStorage.setItem(storageSlot, value);

      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : String(input);

        const absoluteUrl = new URL(requestUrl, window.location.origin);
        if (absoluteUrl.origin !== backendOrigin) {
          return originalFetch(input, init);
        }

        const headers = new Headers(
          init?.headers ??
            (input instanceof Request ? input.headers : undefined),
        );
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${token}`);
        }

        return originalFetch(input, {
          ...init,
          headers,
        });
      };
    },
    {
      storageSlot: AUTH_SESSION_HINT_STORAGE_SLOT,
      value: authSessionHint,
      backendOrigin: PRESENTATION_BACKEND_ORIGIN,
      token: accessToken,
    },
  );
}

export async function createPresentationPage(
  browser: Browser,
  role: PresentationRole = 'guest',
) {
  const auth =
    role === 'guest' ? null : await getStoredRoleAuth(role);
  const storageState = auth?.storageStatePath;

  const context = await browser.newContext({
    colorScheme: 'light',
    locale: 'es-ES',
    storageState,
    viewport: PRESENTATION_VIEWPORT,
  });

  if (role !== 'guest') {
    await attachPresentationAuth(context, auth?.token ?? '');
  }

  const page = await context.newPage();

  return { context, page };
}

async function apiLoginForPresentation(account: PresentationAccount) {
  const response = await fetch(`${PRESENTATION_BACKEND_ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: account.email,
      password: account.password,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `No se pudo iniciar sesión para presentación: ${response.status}`,
    );
  }

  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error('La API de login no devolvió access_token para presentación.');
  }

  return body.access_token;
}

export async function openFreshAuthenticatedPresentationSurface(
  browser: Browser,
  account: PresentationAccount,
  url: string,
  options?: {
    headingPattern?: RegExp;
  },
) {
  const accessToken = await apiLoginForPresentation(account);
  const context = await browser.newContext({
    colorScheme: 'light',
    locale: 'es-ES',
    viewport: PRESENTATION_VIEWPORT,
  });
  await attachPresentationAuth(context, accessToken);
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForStableUi(page, options?.headingPattern);
  return { context, page };
}

export async function hidePresentationNoise(page: Page) {
  await page.addStyleTag({ content: PRESENTATION_CSS });
}

export async function waitForStableUi(
  page: Page,
  headingPattern?: RegExp,
) {
  await page.waitForLoadState('domcontentloaded');

  if (headingPattern) {
    await expect(
      page.getByRole('heading', { name: headingPattern }).first(),
    ).toBeVisible({ timeout: 20000 });
  }

  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);

  await page.locator('img').evaluateAll((images) => {
    return Promise.all(
      images.map((image) => {
        const htmlImage = image as HTMLImageElement;
        if (htmlImage.complete) {
          return Promise.resolve();
        }

        return new Promise<void>((resolve) => {
          const done = () => resolve();
          htmlImage.addEventListener('load', done, { once: true });
          htmlImage.addEventListener('error', done, { once: true });
        });
      }),
    );
  });

  await hidePresentationNoise(page);
  await page.waitForTimeout(250);
}

export async function openPresentationSurface(
  browser: Browser,
  url: string,
  options?: {
    headingPattern?: RegExp;
    role?: PresentationRole;
  },
) {
  const { context, page } = await createPresentationPage(
    browser,
    options?.role ?? 'guest',
  );

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForStableUi(page, options?.headingPattern);

  return { context, page };
}

export async function openAuthenticatedPresentationSurface(
  browser: Browser,
  account: {
    email: string;
    password: string;
    label?: string;
  },
  url: string,
  options?: {
    headingPattern?: RegExp;
  },
) {
  const { context, page } = await createPresentationPage(browser);
  await loginThroughUi(page, account);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForStableUi(page, options?.headingPattern);
  return { context, page };
}

export async function savePresentationScreenshot(
  page: Page,
  fileName: string,
  options?: {
    fullPage?: boolean;
  },
) {
  await mkdir(PRESENTATION_OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(PRESENTATION_OUTPUT_DIR, fileName);

  await hidePresentationNoise(page);
  await page.screenshot({
    animations: 'disabled',
    caret: 'hide',
    fullPage: options?.fullPage ?? false,
    path: outputPath,
  });

  return outputPath;
}

export async function savePresentationLocatorScreenshot(
  page: Page,
  locator: Locator,
  fileName: string,
) {
  await mkdir(PRESENTATION_OUTPUT_DIR, { recursive: true });
  const outputPath = path.join(PRESENTATION_OUTPUT_DIR, fileName);

  await hidePresentationNoise(page);
  await locator.screenshot({
    animations: 'disabled',
    caret: 'hide',
    path: outputPath,
  });

  return outputPath;
}

export async function closePresentationContext(context: BrowserContext) {
  await context.close();
}
