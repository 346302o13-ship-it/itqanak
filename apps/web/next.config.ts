import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  // Next's hydration bootstrap currently requires this policy exception. It is
  // scoped to this first-party app and documented in docs/SECURITY.md.
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  // Development reaches Next through the loopback Nginx gateway rather than
  // port 3000 directly. Permit that same host for Turbopack's dev resources.
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  experimental: { authInterrupts: true },
  poweredByHeader: false,
  reactStrictMode: true,
  // Nginx emits redacted request metadata. Suppress Next development's raw
  // request-URL logger as defense in depth; action tokens remain in URL
  // fragments and never reach the server. Production does not use this logger.
  logging: { browserToTerminal: false, incomingRequests: false },
  transpilePackages: [
    "@itqanak/auth",
    "@itqanak/catalog",
    "@itqanak/content",
    "@itqanak/config",
    "@itqanak/core",
    "@itqanak/db",
    "@itqanak/finance",
    "@itqanak/observability",
    "@itqanak/operations",
    "@itqanak/requests",
    "@itqanak/storage",
    "@itqanak/ui",
  ],
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/ar/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/en/auth/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
      {
        source: "/ar/account/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/en/account/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/ar/student/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/en/student/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/ar/admin/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/en/admin/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/api/auth/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/api/account/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/api/student/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
      {
        source: "/api/admin/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
