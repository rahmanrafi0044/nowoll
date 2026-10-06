import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { AUTH_CONFIG, type AuthConfig } from '../auth/auth-config.js'
import { ADMIN_COOKIES, clearSessionCookies, setSessionCookies } from '../auth/auth-cookies.js'
import { LoginDto } from '../auth/dto/auth.dto.js'
import { StrictRateLimit } from '../common/decorators/strict-rate-limit.decorator.js'
import {
  AdminGuard,
  AdminPasswordStepGuard,
  AdminSessionTokens,
  type AdminTokens,
  CurrentAdmin,
} from '../common/guards/admin.guard.js'
import { type AdminProfile, AdminAuthService } from './admin-auth.service.js'
import { TwoFactorCodeDto } from './dto/admin-auth.dto.js'

const ONE_MINUTE_MS = 60_000

// /api/v1/admin/auth/* — the admin panel's sign-in (step 29a):
//   POST login        email + password            → { next: 'enroll' | 'verify' }
//   POST 2fa/enroll   (first time) the QR code     → { qrCode, secret }
//   POST 2fa/verify   the 6-digit code             → { admin }  (now fully signed in)
//   GET  me           who am I (needs 2FA done)
//   POST logout
// 5/min on everything that takes a password or a code: at that speed guessing
// a 6-digit code would take years. "no-store": these answers are personal.
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  @Post('login')
  @HttpCode(200)
  @StrictRateLimit()
  @Header('Cache-Control', 'no-store')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { session, next } = await this.auth.login(dto)
    setSessionCookies(res, session, this.config.cookies, ADMIN_COOKIES)
    return { next }
  }

  @Post('2fa/enroll')
  @HttpCode(200)
  @UseGuards(AdminPasswordStepGuard)
  @StrictRateLimit()
  @Header('Cache-Control', 'no-store')
  enroll(@CurrentAdmin() admin: AdminProfile, @AdminSessionTokens() tokens: AdminTokens) {
    return this.auth.startEnrolment(admin, tokens)
  }

  @Post('2fa/verify')
  @HttpCode(200)
  @UseGuards(AdminPasswordStepGuard)
  @StrictRateLimit()
  @Header('Cache-Control', 'no-store')
  async verify(
    @CurrentAdmin() admin: AdminProfile,
    @AdminSessionTokens() tokens: AdminTokens,
    @Body() dto: TwoFactorCodeDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.verifyCode(tokens, dto.code)
    setSessionCookies(res, session, this.config.cookies, ADMIN_COOKIES)
    return { admin }
  }

  @Get('me')
  @UseGuards(AdminGuard)
  @Throttle({ default: { ttl: ONE_MINUTE_MS, limit: 60 } })
  @Header('Cache-Control', 'no-store')
  me(@CurrentAdmin() admin: AdminProfile) {
    return { admin }
  }

  @Post('logout')
  @HttpCode(200)
  @Throttle({ default: { ttl: ONE_MINUTE_MS, limit: 30 } })
  @Header('Cache-Control', 'no-store')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = (req.cookies ?? {}) as Record<string, string | undefined>
    await this.auth.logout(cookies[ADMIN_COOKIES.access])
    clearSessionCookies(res, this.config.cookies, ADMIN_COOKIES)
    return { signedOut: true }
  }
}
