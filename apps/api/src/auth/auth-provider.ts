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
  /**
   * Authenticator Assurance Level (the token's "aal" claim): 'aal1' = password
   * only, 'aal2' = password + a 2FA code. Admin routes require 'aal2'.
   */
  aal?: string
}

/** The user's tokens, for the 2FA calls that must be made AS that user. */
export interface UserTokens {
  accessToken: string
  refreshToken: string
}

/** A new authenticator-app (TOTP) factor waiting for its first code. */
export interface TotpEnrolment {
  /** An SVG image of the QR code, as a data: URL — show it with <img>. */
  qrCode: string
  /** The same secret as text, for typing in when the camera can't scan. */
  secret: string
}

export type TotpVerifyResult =
  | { ok: true; session: AuthSession }
  | { ok: false; reason: 'WRONG_CODE' | 'NO_FACTOR' | 'UNAVAILABLE' }

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

  // --- Two-factor authentication (admin sign-in, step 29a) ------------------
  /** Has this user finished setting up an authenticator app? null = Supabase unreachable. */
  hasVerifiedTotp(userId: string): Promise<boolean | null>
  /**
   * Starts setting up an authenticator app (replacing any half-finished set-up).
   * null = the tokens are no longer valid, or Supabase is unreachable.
   */
  enrollTotp(tokens: UserTokens): Promise<TotpEnrolment | null>
  /**
   * Checks a 6-digit code from the app. Right → a NEW session at 'aal2'.
   * Uses the verified factor, or else the one being set up.
   */
  verifyTotp(tokens: UserTokens, code: string): Promise<TotpVerifyResult>
  /** Removes every authenticator app (lost phone — see docs/integrations/supabase.md). */
  removeTotp(userId: string): Promise<boolean>
}
