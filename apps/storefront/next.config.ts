import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import type { NextConfig } from 'next'

// ── Environment variables ─────────────────────────────────────────────────
// The monorepo keeps ONE .env at the repo root. Next.js only looks in this
// app's folder, so we read the root file ourselves — but copy ONLY the
// NEXT_PUBLIC_* values. Least privilege: the storefront never needs (and so
// never holds) server secrets like the Supabase service role key.
// On Vercel there is no .env file; variables come from the project settings.
const rootEnvFile = path.resolve(import.meta.dirname, '../../.env')
if (existsSync(rootEnvFile)) {
  const vars = parseEnv(readFileSync(rootEnvFile, 'utf8'))
  for (const [key, value] of Object.entries(vars)) {
    if (key.startsWith('NEXT_PUBLIC_') && process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

// Product images live in Supabase Storage. next/image refuses remote images
// unless their host is allow-listed here.
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined

const nextConfig: NextConfig = {
  poweredByHeader: false, // don't advertise "X-Powered-By: Next.js" to attackers

  // The browser tests (tests/e2e) build into .next-e2e: that build points at
  // the e2e API (its address is baked in), so it must never replace yours.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',

  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }]
      : [],
  },

  // Security headers on every page (CLAUDE.md §11).
  // TODO(phase 6): add a Content-Security-Policy once the GA4 / GTM / Meta Pixel
  // script origins are known — a CSP added now would just be rewritten then.
  // Note for that CSP: product color swatches use inline style attributes
  // (style="background-color: …"), so style-src-attr must allow them.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' }, // no embedding in other sites (clickjacking)
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
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
