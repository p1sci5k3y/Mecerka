import path from 'node:path';
import { loadTestEnv } from '../load-test-env.mjs';

loadTestEnv(path.resolve(__dirname, '../..'));

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'DemoPass123!';
export const BOOTSTRAP_ADMIN_EMAIL = resolveAllowedNonProdEmail(
  'E2E_BOOTSTRAP_ADMIN_EMAIL',
  'e2e-admin@example.test',
);
export const BOOTSTRAP_ADMIN_PASSWORD =
  process.env.E2E_BOOTSTRAP_ADMIN_PASSWORD ?? 'PlaywrightAdmin123!';

function resolveDemoEmail(envKey: string, fallback: string) {
  const email = process.env[envKey] ?? fallback;
  if (!email.endsWith('@local.test')) {
    throw new Error(
      `${envKey} must point to a demo account ending in @local.test`,
    );
  }

  return email;
}

function resolveAllowedNonProdEmail(envKey: string, fallback: string) {
  const email = process.env[envKey] ?? fallback;
  if (
    !email.endsWith('@local.test') &&
    !email.endsWith('@example.test')
  ) {
    throw new Error(
      `${envKey} must use a non-production test domain (*.local.test or *.example.test)`,
    );
  }

  return email;
}

const demoProvider2Email = resolveDemoEmail(
  'DEMO_PROVIDER2_EMAIL',
  'provider2.demo@local.test',
);
const demoRunner2Email = resolveDemoEmail(
  'DEMO_RUNNER2_EMAIL',
  'runner2.demo@local.test',
);
const demoRunnerSevillaEmail = resolveDemoEmail(
  'DEMO_RUNNER_SEVILLA_EMAIL',
  'sevilla.runner.demo@local.test',
);
const demoUser2Email = resolveDemoEmail('DEMO_USER2_EMAIL', 'user2.demo@local.test');
export const accounts = {
  admin: {
    email: resolveDemoEmail('DEMO_ADMIN_EMAIL', 'admin.demo@local.test'),
    password: DEMO_PASSWORD,
    label: 'ADMIN',
  },
  provider: {
    email: resolveDemoEmail(
      'DEMO_PROVIDER_EMAIL',
      'provider.demo@local.test',
    ),
    password: DEMO_PASSWORD,
    label: 'PROVIDER',
  },
  provider2: {
    email: demoProvider2Email,
    password: DEMO_PASSWORD,
    label: 'PROVIDER',
  },
  runner: {
    email: resolveDemoEmail('DEMO_RUNNER_EMAIL', 'runner.demo@local.test'),
    password: DEMO_PASSWORD,
    label: 'RUNNER',
  },
  runner2: {
    email: demoRunner2Email,
    password: DEMO_PASSWORD,
    label: 'RUNNER',
  },
  runnerSevilla: {
    email: demoRunnerSevillaEmail,
    password: DEMO_PASSWORD,
    label: 'RUNNER',
  },
  user: {
    email: resolveDemoEmail('DEMO_USER_EMAIL', 'user.demo@local.test'),
    password: DEMO_PASSWORD,
    label: 'USER',
  },
  user2: {
    email: demoUser2Email,
    password: DEMO_PASSWORD,
    label: 'USER',
  },
} as const;

export const demoProducts = {
  bread: 'Pan artesano',
  empanada: 'Empanada gallega',
  tomatoes: 'Tomates ecológicos',
  eggs: 'Huevos camperos',
  cheese: 'Queso manchego',
  oliveOil: 'Aceite de oliva',
} as const;
