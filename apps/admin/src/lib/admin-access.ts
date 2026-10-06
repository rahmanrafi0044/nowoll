// ============================================================================
// Who may open which admin page — pure functions, no network, easy to test.
//
// This is only the FAST, OPTIMISTIC first gate (in proxy.ts): "is there an
// admin session cookie at all?" The cookies are HttpOnly and only the API can
// verify them, so the REAL check — staff role + 2FA — happens in the API on
// every request (AdminGuard). Pages load their data from the API and go to
// the sign-in page whenever it says no (components/admin-shell.tsx).
// ============================================================================

export const LOGIN_PATH = '/admin/login'
export const HOME_PATH = '/admin/dashboard'

// Set by the API (apps/api/src/auth/auth-cookies.ts → ADMIN_COOKIES). The
// shop's own cookies (nw_access) never count here.
export const ADMIN_SESSION_COOKIES = ['nw_admin_access', 'nw_admin_refresh'] as const

export type AccessLevel = 'anonymous' | 'has-session'

export function getAccessLevel(cookies: { has(name: string): boolean }): AccessLevel {
  return ADMIN_SESSION_COOKIES.some((name) => cookies.has(name)) ? 'has-session' : 'anonymous'
}

export type AccessDecision = { type: 'allow' } | { type: 'redirect'; to: string }

export function decideAccess(pathname: string, access: AccessLevel): AccessDecision {
  // "/" and "/admin" have no page of their own — send people somewhere useful.
  if (pathname === '/' || pathname === '/admin') {
    return { type: 'redirect', to: access === 'has-session' ? HOME_PATH : LOGIN_PATH }
  }
  // The sign-in page is always reachable: a session cookie may belong to
  // someone halfway through (password done, code not yet) — the page itself
  // asks the API and moves on if they're already fully signed in.
  if (pathname === LOGIN_PATH || access === 'has-session') return { type: 'allow' }

  // Remember where they were going so sign-in can send them back afterwards.
  return { type: 'redirect', to: `${LOGIN_PATH}?${new URLSearchParams({ next: pathname })}` }
}

// Prevents an "open redirect": an attacker sending staff a link like
// /admin/login?next=https://evil.com so that, after a real login, they land
// on a fake look-alike site. Only our own /admin/* paths are accepted.
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/admin/') || next.startsWith('//') || next.includes('\\')) {
    return HOME_PATH
  }
  return next
}
