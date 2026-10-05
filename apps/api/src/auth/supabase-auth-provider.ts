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
} from './auth-provider.js'

// The real adapter, written against Supabase's official JavaScript reference
// (summarised in docs/integrations/supabase.md → "Auth").
//
// Two clients, both STATELESS (persistSession: false): the server never keeps
// anyone's session in memory — each call gets exactly the tokens it needs.
//   anon  — the public key: sign in, refresh, verify, reset emails
//   admin — the service role key (SERVER ONLY): create accounts, set passwords
const STATELESS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}

export class SupabaseAuthProvider implements AuthProvider {
  private readonly logger = new Logger(SupabaseAuthProvider.name)
  private readonly anon: SupabaseClient
  private readonly admin: SupabaseClient

  constructor(url: string, anonKey: string, serviceRoleKey: string) {
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
    return { userId: claims.sub, email: typeof claims.email === 'string' ? claims.email : '' }
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
}

function toSession(s: Session): AuthSession {
  return {
    accessToken: s.access_token,
    refreshToken: s.refresh_token,
    expiresIn: s.expires_in,
    userId: s.user.id,
    email: s.user.email ?? '',
  }
}

/** code + status only — never tokens or passwords in logs. */
const describe = (e: AuthError | null) =>
  e ? `${e.code ?? 'no code'} (HTTP ${e.status ?? '?'})` : 'no error, no data'
