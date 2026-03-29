import type { Browser, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { accounts } from './data/accounts';
import { getStoredRoleAuth } from './fixtures/auth-cache';
import {
  closePresentationContext,
  openFreshAuthenticatedPresentationSurface,
  openPresentationSurface,
  savePresentationLocatorScreenshot,
  savePresentationScreenshot,
  waitForStableUi,
} from './fixtures/presentation';

const CATALOG_HEADING = /catálogo de productos/i;
const CART_HEADING = /tu cesta/i;
const PAYMENTS_HEADING = /pedido y pagos por comercio/i;

const PRODUCT_DETAIL_CANDIDATES = [
  'Cuenco de cerámica toledana',
  'Ramo de temporada',
  'Pan artesano',
  'Cuaderno cosido a mano',
];

const CART_PRODUCTS = [
  {
    productNames: ['Pan artesano', 'Empanada gallega'],
    providerName: /panadería san isidro/i,
  },
  {
    productNames: [
      'Cuenco de cerámica toledana',
      'Ramo de temporada',
      'Cuaderno cosido a mano',
      'Pañuelo de seda',
      'Cartera de piel',
      'Vela de soja ámbar',
    ],
    providerName:
      /cerámica del miradero|flores de la plaza|cuadernos de malasaña|seda del carmen|marroquinería giralda|velas de bilbao/i,
  },
] as const;

const OFFICIAL_CART_PRODUCTS = [
  {
    productNames: ['Pan artesano'],
    providerName: /panadería san isidro/i,
  },
  {
    productNames: ['Cuenco de cerámica toledana'],
    providerName: /cerámica del miradero/i,
  },
] as const;

const CHECKOUT_ADDRESS = {
  deliveryAddress: 'Calle Comercio Local 12',
  postalCode: '28013',
  addressReference: 'Portal B, 2º izquierda',
  discoveryRadiusKm: '5',
};

const PRESENTATION_API_BASE_URL = `${
  process.env.PLAYWRIGHT_PRESENTATION_BASE_URL ?? 'https://demo.mecerka.me'
}/api`;

type PresentationOrder = {
  id: string;
  runnerId?: string | null;
  deliveryOrder?: {
    status?: string | null;
  } | null;
};

type PresentationProduct = {
  id: string;
  name: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findProductLink(page: Page, names: readonly string[]) {
  for (const name of names) {
    const linkByRole = page
      .getByRole('link', {
        name: new RegExp(escapeRegExp(name), 'i'),
      })
      .first();

    if ((await linkByRole.count()) > 0) {
      return { locator: linkByRole, name };
    }

    const linkByHref = page
      .locator('main a[href*="/products/"]')
      .filter({ hasText: new RegExp(escapeRegExp(name), 'i') })
      .first();

    if ((await linkByHref.count()) > 0) {
      return { locator: linkByHref, name };
    }
  }

  throw new Error(`No se encontró ningún producto candidato: ${names.join(', ')}`);
}

async function openCatalog(page: Page) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.goto('/es/products', { waitUntil: 'domcontentloaded' });
    await waitForStableUi(page, CATALOG_HEADING);

    const loadErrorVisible = await page
      .getByText(/no se pudieron cargar los productos/i)
      .isVisible()
      .catch(() => false);

    if (!loadErrorVisible) {
      return;
    }

    await page.waitForTimeout(1000 * (attempt + 1));
  }

  throw new Error('El catálogo público de demo sigue devolviendo error tras varios reintentos.');
}

async function openProductDetailFromCatalog(
  page: Page,
  productNames: readonly string[],
) {
  try {
    await openCatalog(page);
    const { locator, name } = await findProductLink(page, productNames);
    await locator.click();
    await waitForStableUi(page, new RegExp(escapeRegExp(name), 'i'));
    return name;
  } catch {
    const directProduct = await getExistingProductPath(productNames);
    await page.goto(directProduct.path, { waitUntil: 'domcontentloaded' });
    await waitForStableUi(
      page,
      new RegExp(escapeRegExp(directProduct.name), 'i'),
    );
    return directProduct.name;
  }
}

