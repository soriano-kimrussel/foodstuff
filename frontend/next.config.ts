import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Open Food Facts serves product photos from these hosts. next/image refuses
  // remote hosts that are not listed, which is the point: it stops the app
  // becoming an open image proxy.
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.openfoodfacts.org' },
      { protocol: 'https', hostname: 'static.openfoodfacts.org' },
      { protocol: 'https', hostname: 'world.openfoodfacts.org' },
    ],
  },
};

export default config;
