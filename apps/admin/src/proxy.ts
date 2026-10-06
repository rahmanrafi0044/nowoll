import { type NextRequest, NextResponse } from 'next/server'
import { decideAccess, getAccessLevel } from '@/lib/admin-access'
import { buildCsp, createNonce } from '@/lib/csp'
import { publicEnv } from '@/lib/env'

// ============================================================================
// PROXY (called "middleware" before Next.js 16) — runs on the server BEFORE
// every admin page. Two jobs:
//   1. Gatekeeper: no admin session cookie → straight to /admin/login.
//   2. Attach a strict Content-Security-Policy with a fresh nonce.
//
// This is a FAST, OPTIMISTIC check that keeps casual visitors out of the admin
// UI. It is NOT the real security boundary: every admin API endpoint checks
// the token, the staff role and 2FA again before touching data (AdminGuard).
// (Step 29a: sign-in goes through our API, like the shop's — so this no longer
// talks to Supabase at all.)
// ============================================================================
export function proxy(request: NextRequest) {
  const decision = decideAccess(request.nextUrl.pathname, getAccessLevel(request.cookies))
  if (decision.type === 'redirect') {
    return NextResponse.redirect(new URL(decision.to, request.url))
  }

  const nonce = createNonce()
  const csp = buildCsp({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
    connectSrc: [publicEnv.apiUrl],
  })
  // Next.js reads the CSP from the REQUEST headers to find the nonce and
  // stamps it onto its own <script> tags; the RESPONSE header is what the
  // browser enforces.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('Content-Security-Policy', csp)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('Content-Security-Policy', csp)
  return response
}

export const config = {
  matcher: [
    {
      // Every path except Next.js build assets and the favicon.
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      // Skip link prefetches — the real navigation runs the proxy anyway.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
