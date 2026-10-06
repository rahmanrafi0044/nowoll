import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Prisma } from '@nowoll/database'
import { UserStatus } from '@nowoll/database/enums'
import { PrismaService } from '../prisma/prisma.service.js'
import { AUTH_CONFIG, type AuthConfig } from './auth-config.js'
import { AUTH_PROVIDER, type AuthProvider, type AuthSession } from './auth-provider.js'
import type { ForgotPasswordDto, LoginDto, RegisterDto, ResetPasswordDto } from './dto/auth.dto.js'

/** What the shop gets to know about the signed-in customer. */
export interface AccountProfile {
  id: string
  email: string
  fullName: string | null
  phone: string | null
}

export interface SignedIn {
  session: AuthSession
  user: AccountProfile
}

/** The result of checking a request's cookies. */
export interface Authenticated {
  user: AccountProfile
  /** Set when the access token had expired and was renewed — new cookies must be sent. */
  renewed: AuthSession | null
}

// ONE answer for a wrong email AND a wrong password: never reveal which emails have accounts.
const INVALID_CREDENTIALS = {
  message: 'Email or password is incorrect.',
  code: 'INVALID_CREDENTIALS',
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name)

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_PROVIDER) private readonly provider: AuthProvider,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  /** POST /auth/register — creates the account, then signs straight in. */
  async register(dto: RegisterDto): Promise<SignedIn> {
    const created = await this.provider.createUser({
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName,
    })
    if (!created.ok) {
      const error = { message: created.message, code: created.reason }
      throw created.reason === 'EMAIL_TAKEN'
        ? new ConflictException(error)
        : created.reason === 'WEAK_PASSWORD'
          ? new UnprocessableEntityException(error)
          : new ServiceUnavailableException(error)
    }
    await this.saveUser({
      id: created.userId,
      email: dto.email,
      fullName: dto.fullName,
      phone: dto.phone ?? null,
    })

    const signedIn = await this.provider.signIn(dto.email, dto.password)
    if (!signedIn.ok)
      throw new ServiceUnavailableException({
        message: 'Your account was created — please sign in.',
        code: 'SIGN_IN_AFTER_REGISTER_FAILED',
      })
    return { session: signedIn.session, user: await this.profile(created.userId) }
  }

  /** POST /auth/login */
  async login(dto: LoginDto): Promise<SignedIn> {
    const result = await this.provider.signIn(dto.email, dto.password)
    if (!result.ok) {
      if (result.reason === 'INVALID_CREDENTIALS')
        throw new UnauthorizedException(INVALID_CREDENTIALS)
      throw new ServiceUnavailableException(
        'Sign-in is not available right now. Please try again shortly.',
      )
    }
    const user = await this.ensureUser(result.session)
    return { session: result.session, user }
  }

  /**
   * Who is this request from? Checks the access token's signature; if it has
   * expired, swaps the refresh token for a new session (`renewed`). Null when
   * there is no valid session at all. Banned or deleted accounts are refused.
   */
  async authenticate(tokens: { access?: string; refresh?: string }): Promise<Authenticated | null> {
    let claims = tokens.access ? await this.provider.verifyAccessToken(tokens.access) : null
    let renewed: AuthSession | null = null
    if (!claims && tokens.refresh) {
      renewed = await this.provider.refresh(tokens.refresh)
      claims = renewed
    }
    if (!claims) return null
    return { user: await this.ensureUser(claims), renewed }
  }

  /** POST /auth/logout — ends the session at Supabase too (best effort). */
  async logout(accessToken: string | undefined): Promise<void> {
    if (accessToken) await this.provider.signOut(accessToken).catch(() => {})
  }

  /**
   * POST /auth/forgot-password — ALWAYS the same answer, whether or not the
   * email has an account (otherwise this would reveal who shops here).
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    await this.provider.sendPasswordReset(dto.email, `${this.config.siteUrl}/reset-password`)
  }

  /** POST /auth/reset-password — from the emailed link: new password, then signed in. */
  async resetPassword(dto: ResetPasswordDto): Promise<SignedIn> {
    const owner = await this.provider.verifyPasswordReset(dto.tokenHash)
    if (!owner)
      throw new BadRequestException({
        message: 'This reset link has expired or was already used. Please ask for a new one.',
        code: 'RESET_LINK_INVALID',
      })
    if (!(await this.provider.setPassword(owner.userId, dto.password)))
      throw new ServiceUnavailableException(
        'Your password could not be changed right now. Please try again.',
      )

    const signedIn = await this.provider.signIn(owner.email, dto.password)
    if (!signedIn.ok)
      throw new ServiceUnavailableException({
        message: 'Your password was changed — please sign in.',
        code: 'SIGN_IN_AFTER_RESET_FAILED',
      })
    return { session: signedIn.session, user: await this.ensureUser(signedIn.session) }
  }

  async profile(userId: string): Promise<AccountProfile> {
    const u = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } })
    return { id: u.id, email: u.email, fullName: u.fullName, phone: u.phone }
  }

  /**
   * Every signed-in request makes sure the account has its row in OUR users
   * table (decision #6) — e.g. an account made in the Supabase dashboard, or a
   * sign-up that stopped halfway. Then refuses banned / deleted accounts.
   */
  private async ensureUser(who: {
    userId: string
    email: string
    fullName: string | null
  }): Promise<AccountProfile> {
    // (The name comes from Supabase, where sign-up stored it — found in the real-project check:
    // a sign-up whose users row failed to save was rebuilt without it.)
    const user = await this.saveUser({
      id: who.userId,
      email: who.email.toLowerCase(),
      ...(who.fullName && { fullName: who.fullName }),
    })
    if (user.status === UserStatus.BANNED || user.deletedAt)
      throw new ForbiddenException({
        message:
          'This account has been disabled. Please contact us if you think this is a mistake.',
        code: 'ACCOUNT_DISABLED',
      })
    return { id: user.id, email: user.email, fullName: user.fullName, phone: user.phone }
  }

  /** Insert-if-missing (never overwrites what the customer saved later). */
  private async saveUser(data: {
    id: string
    email: string
    fullName?: string
    phone?: string | null
  }) {
    try {
      return await this.prisma.user.upsert({ where: { id: data.id }, create: data, update: {} })
    } catch (error) {
      // The email belongs to a DIFFERENT users row (an old account deleted in
      // Supabase but kept here): never merge two people's data automatically.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.error(`users.email conflict for auth user ${data.id} — needs a manual check`)
        throw new ConflictException({
          message: 'This account needs attention. Please contact us.',
          code: 'ACCOUNT_CONFLICT',
        })
      }
      throw error
    }
  }
}
