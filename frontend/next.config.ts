import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const require = createRequire(import.meta.url);

const root = path.dirname(fileURLToPath(import.meta.url));

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
  webpack(webpackConfig) {
    if (process.env.NEXT_PUBLIC_DATA_SOURCE === 'api') {
      const wp = require('webpack') as typeof import('webpack');
      webpackConfig.plugins.push(
        new wp.NormalModuleReplacementPlugin(
          /[\\/]rsvp[\\/]create-client\.ts$/,
          path.join(root, 'src/rsvp/create-client.api.ts'),
        ),
        new wp.NormalModuleReplacementPlugin(
          /[\\/]editor[\\/]create-client\.ts$/,
          path.join(root, 'src/editor/create-client.api.ts'),
        ),
      );
    }
    return webpackConfig;
  },
};

export default config;
