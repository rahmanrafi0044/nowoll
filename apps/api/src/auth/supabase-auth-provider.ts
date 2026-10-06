import { Logger } from '@nestjs/common'
import {
  type AuthError,
  createClient,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js'
import type {
  AccessClaims,
  AuthProvider,
  AuthSession,
  CreateUserResult,
  SignInResult,
  TotpEnrolment,
  TotpVerifyResult,
  UserTokens,
} from './auth-provider.js'

// The real adapter, written against Supabase's official JavaScript reference
// (summarised in docs/integrations/supabase.md → "Auth").
//
// Two clients, both STATELESS (persistSession: false): the server never keeps
// anyone's session in memory — each call gets exactly the tokens it needs.
//   anon  — the public key: sign in, refresh, verify, reset emails
//   admin — the service role key (SERVER ONLY): create accounts, set passwords,
//           list/remove 2FA factors
// plus, for the 2FA calls Supabase only accepts FROM the user (enrol, verify),
// a throw-away client per call that holds just that user's tokens (asUser).
const STATELESS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}

export class SupabaseAuthProvider implements AuthProvider {
  private readonly logger = new Logger(SupabaseAuthProvider.name)
  private readonly anon: SupabaseClient
  private readonly admin: SupabaseClient

  constructor(
    private readonly url: string,
    private readonly anonKey: string,
    serviceRoleKey: string,
  ) {
    this.anon = createClient(url, anonKey, STATELESS)
    this.admin = createClient(url, serviceRoleKey, STATELESS)
  }

  async createUser(p: {
    email: string
    password: string
    fullName: string
  }): Promise<CreateUserResult> {
    // admin.createUser behaves the same whatever "Confirm email" is set to in
    // the dashboard; email_confirm: true = no confirmation email (decision #3).
    const { data, error } = await this.admin.auth.admin.createUser({
      email: p.email,
      password: p.password,
      email_confirm: true,
      user_metadata: { full_name: p.fullName },
    })
    if (data.user) return { ok: true, userId: data.user.id }
    if (error?.code === 'email_exists' || error?.code === 'user_already_exists')
      return {
        ok: false,
        reason: 'EMAIL_TAKEN',
        message: 'An account with this email already exists.',
      }
    if (error?.code === 'weak_password')
      return { ok: false, reason: 'WEAK_PASSWORD', message: 'Please choose a stronger password.' }
    this.logger.error(`createUser failed: ${describe(error)}`)
    return {
      ok: false,
      reason: 'UNAVAILABLE',
      message: 'Sign-up is not available right now. Please try again shortly.',
    }
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    const { data, error } = await this.anon.auth.signInWithPassword({ email, password })
    if (data.session) return { ok: true, session: toSession(data.session) }
    // Supabase deliberately doesn't say whether the email exists (nor do we).
    if (error?.code === 'invalid_credentials' || error?.status === 400)
      return { ok: false, reason: 'INVALID_CREDENTIALS' }
    this.logger.error(`signIn failed: ${describe(error)}`)
    return { ok: false, reason: 'UNAVAILABLE' }
  }

  async refresh(refreshToken: string): Promise<AuthSession | null> {
    const { data, error } = await this.anon.auth.refreshSession({ refresh_token: refreshToken })
    if (data.session) return toSession(data.session)
    if (error && (error.status ?? 0) >= 500) this.logger.error(`refresh failed: ${describe(error)}`)
    return null
  }

  async verifyAccessToken(accessToken: string): Promise<AccessClaims | null> {
    // getClaims() verifies the SIGNATURE against Supabase's published keys
    // (JWKS, cached) — a forged or edited token is rejected. It also checks expiry.
    const { data, error } = await this.anon.auth.getClaims(accessToken)
    const claims = data?.claims
    if (error || !claims || typeof claims.sub !== 'string') return null
    return {
      userId: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : '',
      fullName: metadataName(claims.user_metadata),
      ...(typeof claims.aal === 'string' && { aal: claims.aal }),
    }
  }

  async signOut(accessToken: string): Promise<void> {
    // scope 'local': ends THIS session only (other devices stay signed in).
    const { error } = await this.admin.auth.admin.signOut(accessToken, 'local')
    if (error) this.logger.warn(`signOut: ${describe(error)}`)
  }

  async sendPasswordReset(email: string, redirectTo: string): Promise<void> {
    const { error } = await this.anon.auth.resetPasswordForEmail(email, { redirectTo })
    // Never tell the caller: "no such email" must look exactly like success.
    if (error) this.logger.warn(`resetPasswordForEmail: ${describe(error)}`)
  }

  async verifyPasswordReset(tokenHash: string): Promise<{ userId: string; email: string } | null> {
    const { data, error } = await this.anon.auth.verifyOtp({
      type: 'recovery',
      token_hash: tokenHash,
    })
    if (error || !data.user) return null
    return { userId: data.user.id, email: data.user.email ?? '' }
  }

