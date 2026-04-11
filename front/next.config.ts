import type { NextConfig } from "next";
import path from "node:path";

/**
 * Content Security Policy.
 *
 * Notes:
 * - `'unsafe-inline'` is allowed for styles because Tailwind injects inline
 *   style attributes at runtime. It is NOT allowed for scripts.
 * - `connect-src` must include the API origin. In dev we fall back to localhost.
 * - Tune when embedding third-party scripts (analytics, Sentry, etc.).
 */
const apiOrigin = (() => {
  const raw = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/v1';
  try {
    return new URL(raw).origin;
  } catch {
    return 'http://localhost:8080';
  }
})();

const csp = [
  `default-src 'self'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `object-src 'none'`,
  // Next.js may inline small bootstrap scripts; nonces would be the
  // strictest option but require App Router middleware. Keep self-only.
  `script-src 'self' 'unsafe-inline'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: https:`,
  `font-src 'self' data:`,
  `connect-src 'self' ${apiOrigin} https:`,
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
