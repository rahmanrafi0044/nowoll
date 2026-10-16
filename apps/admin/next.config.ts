import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import type { NextConfig } from 'next'

// Copy ONLY NEXT_PUBLIC_* values from the monorepo's root .env — the admin app
// never holds server secrets. (Same approach as apps/storefront/next.config.ts.)
const rootEnvFile = path.resolve(import.meta.dirname, '../../.env')
if (existsSync(rootEnvFile)) {
  const vars = parseEnv(readFileSync(rootEnvFile, 'utf8'))
  for (const [key, value] of Object.entries(vars)) {
    if (key.startsWith('NEXT_PUBLIC_') && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

// Product photos live in Supabase Storage. next/image only resizes remote
// images from hosts allow-listed here (same rule as the shop).
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined

const nextConfig: NextConfig = {
  poweredByHeader: false,

  // Docker images (step 48, infrastructure/docker/web.Dockerfile) build with
  // NEXT_OUTPUT=standalone: Next.js copies only the files the server needs
  // into .next/standalone (with server.js). The monorepo root is the tracing
  // root so the shared packages (@nowoll/ui, …) are included. Dev and the
  // browser tests don't set it and keep the normal `next start`.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: path.resolve(import.meta.dirname, '../..'),

  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
      : [],
  },

  // Static security headers. The Content-Security-Policy is set per request
  // in src/proxy.ts because it contains a fresh nonce each time.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' }, // keep the admin panel out of Google
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]
  },
}

export default nextConfig
