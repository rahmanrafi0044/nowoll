// ============================================================================
// Who may open which admin page — pure functions, no network, easy to test.
// proxy.ts gathers the facts (is there a session? what does the token say?)
// and these functions make the decision.
// ============================================================================

export const LOGIN_PATH = '/admin/login'
export const HOME_PATH = '/admin/dashboard'

// Roles allowed into the admin panel. Must match the UserRole enum in
// packages/database/prisma/schema.prisma.
const ADMIN_ROLES = new Set(['ADMIN', 'STAFF'])

/** The parts of a Supabase access token (JWT) we look at. */
export interface AccessTokenClaims {
  // Added to the token by a Supabase "custom access token hook" (a small
  // Postgres function) that copies users.role into every login token.
  // TODO(phase 4): create that hook. Until it exists no token carries
  // user_role, so NOBODY can enter the admin panel — safe by default.
  user_role?: string
  // Authenticator Assurance Level, set by Supabase Auth itself:
  // 'aal1' = password only, 'aal2' = password + 2FA code (TOTP).
  aal?: string
}

export type AccessLevel = 'anonymous' | 'unauthorized' | 'authorized'

// DENY BY DEFAULT: anything other than "staff role AND 2FA completed" is
// treated as not allowed. Customers also have Supabase accounts, so merely
// being signed in must never be enough.
export function getAccessLevel(claims: AccessTokenClaims | null): AccessLevel {
  if (!claims) return 'anonymous'
  const isStaff = claims.user_role !== undefined && ADMIN_ROLES.has(claims.user_role)
  const passed2fa = claims.aal === 'aal2' // CLAUDE.md §11.8: 2FA enforced for admin
  return isStaff && passed2fa ? 'authorized' : 'unauthorized'
}

export type AccessDecision = { type: 'allow' } | { type: 'redirect'; to: string }

export function decideAccess(pathname: string, access: AccessLevel): AccessDecision {
  // "/" and "/admin" have no page of their own — send people somewhere useful.
  if (pathname === '/' || pathname === '/admin') {
    return { type: 'redirect', to: access === 'authorized' ? HOME_PATH : LOGIN_PATH }
  }

  if (pathname === LOGIN_PATH) {
    // Already fully signed in → skip the login page.
    // (An 'unauthorized' user must still be able to SEE the login page,
    // otherwise they'd bounce between login and dashboard forever.)
    return access === 'authorized' ? { type: 'redirect', to: HOME_PATH } : { type: 'allow' }
  }

  if (access === 'authorized') return { type: 'allow' }

  // Remember where they were going so login can send them back afterwards.
  const params = new URLSearchParams({ next: pathname })
  if (access === 'unauthorized') params.set('error', 'forbidden')
  return { type: 'redirect', to: `${LOGIN_PATH}?${params.toString()}` }
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
