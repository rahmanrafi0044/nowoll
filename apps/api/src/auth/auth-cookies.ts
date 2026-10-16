import type { CookieOptions, Response } from 'express'
import type { AuthSession } from './auth-provider.js'

// ============================================================================
// The login session lives in two cookies (CLAUDE.md §8 and §11):
//   nw_access  — the short-lived access token (≈1 hour)
//   nw_refresh — swapped for a new session when the access token runs out
//
//   HttpOnly        JavaScript can't read them → a script injected into the
//                   page (XSS) can't steal a session. Never in localStorage.
//   Secure          sent over https only (production)
//   SameSite=Strict not sent when ANOTHER site triggers a request (CSRF guard)
//   Domain          ".nowoll.com" in production, so the shop (nowoll.com) and
//                   the API (api.nowoll.com) both receive them
// ============================================================================
//
// The "nw" at the start is COOKIE_PREFIX (step 48): staging uses "nws", so its
// cookies never mix with production's. Read once at start-up — Docker passes
// it as a real environment variable; development and tests use "nw".
const PREFIX = process.env.COOKIE_PREFIX || 'nw'
export const ACCESS_COOKIE = `${PREFIX}_access`
export const REFRESH_COOKIE = `${PREFIX}_refresh`

// The ADMIN panel's session uses its own pair (step 29a): being signed in to
// the shop never signs you in to admin, and signing out of one leaves the other.
export interface CookieNames {
  access: string
  refresh: string
}
export const CUSTOMER_COOKIES: CookieNames = { access: ACCESS_COOKIE, refresh: REFRESH_COOKIE }
export const ADMIN_COOKIES: CookieNames = {
  access: `${PREFIX}_admin_access`,
  refresh: `${PREFIX}_admin_refresh`,
}
export const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000 // a month of "remember me"

export interface CookieSettings {
  secure: boolean
  domain?: string
}

const base = (s: CookieSettings): CookieOptions => ({
  httpOnly: true,
  secure: s.secure,
  sameSite: 'strict',
  path: '/',
  ...(s.domain && { domain: s.domain }),
})

export function setSessionCookies(
  res: Response,
  session: AuthSession,
  s: CookieSettings,
  names: CookieNames = CUSTOMER_COOKIES,
): void {
  res.cookie(names.access, session.accessToken, { ...base(s), maxAge: session.expiresIn * 1000 })
  res.cookie(names.refresh, session.refreshToken, { ...base(s), maxAge: REFRESH_MAX_AGE_MS })
}

export function clearSessionCookies(
  res: Response,
  s: CookieSettings,
  names: CookieNames = CUSTOMER_COOKIES,
): void {
  res.clearCookie(names.access, base(s))
  res.clearCookie(names.refresh, base(s))
}
