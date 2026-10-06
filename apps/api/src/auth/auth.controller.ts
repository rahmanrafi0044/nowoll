import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { StrictRateLimit } from '../common/decorators/strict-rate-limit.decorator.js'
import { AUTH_CONFIG, type AuthConfig } from './auth-config.js'
import { ACCESS_COOKIE, clearSessionCookies, setSessionCookies } from './auth-cookies.js'
import { CurrentAccount, SignedInGuard } from './auth.guard.js'
import { type AccountProfile, AuthService } from './auth.service.js'
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
} from './dto/auth.dto.js'

const ONE_MINUTE_MS = 60_000

// Rate limits (CLAUDE.md §8): 5/min on everything that takes a password or
// sends an email — that's what stops password guessing and email bombing.
// /me and /logout carry no secret and are called on every page load, so they
// get a normal limit; a strict one would sign people out of their own shop.
//
// "Cache-Control: no-store" everywhere: these answers are personal and must
// never be kept by a browser cache or CDN.
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Post('register')
  @StrictRateLimit()
  @Header('Cache-Control', 'no-store')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { session, user } = await this.auth.register(dto)
    setSessionCookies(res, session, this.config.cookies)
    return { user }
  }

  @Post('login')
  @HttpCode(200)
  @StrictRateLimit()
  @Header('Cache-Control', 'no-store')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { session, user } = await this.auth.login(dto)
    setSessionCookies(res, session, this.config.cookies)
    return { user }
  }

  @Post('logout')
  @HttpCode(200)
  @Throttle({ default: { ttl: ONE_MINUTE_MS, limit: 30 } })
  @Header('Cache-Control', 'no-store')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>
    await this.auth.logout(cookies[ACCESS_COOKIE])
    clearSessionCookies(res, this.config.cookies)
    return { signedOut: true }
  }

  @Get('me')
  @UseGuards(SignedInGuard)
  @Throttle({ default: { ttl: ONE_MINUTE_MS, limit: 60 } })
  @Header('Cache-Control', 'no-store')
  me(@CurrentAccount() account: AccountProfile) {
    return { user: account }
  }

  /** The customer's own name and mobile (step 23). */
  @Patch('me')
  @UseGuards(SignedInGuard)
  @Throttle({ default: { ttl: ONE_MINUTE_MS, limit: 30 } })
  @Header('Cache-Control', 'no-store')
  async updateMe(@CurrentAccount() account: AccountProfile, @Body() dto: UpdateProfileDto) {
    return { user: await this.auth.updateProfile(account.id, dto) }
  }

  /** Needs the current password — and the strict limit (it's a password guess too). */
  @Post('change-password')
  @HttpCode(200)
  @UseGuards(SignedInGuard)
  @StrictRateLimit()
  @Header('Cache-Control', 'no-store')
  async changePassword(@CurrentAccount() account: AccountProfile, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(account, dto)
    return { changed: true }
  }

  /** Always the same answer — whether or not the email has an account. */
  @Post('forgot-password')
  @HttpCode(200)
  @StrictRateLimit()
  @Header('Cache-Control', 'no-store')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto)
    return { sent: true }
  }

  @Post('reset-password')
  @HttpCode(200)
  @StrictRateLimit()
  @Header('Cache-Control', 'no-store')
  async resetPassword(@Body() dto: ResetPasswordDto, @Res({ passthrough: true }) res: Response) {
    const { session, user } = await this.auth.resetPassword(dto)
    setSessionCookies(res, session, this.config.cookies)
    return { user }
  }
}
