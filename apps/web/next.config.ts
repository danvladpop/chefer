import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  reactCompiler: false,
  transpilePackages: ['@chefer/ui', '@chefer/utils', '@chefer/types'],
  images: {
    // On the small production VM, skip Next's image optimizer: it removes a CPU/
    // memory load and lets same-host uploaded images render without per-host
    // remotePatterns config. Optimization still runs in local dev.
    unoptimized: process.env.NODE_ENV === 'production',
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        port: '',
        pathname: '/u/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/a/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        // Cloudinary CDN — used after running `pnpm upload:images`
        protocol: 'https',
        hostname: 'res.cloudinary.com',
      },
      {
        // Pollinations.ai — AI-generated recipe images
        protocol: 'https',
        hostname: 'image.pollinations.ai',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        // Dev + non-proxy fallback: proxy same-origin /trpc to the API. In the
        // production reverse-proxy (Caddy) setup, /trpc is routed to the API
        // before Next sees it, so this rewrite is only exercised in dev.
        source: '/trpc/:path*',
        destination: `${process.env['API_INTERNAL_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'}/trpc/:path*`,
      },
      {
        // Same for the AI chef chat endpoint — it lives on the API (P1-4);
        // Caddy routes it there in production, this rewrite covers dev.
        source: '/api/chat',
        destination: `${process.env['API_INTERNAL_URL'] ?? process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'}/api/chat`,
      },
    ];
  },
  async redirects() {
    return [];
  },
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === 'development',
    },
  },
  ...(process.env['BUILD_STANDALONE'] === 'true' && { output: 'standalone' as const }),
};

export default withSentryConfig(nextConfig, {
  org: 'chefer',
  project: 'javascript-nextjs',

  // Only print source-map upload logs in CI.
  silent: !process.env['CI'],

  // Upload a larger set of source maps for prettier stack traces.
  widenClientFileUpload: true,

  // Source-map upload needs SENTRY_AUTH_TOKEN (repo secret / local
  // .env.sentry-build-plugin). Builds without it — e.g. the Docker image
  // build, which doesn't receive secrets yet — skip the upload cleanly
  // instead of failing.
  sourcemaps: { disable: !process.env['SENTRY_AUTH_TOKEN'] },

  // Strip Sentry's own debug statements from production bundles.
  disableLogger: true,
});
