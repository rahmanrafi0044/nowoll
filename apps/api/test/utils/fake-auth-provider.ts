// A pretend Supabase Auth for tests: accounts and sessions in memory, no
// network. Behaves like the real one where it matters for security:
// tokens expire, refresh tokens work ONCE (rotation), signing out kills the
// session, reset links work once. 2FA: each authenticator app's "current
// code" is fixed (codeFor) — tests type it like a person reading their phone.
import { randomUUID } from 'node:crypto'
import type {
  AccessClaims,
  AuthProvider,
  AuthSession,
  CreateUserResult,
  SignInResult,
  TotpEnrolment,
  TotpVerifyResult,
  UserTokens,
} from '../../src/auth/auth-provider.js'

interface Account {
  id: string
  email: string
  password: string
  fullName: string | null // Supabase keeps it as user_metadata.full_name
}

export class FakeAuthProvider implements AuthProvider {
  readonly accounts = new Map<string, Account>() // by email
  /** Every reset email that would have been sent. */
  readonly resetEmails: { email: string; redirectTo: string; tokenHash: string }[] = []
  /** Set to make Supabase "unreachable". */
  down = false
  private readonly access = new Map<string, { claims: AccessClaims; expiresAt: number }>()
  private readonly refreshTokens = new Map<string, AccessClaims & { accessToken: string }>()
  private readonly resetTokens = new Map<string, Account>()
  /** Authenticator apps, by user id. */
  readonly factors = new Map<string, { secret: string; status: 'verified' | 'unverified' }[]>()

  async createUser(p: {
    email: string
    password: string
    fullName: string
  }): Promise<CreateUserResult> {
    if (this.down)
      return { ok: false, reason: 'UNAVAILABLE', message: 'Sign-up is not available right now.' }
    if (this.accounts.has(p.email))
      return {
        ok: false,
        reason: 'EMAIL_TAKEN',
        message: 'An account with this email already exists.',
      }
    const account = { id: randomUUID(), email: p.email, password: p.password, fullName: p.fullName }
    this.accounts.set(p.email, account)
    return { ok: true, userId: account.id }
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    if (this.down) return { ok: false, reason: 'UNAVAILABLE' }
    const a = this.accounts.get(email)
    if (!a || a.password !== password) return { ok: false, reason: 'INVALID_CREDENTIALS' }
    return { ok: true, session: this.issue(a) }
  }

  async refresh(refreshToken: string): Promise<AuthSession | null> {
    const r = this.refreshTokens.get(refreshToken)
    if (!r || this.down) return null
    this.refreshTokens.delete(refreshToken) // single use
    // A renewed session keeps its level (aal2 stays aal2), like Supabase's.
    return this.issue(
      { id: r.userId, email: r.email, password: '', fullName: r.fullName },
      r.aal ?? 'aal1',
    )
  }

  async verifyAccessToken(accessToken: string): Promise<AccessClaims | null> {
    const t = this.access.get(accessToken)
    return t && t.expiresAt > Date.now() ? t.claims : null
  }

  async signOut(accessToken: string): Promise<void> {
    this.access.delete(accessToken)
    for (const [token, r] of this.refreshTokens)
      if (r.accessToken === accessToken) this.refreshTokens.delete(token)
  }

  async sendPasswordReset(email: string, redirectTo: string): Promise<void> {
    const a = this.accounts.get(email)
    if (!a) return // like Supabase: nothing happens, and nobody is told
    const tokenHash = `reset-${randomUUID()}`
    this.resetTokens.set(tokenHash, a)
    this.resetEmails.push({ email, redirectTo, tokenHash })
  }

  async verifyPasswordReset(tokenHash: string): Promise<{ userId: string; email: string } | null> {
    const a = this.resetTokens.get(tokenHash)
    if (!a) return null
    this.resetTokens.delete(tokenHash) // single use
    return { userId: a.id, email: a.email }
  }

