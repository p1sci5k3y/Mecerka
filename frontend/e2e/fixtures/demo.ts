import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from '@playwright/test';
import {
  accounts,
  BOOTSTRAP_ADMIN_EMAIL,
  BOOTSTRAP_ADMIN_PASSWORD,
  demoProducts,
} from '../data/accounts';
import {
  getStoredRoleAuth,
  type DemoRoleName,
} from './auth-cache';

export const FRONTEND_URL = 'http://localhost:3001';
export const BACKEND_URL = 'http://localhost:3000';

type LoginAccount = {
  email: string;
  password: string;
  label?: string;
};

type DemoProduct = {
  id: string;
  name: string;
  providerId: string;
};

type DemoOrder = {
  id: string;
  deliveryFee?: number | string | null;
};

type RunnerProfile = {
  userId: string;
};

type DeliveryOrderResponse = {
  id: string;
};

function getExpectedLandingPath(account: LoginAccount) {
  switch (account.label) {
    case 'ADMIN':
      return /\/(es|en)\/admin$/
    case 'PROVIDER':
      return /\/(es|en)\/provider\/sales$/
    case 'RUNNER':
      return /\/(es|en)\/runner$/
    default:
      return /\/(es|en)\/dashboard$/
  }
}

async function parseJson<T>(response: APIResponse): Promise<T> {
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function apiLogin(
  request: APIRequestContext,
  account: LoginAccount,
) {
  const response = await request.post(`${BACKEND_URL}/auth/login`, {
    data: {
      email: account.email,
      password: account.password,
    },
  });

  expect(response.ok()).toBeTruthy();
  const body = await parseJson<{ access_token: string }>(response);
  return body.access_token as string;
}

export async function resetDemo(request: APIRequestContext) {
  const adminToken = await apiLogin(request, {
    email: BOOTSTRAP_ADMIN_EMAIL,
    password: BOOTSTRAP_ADMIN_PASSWORD,
  });

  const response = await request.post(`${BACKEND_URL}/demo/reset`, {
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });

  expect(response.ok()).toBeTruthy();
  await expect
    .poll(async () => {
      const loginResponse = await request.post(`${BACKEND_URL}/auth/login`, {
        data: {
          email: accounts.admin.email,
          password: accounts.admin.password,
        },
      });
      return loginResponse.status();
    })
    .toBe(201);
}

export async function getStoredRoleToken(role: DemoRoleName) {
  const auth = await getStoredRoleAuth(role);
  return auth.token;
}

export async function loginThroughUi(page: Page, account: LoginAccount) {
  await page.goto('/es/login');
  await page.getByLabel(/correo electrónico|email/i).fill(account.email);
  await page.getByLabel(/contraseña|password/i).fill(account.password);
  await page.getByRole('button', { name: /entrar|iniciar sesión|login/i }).click();
  await page.waitForURL(getExpectedLandingPath(account), { timeout: 15000 });
}

export async function apiGetJson<T>(
  request: APIRequestContext,
  endpoint: string,
  token?: string,
) {
  const response = await request.get(`${BACKEND_URL}${endpoint}`, {
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });
  expect(response.ok()).toBeTruthy();
  return (await parseJson(response)) as T;
}

export async function apiPostJson<T>(
  request: APIRequestContext,
  endpoint: string,
  data: unknown,
  token: string,
  extraHeaders?: Record<string, string>,
) {
  const response = await request.post(`${BACKEND_URL}${endpoint}`, {
    data,
    headers: {
      Authorization: `Bearer ${token}`,
      ...extraHeaders,
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await parseJson(response)) as T;
}

export async function apiPatchJson<T>(
  request: APIRequestContext,
  endpoint: string,
  data: unknown,
  token: string,
) {
  const response = await request.patch(`${BACKEND_URL}${endpoint}`, {
    data,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  expect(response.ok()).toBeTruthy();
  return (await parseJson(response)) as T;
}

export async function getDemoProducts(request: APIRequestContext) {
  const products = await apiGetJson<DemoProduct[]>(request, '/products');
  return products;
}

export async function findProductByName(
  request: APIRequestContext,
  productName: string,
): Promise<DemoProduct> {
  const products = await getDemoProducts(request);
  const product = products.find((item) => item.name === productName);
  expect(product).toBeTruthy();
  if (!product) {
    throw new Error(`Demo product not found: ${productName}`);
  }
  return product;
}

export async function createPendingOrderForUser(
  request: APIRequestContext,
  account: LoginAccount,
  productName = demoProducts.bread,
  token?: string,
) {
  const authToken = token ?? (await apiLogin(request, account));
  const product = await findProductByName(request, productName);
  const order = await apiPostJson<DemoOrder>(
    request,
    '/orders',
    {
      items: [
        {
          productId: product.id,
          quantity: 1,
        },
      ],
      deliveryAddress: 'Calle Demo 1, Toledo',
    },
    authToken,
  );

  return { token: authToken, order, product };
}

export async function createAssignedDeliveryForRunner(
  request: APIRequestContext,
  userAccount = accounts.user,
  runnerAccount = accounts.runner,
  clientTokenOverride?: string,
  runnerTokenOverride?: string,
) {
  const { token: clientToken, order } = await createPendingOrderForUser(
    request,
    userAccount,
    demoProducts.bread,
    clientTokenOverride,
  );
  const activeRunnerToken =
    runnerTokenOverride ?? (await apiLogin(request, runnerAccount));
  const runnerProfile = await apiGetJson<RunnerProfile>(
    request,
    '/auth/me',
    activeRunnerToken,
  );

  const deliveryOrder = await apiPostJson<DeliveryOrderResponse>(
    request,
    '/delivery/orders',
    {
      orderId: order.id,
      deliveryFee: Number(order.deliveryFee ?? 0),
      currency: 'EUR',
    },
    clientToken,
  );

  const assigned = await apiPostJson<DeliveryOrderResponse>(
    request,
    `/delivery/orders/${deliveryOrder.id}/assign-runner`,
    {
      runnerId: runnerProfile.userId,
    },
    clientToken,
  );

  return {
    clientToken,
    runnerToken: activeRunnerToken,
    orderId: order.id,
    deliveryOrderId: assigned.id,
    runnerId: runnerProfile.userId,
  };
}

export async function getKnownOrderIdForAdmin(
  request: APIRequestContext,
  userToken?: string,
) {
  const activeUserToken = userToken ?? (await apiLogin(request, accounts.user));
  const orders = await apiGetJson<Array<{ id: string }>>(
    request,
    '/orders',
    activeUserToken,
  );
  expect(orders.length).toBeGreaterThan(0);
  return orders[0].id as string;
}
