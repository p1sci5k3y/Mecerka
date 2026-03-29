import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type DemoRoleName =
  | 'admin'
  | 'provider'
  | 'provider2'
  | 'runner'
  | 'runner2'
  | 'runnerSevilla'
  | 'user'
  | 'user2';

type AuthManifestEntry = {
  email: string;
  token: string;
  storageStatePath: string;
};

type AuthManifest = Record<DemoRoleName, AuthManifestEntry>;

let manifestPromise: Promise<AuthManifest> | null = null;

async function loadManifest(): Promise<AuthManifest> {
  const manifestPath = path.resolve(
    process.cwd(),
    'test-results',
    '.auth',
    'manifest.json',
  );
  const raw = await readFile(manifestPath, 'utf8');
  return JSON.parse(raw) as AuthManifest;
}

export async function getStoredRoleAuth(role: DemoRoleName) {
  manifestPromise ??= loadManifest();
  const manifest = await manifestPromise;
  const auth = manifest[role];

  if (!auth) {
    throw new Error(`Missing stored auth for role ${role}`);
  }

  return auth;
}