  async setPassword(userId: string, password: string): Promise<boolean> {
    for (const a of this.accounts.values()) if (a.id === userId) a.password = password
    return true
  }

  async hasVerifiedTotp(userId: string): Promise<boolean | null> {
    if (this.down) return null
    return (this.factors.get(userId) ?? []).some((f) => f.status === 'verified')
  }

  async enrollTotp(tokens: UserTokens): Promise<TotpEnrolment | null> {
    const who = await this.verifyAccessToken(tokens.accessToken)
    if (!who || this.down) return null
    const kept = (this.factors.get(who.userId) ?? []).filter((f) => f.status === 'verified')
    const secret = `FAKESECRET${randomUUID().replace(/\D/g, '').slice(0, 6).padEnd(6, '7')}`
    this.factors.set(who.userId, [...kept, { secret, status: 'unverified' }])
    return { qrCode: `data:image/svg+xml;utf-8,<svg data-secret="${secret}"/>`, secret }
  }

  async verifyTotp(tokens: UserTokens, code: string): Promise<TotpVerifyResult> {
    const who = await this.verifyAccessToken(tokens.accessToken)
    if (!who || this.down) return { ok: false, reason: 'UNAVAILABLE' }
    const factors = this.factors.get(who.userId) ?? []
    const factor = factors.find((f) => f.status === 'verified') ?? factors.at(-1)
    if (!factor) return { ok: false, reason: 'NO_FACTOR' }
    if (code !== FakeAuthProvider.codeFor(factor.secret)) return { ok: false, reason: 'WRONG_CODE' }
    // Supabase: "Upon verifying a factor, all other sessions are logged out".
    if (factor.status === 'unverified') this.endAllSessions(who.userId)
    factor.status = 'verified'
    const a = [...this.accounts.values()].find((x) => x.id === who.userId)!
    return { ok: true, session: this.issue(a, 'aal2') }
  }

  async removeTotp(userId: string): Promise<boolean> {
    if (this.down) return false
    if ((this.factors.get(userId) ?? []).some((f) => f.status === 'verified'))
      this.endAllSessions(userId) // like admin.mfa.deleteFactor on a verified factor
    this.factors.delete(userId)
    return true
  }

  /** The 6-digit code the authenticator app would show for this secret. */
  static codeFor(secret: string): string {
    return secret.slice(-6)
  }

  /** The code on this user's phone right now (their working app, else the one being set up). */
  codeOnPhone(userId: string): string {
    const factors = this.factors.get(userId) ?? []
    const f = factors.find((x) => x.status === 'verified') ?? factors.at(-1)
    if (!f) throw new Error('no authenticator app')
    return FakeAuthProvider.codeFor(f.secret)
  }

  /** Makes every access token issued so far expire now (to test renewal). */
  expireAccessTokens(): void {
    for (const t of this.access.values()) t.expiresAt = 0
  }

  /** An account that exists in Supabase but not (yet) in our users table. */
  addAccount(email: string, password: string, fullName: string | null = null): Account {
    const a = { id: randomUUID(), email, password, fullName }
    this.accounts.set(email, a)
    return a
  }

  private endAllSessions(userId: string): void {
    for (const [t, v] of this.access) if (v.claims.userId === userId) this.access.delete(t)
    for (const [t, r] of this.refreshTokens) if (r.userId === userId) this.refreshTokens.delete(t)
  }

  private issue(a: Account, aal = 'aal1'): AuthSession {
    const claims = { userId: a.id, email: a.email, fullName: a.fullName, aal }
    const accessToken = `access-${randomUUID()}`
    const refreshToken = `refresh-${randomUUID()}`
    this.access.set(accessToken, { claims, expiresAt: Date.now() + 3600_000 })
    this.refreshTokens.set(refreshToken, { ...claims, accessToken })
    return { accessToken, refreshToken, expiresIn: 3600, ...claims }
  }
}
