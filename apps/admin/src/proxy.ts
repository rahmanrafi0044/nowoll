import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'
import { type AccessTokenClaims, decideAccess, getAccessLevel } from '@/lib/admin-access'
import { buildCsp, createNonce } from '@/lib/csp'
import { publicEnv, requireEnv } from '@/lib/env'

// ============================================================================
// PROXY (called "middleware" before Next.js 16) — runs on the server BEFORE
// every admin page. Three jobs:
//   1. Refresh the Supabase login session cookie if it's about to expire.
//   2. Gatekeeper: send anyone without staff access to /admin/login.
//   3. Attach a strict Content-Security-Policy with a fresh nonce.
//
// This is a FAST, OPTIMISTIC check that keeps people out of the admin UI.
// It is NOT the real security boundary: every admin API endpoint in NestJS
// verifies the token, role and 2FA again before touching data (Phase 4).
// ============================================================================
export async function proxy(request: NextRequest) {
  const pendingCookies: { name: string; value: string; options: object }[] = []
  const pendingHeaders: Record<string, string> = {}

  const supabase = createServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', publicEnv.supabaseUrl),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', publicEnv.supabaseAnonKey),
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        // Called when Supabase refreshed the session. We update the request
        // (so pages rendered now see the new session) and remember the cookies
        // to send back to the browser on whatever response we return.
        setAll: (cookiesToSet, headers) => {
          for (const { name, value, options } of cookiesToSet) {
            request.cookies.set(name, value)
            pendingCookies.push({ name, value, options })
          }
          Object.assign(pendingHeaders, headers) // no-cache headers, so CDNs never cache a session
        },
      },
    },
  )

  // getClaims() VERIFIES the token's signature — unlike reading the cookie
  // directly, a forged or edited token is rejected here.
  const { data } = await supabase.auth.getClaims()
  const claims = (data?.claims ?? null) as AccessTokenClaims | null

  const decision = decideAccess(request.nextUrl.pathname, getAccessLevel(claims))

  let response: NextResponse
  if (decision.type === 'redirect') {
    response = NextResponse.redirect(new URL(decision.to, request.url))
  } else {
    const nonce = createNonce()
    const csp = buildCsp({
      nonce,
      isDev: process.env.NODE_ENV === 'development',
      connectSrc: [publicEnv.apiUrl, publicEnv.supabaseUrl].filter((o): o is string => !!o),
    })
    // Next.js reads the CSP from the REQUEST headers to find the nonce and
    // stamps it onto its own <script> tags; the RESPONSE header is what the
    // browser enforces.
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-nonce', nonce)
    requestHeaders.set('Content-Security-Policy', csp)
    response = NextResponse.next({ request: { headers: requestHeaders } })
    response.headers.set('Content-Security-Policy', csp)
  }

  for (const { name, value, options } of pendingCookies) response.cookies.set(name, value, options)
  for (const [key, value] of Object.entries(pendingHeaders)) response.headers.set(key, value)
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
