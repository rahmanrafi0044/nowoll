// ============================================================================
// ADAPTER PATTERN (like IMAGE_STORAGE and PAYMENT_GATEWAY): the auth service
// talks to this interface, never to Supabase directly. The real adapter is
// supabase-auth-provider.ts; tests use test/utils/fake-auth-provider.ts, so no
// test ever creates a real account. Every method is documented against
// Supabase's official docs in docs/integrations/supabase.md (Rule 2).
// ============================================================================

export const AUTH_PROVIDER = 'AUTH_PROVIDER'

/** A signed-in session as Supabase issues it. */
export interface AuthSession {
  accessToken: string // short-lived (≈1 hour) — proves who you are
  refreshToken: string // long-lived — swapped for a new session when the access token expires
  expiresIn: number // seconds until the access token expires
  userId: string
  email: string
  fullName: string | null // from sign-up (Supabase user_metadata.full_name)
}

/** What a VERIFIED access token says. */
export interface AccessClaims {
  userId: string // "sub" — the same id as our users table
  email: string
  fullName: string | null // user_metadata.full_name — lets a missing users row be rebuilt with the name
}

export type CreateUserResult =
  | { ok: true; userId: string }
  | { ok: false; reason: 'EMAIL_TAKEN' | 'WEAK_PASSWORD' | 'UNAVAILABLE'; message: string }

export type SignInResult =
  { ok: true; session: AuthSession } | { ok: false; reason: 'INVALID_CREDENTIALS' | 'UNAVAILABLE' }

export interface AuthProvider {
  /** Creates an account (email already confirmed — step 22 decision #3). */
  createUser(params: {
    email: string
    password: string
    fullName: string
  }): Promise<CreateUserResult>
  signIn(email: string, password: string): Promise<SignInResult>
  /** A fresh session from a refresh token; null if the token is no longer valid. */
  refresh(refreshToken: string): Promise<AuthSession | null>
  /** Checks the token's SIGNATURE (and expiry); null if forged, edited or expired. */
  verifyAccessToken(accessToken: string): Promise<AccessClaims | null>
  /** Ends this session at Supabase (its refresh token stops working). Best effort. */
  signOut(accessToken: string): Promise<void>
  /** Emails a reset link pointing at `redirectTo` (see the email template in supabase.md). */
  sendPasswordReset(email: string, redirectTo: string): Promise<void>
  /** Checks the token_hash from a reset link; returns whose account it is, or null. */
  verifyPasswordReset(tokenHash: string): Promise<{ userId: string; email: string } | null>
  setPassword(userId: string, password: string): Promise<boolean>
}
