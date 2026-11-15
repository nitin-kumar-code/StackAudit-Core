import type { NextConfig } from "next";

import path from "path";

function getSecurityHeaders() {
  const headers: Array<{ key: string; value: string }> = [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
  ];

  // Conditional HSTS: Apply ONLY when explicitly enabled for HTTPS production deployments.
  // Unconditional preload or includeSubDomains can break subdomains that do not yet support HTTPS.
  const isProduction = process.env.NODE_ENV === 'production';
  const enableHsts = process.env.ENABLE_HSTS === 'true';
  if (isProduction && enableHsts) {
    let hstsValue = 'max-age=31536000';
    if (process.env.HSTS_INCLUDE_SUBDOMAINS === 'true') {
      hstsValue += '; includeSubDomains';
    }
    if (process.env.HSTS_PRELOAD === 'true') {
      hstsValue += '; preload';
    }
    headers.push({ key: 'Strict-Transport-Security', value: hstsValue });
  }

  // Baseline Content Security Policy (CSP)
  // NOTE: This policy is a permissive baseline with significant allowances ('unsafe-inline', 'unsafe-eval')
  // necessitated by current Next.js client bundling and React 19 fast-refresh/hydration runtime.
  // Data exfiltration risk is mitigated by restricting connect-src to 'self', loopback, and the explicit Supabase origin,
  // avoiding wildcard 'https:'. A strict nonce-based CSP is planned for production multi-tenant deployment.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const allowedConnectOrigins = [
    "'self'",
    "http://127.0.0.1:*",
    "http://localhost:*",
    "ws://127.0.0.1:*",
    "ws://localhost:*",
  ];
  if (supabaseUrl) {
    try {
      const parsed = new URL(supabaseUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        allowedConnectOrigins.push(parsed.origin);
      }
    } catch {
      // Ignore invalid URL format
    }
  }

  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${allowedConnectOrigins.join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  headers.push({ key: 'Content-Security-Policy', value: cspDirectives.join('; ') });

  return headers;
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: getSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
