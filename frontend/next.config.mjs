import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin();

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true
  },
  output: "standalone",
  outputFileTracingIncludes: {
    "/*": ["./messages/**/*", "./i18n/**/*"]
  }
};

export default withNextIntl(nextConfig);