  async setPassword(userId: string, password: string): Promise<boolean> {
    const { error } = await this.admin.auth.admin.updateUserById(userId, { password })
    if (error) this.logger.error(`updateUserById failed: ${describe(error)}`)
    return !error
  }

  // --- Two-factor authentication (Supabase "MFA", TOTP) ----------------------
  // Official reference: auth.mfa.enroll / challengeAndVerify and
  // auth.admin.mfa.listFactors / deleteFactor — summarised in
  // docs/integrations/supabase.md → "Admin sign-in and 2FA".

  async hasVerifiedTotp(userId: string): Promise<boolean | null> {
    const factors = await this.totpFactors(userId)
    return factors && factors.some((f) => f.status === 'verified')
  }

  async enrollTotp(tokens: UserTokens): Promise<TotpEnrolment | null> {
    const user = await this.asUser(tokens)
    if (!user) return null
    // A set-up abandoned halfway (QR shown, no code typed) leaves an
    // "unverified" factor behind — remove it so the new QR code is the only one.
    for (const f of (await this.totpFactors(user.id)) ?? [])
      if (f.status === 'unverified') await this.deleteFactor(user.id, f.id)

    const { data, error } = await user.client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Nowoll admin',
      issuer: 'Nowoll', // the name shown in the authenticator app
    })
    if (error || !data) {
      this.logger.error(`mfa.enroll failed: ${describe(error)}`)
      return null
    }
    // (The library already turned qr_code into a data: URL. Never log the secret.)
    return { qrCode: data.totp.qr_code, secret: data.totp.secret }
  }

  async verifyTotp(tokens: UserTokens, code: string): Promise<TotpVerifyResult> {
    const user = await this.asUser(tokens)
    if (!user) return { ok: false, reason: 'UNAVAILABLE' }
    const factors = await this.totpFactors(user.id)
    if (!factors) return { ok: false, reason: 'UNAVAILABLE' }
    // The working app if there is one; otherwise the newest one being set up.
    const factor =
      factors.find((f) => f.status === 'verified') ??
      factors
        .filter((f) => f.status === 'unverified')
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    if (!factor) return { ok: false, reason: 'NO_FACTOR' }

    const { data, error } = await user.client.auth.mfa.challengeAndVerify({
      factorId: factor.id,
      code,
    })
    if (data) {
      return {
        ok: true,
        session: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresIn: data.expires_in,
          userId: data.user.id,
          email: data.user.email ?? '',
          fullName: metadataName(data.user.user_metadata),
        },
      }
    }
    // 4xx = Supabase refused the code (wrong or expired); 5xx/none = it's down.
    if (error && (error.status ?? 500) < 500) return { ok: false, reason: 'WRONG_CODE' }
    this.logger.error(`mfa.challengeAndVerify failed: ${describe(error)}`)
    return { ok: false, reason: 'UNAVAILABLE' }
  }

  async removeTotp(userId: string): Promise<boolean> {
    const factors = await this.totpFactors(userId)
    if (!factors) return false
    let ok = true
    for (const f of factors) ok = (await this.deleteFactor(userId, f.id)) && ok
    return ok
  }

  private async totpFactors(userId: string) {
    const { data, error } = await this.admin.auth.admin.mfa.listFactors({ userId })
    if (error || !data) {
      this.logger.error(`admin.mfa.listFactors failed: ${describe(error)}`)
      return null
    }
    return data.factors.filter((f) => f.factor_type === 'totp')
  }

  private async deleteFactor(userId: string, id: string): Promise<boolean> {
    const { error } = await this.admin.auth.admin.mfa.deleteFactor({ id, userId })
    if (error) this.logger.error(`admin.mfa.deleteFactor failed: ${describe(error)}`)
    return !error
  }

  /** A client signed in as this user, for this one call only (nothing shared between users). */
  private async asUser(tokens: UserTokens) {
    const client = createClient(this.url, this.anonKey, STATELESS)
    const { data, error } = await client.auth.setSession({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
    })
    if (error || !data.user) {
      this.logger.warn(`setSession for 2FA failed: ${describe(error)}`)
      return null
    }
    return { client, id: data.user.id }
  }
}

function toSession(s: Session): AuthSession {
  return {
    accessToken: s.access_token,
    refreshToken: s.refresh_token,
    expiresIn: s.expires_in,
    userId: s.user.id,
    email: s.user.email ?? '',
    fullName: metadataName(s.user.user_metadata),
  }
}

/** The name given at sign-up (we store it as user_metadata.full_name). */
function metadataName(metadata: unknown): string | null {
  const name = (metadata as { full_name?: unknown } | null | undefined)?.full_name
  return typeof name === 'string' && name.trim() ? name.trim() : null
}

/** code + status only — never tokens or passwords in logs. */
const describe = (e: AuthError | null) =>
  e ? `${e.code ?? 'no code'} (HTTP ${e.status ?? '?'})` : 'no error, no data'
