// A pretend Supabase Auth for tests: accounts and sessions in memory, no
// network. Behaves like the real one where it matters for security:
// tokens expire, refresh tokens work ONCE (rotation), signing out kills the
// session, reset links work once.
import { randomUUID } from 'node:crypto'
import type {
  AccessClaims,
  AuthProvider,
  AuthSession,
  CreateUserResult,
  SignInResult,
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
    return this.issue({ id: r.userId, email: r.email, password: '', fullName: r.fullName })
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

  private issue(a: Account): AuthSession {
    const claims = { userId: a.id, email: a.email, fullName: a.fullName }
    const accessToken = `access-${randomUUID()}`
    const refreshToken = `refresh-${randomUUID()}`
    this.access.set(accessToken, { claims, expiresAt: Date.now() + 3600_000 })
    this.refreshTokens.set(refreshToken, { ...claims, accessToken })
    return { accessToken, refreshToken, expiresIn: 3600, ...claims }
  }
}
