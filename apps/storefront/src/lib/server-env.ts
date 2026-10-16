import { publicEnv } from '@/lib/env'

// ============================================================================
// SERVER-ONLY settings (step 48), read when the server runs — not baked into
// the build like NEXT_PUBLIC_* — and never sent to a browser. Only server code
// (pages, the proxy) may import this file.
//
// API_INTERNAL_URL  the API over the server's private Docker network
//                   (http://api:3001): no trip out to the internet and back.
// INTERNAL_API_KEY  a shared secret: the API doesn't count the shop's own page
//                   builds against the per-visitor rate limit
//                   (apps/api/src/config/internal-request.ts).
// COOKIE_PREFIX     "nw" (production) / "nws" (staging) — must match the API.
// Unset (development, tests): the public API address, no key, "nw".
// ============================================================================

/** Where server code reaches the API. */
export const serverApiUrl = () => process.env.API_INTERNAL_URL || publicEnv.apiUrl

/** Headers for server → API calls: the shared secret, when there is one. */
export function internalHeaders(): Record<string, string> {
  const key = process.env.INTERNAL_API_KEY
  return key ? { 'x-internal-key': key } : {}
}

/** The login cookies' names (set by the API — apps/api/src/auth/auth-cookies.ts). */
export function loginCookieNames() {
  const prefix = process.env.COOKIE_PREFIX || 'nw'
  return { access: `${prefix}_access`, refresh: `${prefix}_refresh` }
}
