import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTestEnv } from './e2e/load-test-env.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');
const backendDir = path.resolve(workspaceRoot, 'backend');

loadTestEnv(__dirname);

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3001';
const useExternalStack = process.env.PLAYWRIGHT_EXTERNAL_STACK === 'true';

const config = {
  testDir: '.',
  testMatch: ['e2e/**/*.spec.ts', 'tests/e2e/**/*.spec.ts'],
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: path.resolve(__dirname, 'e2e/fixtures/global-setup.ts'),
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10000,
  },
  webServer: useExternalStack
    ? undefined
    : [
        {
          command: 'npm run start',
          cwd: backendDir,
          env: {
            ...process.env,
            PORT: '3000',
            FRONTEND_URL: 'http://localhost:3001',
            DEMO_PASSWORD: process.env.DEMO_PASSWORD ?? 'DemoPass123!',
            STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy',
            STRIPE_WEBHOOK_SECRET:
              process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_test',
            DELIVERY_STRIPE_WEBHOOK_SECRET:
              process.env.DELIVERY_STRIPE_WEBHOOK_SECRET ?? 'whsec_test',
            DONATIONS_STRIPE_WEBHOOK_SECRET:
              process.env.DONATIONS_STRIPE_WEBHOOK_SECRET ?? 'whsec_test',
          },
          url: 'http://localhost:3000/products',
          reuseExistingServer: true,
          timeout: 120000,
        },
        {
          command: 'npm run dev -- --port 3001',
          cwd: __dirname,
          env: {
            ...process.env,
            NEXT_PUBLIC_API_URL: 'http://localhost:3000',
            NEXT_PUBLIC_REQUIRE_MFA: 'false',
          },
          url: 'http://localhost:3001/es/login',
          reuseExistingServer: true,
          timeout: 120000,
        },
      ],
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
};

export default config;