async function resetOfficialCart(page: Page) {
  await page.goto('/es/cart', { waitUntil: 'domcontentloaded' });
  await waitForStableUi(page, CART_HEADING);

  const removedItems = await page.evaluate(async () => {
    const response = await fetch('/api/cart/me', {
      credentials: 'include',
    });
    if (!response.ok) {
      return 0;
    }

    const cart = (await response.json()) as {
      providers?: Array<{ items?: Array<{ id: string }> }>;
    };
    const itemIds =
      cart.providers?.flatMap((provider) =>
        (provider.items ?? []).map((item) => item.id),
      ) ?? [];

    for (const itemId of itemIds) {
      await fetch(`/api/cart/items/${itemId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    }

    return itemIds.length;
  });

  if (removedItems > 0) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForStableUi(page, CART_HEADING);
  }
}

async function resetGuestCart(page: Page) {
  await page.goto('/es/cart', { waitUntil: 'domcontentloaded' });
  await waitForStableUi(page, CART_HEADING);
  await page.evaluate(() => {
    window.localStorage.removeItem('mecerka-guest-cart-v1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForStableUi(page, CART_HEADING);
}

async function ensureOfficialCartReady(page: Page) {
  for (const product of OFFICIAL_CART_PRODUCTS) {
    await openProductDetailFromCatalog(page, product.productNames);
    await page.getByRole('button', { name: /añadir al carrito/i }).click();
    await page.waitForTimeout(500);
  }

  await page.goto('/es/cart', { waitUntil: 'domcontentloaded' });
  await waitForStableUi(page, CART_HEADING);

  for (const product of OFFICIAL_CART_PRODUCTS) {
    await expect(page.getByText(product.providerName).first()).toBeVisible();
  }
}

async function ensureGuestCartReady(page: Page) {
  for (const product of CART_PRODUCTS) {
    await openProductDetailFromCatalog(page, product.productNames);
    await page.getByRole('button', { name: /añadir al carrito/i }).click();
    await page.waitForTimeout(500);
  }

  await page.goto('/es/cart', { waitUntil: 'domcontentloaded' });
  await waitForStableUi(page, CART_HEADING);

  for (const product of CART_PRODUCTS) {
    await expect(page.getByText(product.providerName).first()).toBeVisible();
  }
}

async function openGuestCartSurface(browser: Browser) {
  const { context, page } = await openPresentationSurface(browser, '/es/cart', {
    headingPattern: CART_HEADING,
  });

  await resetGuestCart(page);
  await ensureGuestCartReady(page);
  return { context, page };
}

async function promoteGuestCartToOfficial(page: Page) {
  await page
    .getByRole('button', { name: /iniciar sesión y continuar/i })
    .click();
  await page.waitForURL(/\/es\/login/, { timeout: 15000 });
  await page.getByLabel(/correo electrónico/i).fill(accounts.user2.email);
  await page.getByLabel(/contraseña/i).fill(accounts.user2.password);
  await page
    .getByRole('button', { name: /iniciar sesión|entrar/i })
    .click();

  await page.waitForURL(/\/es\/(cart|dashboard)/, { timeout: 15000 });
  if (!/\/es\/cart/.test(page.url())) {
    await page.goto('/es/cart', { waitUntil: 'domcontentloaded' });
  }

  await waitForStableUi(page, CART_HEADING);
}

async function fillCheckoutFields(page: Page) {
  await page.getByLabel(/dirección de entrega/i).fill(
    CHECKOUT_ADDRESS.deliveryAddress,
  );
  await page.getByLabel(/código postal/i).fill(CHECKOUT_ADDRESS.postalCode);
  await page.getByLabel(/referencia adicional/i).fill(
    CHECKOUT_ADDRESS.addressReference,
  );
  await page
    .getByLabel(/radio de compra/i)
    .fill(CHECKOUT_ADDRESS.discoveryRadiusKm);
  await page.waitForTimeout(250);
}

async function getExistingOrderPaymentsPath() {
  const auth = await getStoredRoleAuth('user2');
  const response = await fetch(`${PRESENTATION_API_BASE_URL}/orders`, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`No se pudieron cargar pedidos demo: ${response.status}`);
  }

  const orders = (await response.json()) as Array<{ id: string }>;
  const firstOrder = orders[0];
  if (!firstOrder) {
    throw new Error('La demo no devolvió pedidos para user2.');
  }

  return `/es/orders/${firstOrder.id}/payments`;
}

async function getExistingProductPath(productNames: readonly string[]) {
  const auth = await getStoredRoleAuth('user2');
  const response = await fetch(`${PRESENTATION_API_BASE_URL}/products`, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`No se pudieron cargar productos demo: ${response.status}`);
  }

  const products = (await response.json()) as PresentationProduct[];
  const product = products.find((candidate) =>
    productNames.some((name) => candidate.name === name),
  );

  if (!product) {
    throw new Error(
      `La demo no devolvió ningún producto candidato: ${productNames.join(', ')}`,
    );
  }

  return {
    id: product.id,
    name: product.name,
    path: `/es/products/${product.id}`,
  };
}

async function getExistingAssignedRunnerOrderPath() {
  const auth = await getStoredRoleAuth('runnerSevilla');
  const response = await fetch(`${PRESENTATION_API_BASE_URL}/orders`, {
    headers: {
      Authorization: `Bearer ${auth.token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `No se pudieron cargar pedidos demo para runner: ${response.status}`,
    );
  }

  const orders = (await response.json()) as PresentationOrder[];
  const assignedOrder = orders.find(
    (order) =>
      order.deliveryOrder?.status != null &&
      ['RUNNER_ASSIGNED', 'PICKUP_PENDING', 'PICKED_UP', 'IN_TRANSIT'].includes(
        order.deliveryOrder.status,
      ),
  );

  if (!assignedOrder) {
    throw new Error(
      'La demo no devolvió una entrega activa para el runner de presentación.',
    );
  }

  return `/es/runner/orders/${assignedOrder.id}`;
}

async function hideProductDetailPlaceholders(page: Page) {
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div')).filter((node) => {
      const text = node.textContent ?? '';
      const className =
        typeof node.className === 'string' ? node.className : '';

      return (
        /productos similares - coming soon/i.test(text) &&
        className.includes('border-dashed')
      );
    });

    for (const card of cards) {
      (card as HTMLElement).style.display = 'none';
    }
  });
}

