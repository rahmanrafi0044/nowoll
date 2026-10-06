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
export const ACCESS_COOKIE = 'nw_access'
export const REFRESH_COOKIE = 'nw_refresh'
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

export function setSessionCookies(res: Response, session: AuthSession, s: CookieSettings): void {
  res.cookie(ACCESS_COOKIE, session.accessToken, { ...base(s), maxAge: session.expiresIn * 1000 })
  res.cookie(REFRESH_COOKIE, session.refreshToken, { ...base(s), maxAge: REFRESH_MAX_AGE_MS })
}

export function clearSessionCookies(res: Response, s: CookieSettings): void {
  res.clearCookie(ACCESS_COOKIE, base(s))
  res.clearCookie(REFRESH_COOKIE, base(s))
}
