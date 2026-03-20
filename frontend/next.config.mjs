import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true
  },
  output: "standalone",
  turbopack: {
    root: __dirname,
  },
  outputFileTracingIncludes: {
    "/*": ["./messages/**/*", "./i18n/**/*"]
  }
};

export default withNextIntl(nextConfig);
