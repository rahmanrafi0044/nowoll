import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { UserRole, UserStatus } from '@nowoll/database/enums'
import { AUTH_PROVIDER, type AuthProvider, type AuthSession } from '../auth/auth-provider.js'
import type { LoginDto } from '../auth/dto/auth.dto.js'
import { PrismaService } from '../prisma/prisma.service.js'

// ============================================================================
// ADMIN SIGN-IN (step 29a) — password, then a 6-digit code from an
// authenticator app (2FA, CLAUDE.md §11.8). Same Supabase accounts as the shop,
// but a separate session (admin cookies) and three extra rules:
//
//   1. STAFF ONLY — users.role must be ADMIN or STAFF. The role is read from
//      OUR database on every request, so `pnpm admin:revoke` or a ban takes
//      effect immediately (nothing to wait for, no token to expire).
//   2. 2FA — the token must say aal2 ("password AND code"). A password-only
//      (aal1) session can do exactly two things: set up the app, enter a code.
//   3. NO AUTO-CREATED ROWS — unlike the shop, an unknown account is simply
//      refused: staff are granted explicitly (scripts/admin-access.ts).
// ============================================================================

export type StaffRole = 'ADMIN' | 'STAFF'

/** What the admin panel gets to know about the signed-in staff member. */
export interface AdminProfile {
  id: string
  email: string
  fullName: string | null
  role: StaffRole
}

export interface AdminAuthenticated {
  admin: AdminProfile
  /** True only for an aal2 token: the 2FA code was entered in this session. */
  twoFactorDone: boolean
  /** Set when the access token had expired and was renewed — new cookies must be sent. */
  renewed: AuthSession | null
}

const INVALID_CREDENTIALS = {
  message: 'Email or password is incorrect.',
  code: 'INVALID_CREDENTIALS',
}
const UNAVAILABLE = 'Sign-in is not available right now. Please try again shortly.'

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_PROVIDER) private readonly provider: AuthProvider,
  ) {}

  /**
   * POST /admin/auth/login — step 1 of 2. The password session it returns is
   * only good for step 2: `next` says whether this person must first set up
   * an authenticator app ('enroll') or just type the code ('verify').
   */
  async login(dto: LoginDto): Promise<{ session: AuthSession; next: 'enroll' | 'verify' }> {
    const result = await this.provider.signIn(dto.email, dto.password)
    if (!result.ok) {
      if (result.reason === 'INVALID_CREDENTIALS')
        throw new UnauthorizedException(INVALID_CREDENTIALS)
      throw new ServiceUnavailableException(UNAVAILABLE)
    }
    const { session } = result
    try {
      await this.staff(session.userId)
      const enrolled = await this.provider.hasVerifiedTotp(session.userId)
      if (enrolled === null) throw new ServiceUnavailableException(UNAVAILABLE)
      return { session, next: enrolled ? 'verify' : 'enroll' }
    } catch (error) {
      // Not staff (or Supabase down): the session Supabase just made is useless — end it.
      await this.provider.signOut(session.accessToken).catch(() => {})
      throw error
    }
  }

  /**
   * Who sent this request? Verifies the token (renewing it if expired), then
   * checks the staff rules against the database. Null = no valid session.
   */
  async authenticate(tokens: {
    access?: string
    refresh?: string
  }): Promise<AdminAuthenticated | null> {
    let claims = tokens.access ? await this.provider.verifyAccessToken(tokens.access) : null
    let renewed: AuthSession | null = null
    if (!claims && tokens.refresh) {
      renewed = await this.provider.refresh(tokens.refresh)
      // Read the RENEWED token's claims — that is where its aal level is.
      if (renewed) claims = await this.provider.verifyAccessToken(renewed.accessToken)
    }
    if (!claims) return null
    return { admin: await this.staff(claims.userId), twoFactorDone: claims.aal === 'aal2', renewed }
  }

  /** POST /admin/auth/2fa/enroll — the QR code for a first-time set-up. */
  async startEnrolment(admin: AdminProfile, tokens: { accessToken: string; refreshToken: string }) {
    const enrolled = await this.provider.hasVerifiedTotp(admin.id)
    if (enrolled === null) throw new ServiceUnavailableException(UNAVAILABLE)
    // Already set up: replacing the app must not be possible with just a
    // password (a stolen password would otherwise beat 2FA). See the lost-phone
    // procedure in docs/integrations/supabase.md.
    if (enrolled)
      throw new ConflictException({
        message: 'Two-factor authentication is already set up. Enter the code from your app.',
        code: 'ALREADY_ENROLLED',
      })
    const enrolment = await this.provider.enrollTotp(tokens)
    if (!enrolment) throw new ServiceUnavailableException(UNAVAILABLE)
    return enrolment
  }

  /** POST /admin/auth/2fa/verify — step 2 of 2: right code → a full (aal2) session. */
  async verifyCode(
    tokens: { accessToken: string; refreshToken: string },
    code: string,
  ): Promise<AuthSession> {
    const result = await this.provider.verifyTotp(tokens, code)
    if (result.ok) return result.session
    if (result.reason === 'WRONG_CODE')
      throw new BadRequestException({
        message: 'That code didn’t work. Check the time on your phone and try the newest code.',
        code: 'WRONG_CODE',
      })
    if (result.reason === 'NO_FACTOR')
      throw new ConflictException({
        message: 'Set up your authenticator app first.',
        code: 'NOT_ENROLLED',
      })
    throw new ServiceUnavailableException(UNAVAILABLE)
  }

  /** POST /admin/auth/logout — ends the session at Supabase too (best effort). */
  async logout(accessToken: string | undefined): Promise<void> {
    if (accessToken) await this.provider.signOut(accessToken).catch(() => {})
  }

  /** The staff rules (DENY BY DEFAULT): a users row, role ADMIN/STAFF, not banned or deleted. */
  private async staff(userId: string): Promise<AdminProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user || user.deletedAt || user.role === UserRole.CUSTOMER)
      throw new ForbiddenException({
        message: 'This account doesn’t have admin access.',
        code: 'NOT_STAFF',
      })
    if (user.status === UserStatus.BANNED)
      throw new ForbiddenException({
        message: 'This account has been disabled.',
        code: 'ACCOUNT_DISABLED',
      })
    return { id: user.id, email: user.email, fullName: user.fullName, role: user.role }
  }
}
