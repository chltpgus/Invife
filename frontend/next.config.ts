import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'export',
  trailingSlash: true,
  poweredByHeader: false,
  reactStrictMode: true,
  images: { unoptimized: true },
  async rewrites() {
    return [
      { source: '/i/:slug/g/:token', destination: '/i/:slug' },
      { source: '/i/:slug/s/:token', destination: '/i/:slug' },
    ];
  },
};

export default config;
