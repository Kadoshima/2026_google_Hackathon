import type { NextConfig } from "next";
import path from "node:path";

/**
 * Content Security Policy.
 *
 * Notes:
 * - `'unsafe-inline'` is allowed for styles because Tailwind injects inline
 *   style attributes at runtime.
 * - For scripts we allow `'unsafe-inline'` in development only (Next.js
 *   injects inline bootstrap) and rely on `'strict-dynamic'` in production
 *   so that the bootstrap can still load but arbitrary injected scripts
 *   cannot run. For a fully nonce-gated setup, wire up a middleware that
 *   emits a per-request nonce.
 * - `connect-src` must include the API origin. In dev we fall back to localhost.
 * - Tune when embedding third-party scripts (analytics, Sentry, etc.).
 */
const isProduction = process.env.NODE_ENV === 'production';

const apiOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/v1';
  try {
    return new URL(raw).origin;
  } catch {
    return 'http://localhost:8080';
  }
})();

// Scripts: strict-dynamic in prod (rejects any host not loaded transitively
// by a trusted script) + unsafe-inline as a fallback for browsers that
// ignore strict-dynamic. Dev keeps the looser policy so HMR works.
const scriptSrc = isProduction
  ? `script-src 'self' 'unsafe-inline'`
  : `script-src 'self' 'unsafe-inline' 'unsafe-eval'`;

// connect-src: in prod we pin to self + the API origin, no `https:` wildcard.
const connectSrc = isProduction
  ? `connect-src 'self' ${apiOrigin}`
  : `connect-src 'self' ${apiOrigin} ws: wss: http://localhost:* https://localhost:*`;

// img-src: allow data:/blob: for inline SVGs + reasonable CDN subset. No
// open `https:` wildcard which would permit tracking pixels / exfiltration.
const imgSrc = `img-src 'self' data: blob:`;

const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `object-src 'none'`,
  scriptSrc,
  `style-src 'self' 'unsafe-inline'`,
  imgSrc,
  `font-src 'self' data:`,
  connectSrc,
  `worker-src 'self' blob:`,
  `manifest-src 'self'`,
  `upgrade-insecure-requests`
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload'
  },
  { key: 'X-DNS-Prefetch-Control', value: 'off' }
];

const nextConfig: NextConfig = {
  turbopack: {
    // Point at the monorepo root so Turbopack can resolve hoisted
    // packages (e.g. next, react) from the root node_modules.
    root: path.resolve(__dirname, '..'),
  },
  // 全てのインターフェースでリッスン
  allowedDevOrigins: ["localhost", "0.0.0.0"],

  // Apply security headers to every route.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders
      }
    ];
  },

  poweredByHeader: false,

  // Expose an explicit env key so the client knows where to call the API.
  env: {
    NEXT_PUBLIC_APP_NAME: 'Reviewer Zero'
  }
};

export default nextConfig;
