import path from 'node:path';
import { fileURLToPath } from 'node:url';
import baseConfig from './e2e.config.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
  ...baseConfig,
  globalSetup: path.resolve(
    __dirname,
    'e2e/fixtures/presentation-global-setup.ts',
  ),
};