test.describe('presentation slides', () => {
  test('captures catalog slide', async ({ browser }) => {
    const { context, page } = await openPresentationSurface(
      browser,
      '/es/products',
      {
        headingPattern: CATALOG_HEADING,
      },
    );

    await expect(
      page.getByRole('heading', { name: CATALOG_HEADING }),
    ).toBeVisible();
    await expect(page.getByText(/filtrar por/i)).toBeVisible();

    await savePresentationLocatorScreenshot(
      page,
      page.locator('main').first(),
      '01-home-catalogo.png',
    );
    await closePresentationContext(context);
  });

  test('captures product detail slide', async ({ browser }) => {
    const { context, page } = await openPresentationSurface(
      browser,
      '/es/products',
      {
        headingPattern: CATALOG_HEADING,
      },
    );

    await openProductDetailFromCatalog(page, PRODUCT_DETAIL_CANDIDATES);
    await expect(
      page.getByRole('button', { name: /añadir al carrito/i }),
    ).toBeVisible();
    await hideProductDetailPlaceholders(page);

    await savePresentationLocatorScreenshot(
      page,
      page.locator('main .mx-auto.max-w-7xl').first(),
      '02-producto-detalle.png',
    );
    await closePresentationContext(context);
  });

  test('captures multi-provider cart slide', async ({ browser }) => {
    const { context, page } = await openGuestCartSurface(browser);

    await savePresentationLocatorScreenshot(
      page,
      page.locator('main').first(),
      '03-carrito-multiproveedor.png',
    );
    await closePresentationContext(context);
  });

  test('captures checkout with address slide', async ({ browser }) => {
    const { context, page } = await openPresentationSurface(browser, '/es/cart', {
      headingPattern: CART_HEADING,
      role: 'user2',
    });
    await resetOfficialCart(page);
    await ensureOfficialCartReady(page);
    await fillCheckoutFields(page);
    await expect(
      page.getByRole('button', { name: /crear pedido oficial/i }),
    ).toBeEnabled();

    await savePresentationLocatorScreenshot(
      page,
      page.locator('main').first(),
      '04-checkout-direccion.png',
    );
    await closePresentationContext(context);
  });

  test('captures order confirmation slide', async ({ browser }) => {
    const paymentsPath = await getExistingOrderPaymentsPath();
    const { context, page } = await openPresentationSurface(
      browser,
      paymentsPath,
      {
        headingPattern: PAYMENTS_HEADING,
        role: 'user2',
      },
    );

    await savePresentationLocatorScreenshot(
      page,
      page.locator('main .mx-auto.max-w-6xl').first(),
      '05-confirmacion-pedido.png',
    );
    await closePresentationContext(context);
  });

  test('captures provider operations panel slide', async ({ browser }) => {
    const { context, page } = await openPresentationSurface(
      browser,
      '/es/dashboard',
      {
        role: 'provider',
      },
    );
    await page.waitForURL(/\/es\/provider\/sales$/, { timeout: 20000 });
    await waitForStableUi(page, /panel operativo/i);

    await expect(page.getByText(/nuevos/i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /en preparación/i }).first(),
    ).toBeVisible();

    await savePresentationLocatorScreenshot(
      page,
      page.locator('main').first(),
      '06-panel-proveedor.png',
    );
    await closePresentationContext(context);
  });

  test('captures runner active panel slide', async ({ browser }) => {
    const runnerOrderPath = await getExistingAssignedRunnerOrderPath();
    const { context, page } = await openFreshAuthenticatedPresentationSurface(
      browser,
      accounts.runnerSevilla,
      runnerOrderPath,
      {
        headingPattern: /ficha de entrega del runner/i,
      },
    );

    await expect(
      page.getByRole('heading', { name: /ruta operativa en vivo/i }).first(),
    ).toBeVisible();

    await savePresentationLocatorScreenshot(
      page,
      page.locator('main').first(),
      '07-panel-runner.png',
    );
    await closePresentationContext(context);
  });

  test('captures admin operational panel slide', async ({ browser }) => {
    const { context, page } = await openFreshAuthenticatedPresentationSurface(
      browser,
      accounts.admin,
      '/es/admin/refunds',
      {
        headingPattern: /devoluciones/i,
      },
    );

    await expect(page.getByText(/siguiente acción de backoffice/i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /devoluciones/i }),
    ).toBeVisible();

    await savePresentationScreenshot(page, '08-panel-admin.png');
    await closePresentationContext(context);
  });
});
