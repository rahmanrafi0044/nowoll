import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import type { AdminProfile } from '../../admin-auth/admin-auth.service.js'
import { AdminAuthService } from '../../admin-auth/admin-auth.service.js'
import { AUTH_CONFIG, type AuthConfig } from '../../auth/auth-config.js'
import { ADMIN_COOKIES, clearSessionCookies, setSessionCookies } from '../../auth/auth-cookies.js'

// GUARDS: NestJS runs these before the route handler; throwing stops the request.
//
// AdminGuard protects EVERY admin endpoint (via @AdminOnly()). It lets a
// request through only when ALL of these hold (step 29a):
//   • a valid admin session (the nw_admin_* cookies — never the shop's)
//   • users.role is ADMIN or STAFF, and the account isn't banned or deleted
//   • the session passed 2FA (aal2)
// Anything else → 401/403. This — not the admin app's proxy — is the real lock.

type WithAdmin = Request & { admin?: AdminProfile; adminTokens?: AdminTokens }
export interface AdminTokens {
  accessToken: string
  refreshToken: string
}

/** Shared by both guards: read the admin cookies, verify, renew if needed. */
async function identify(ctx: ExecutionContext, auth: AdminAuthService, config: AuthConfig) {
  const req = ctx.switchToHttp().getRequest<WithAdmin>()
  const res = ctx.switchToHttp().getResponse<Response>()
  const cookies = (req.cookies ?? {}) as Record<string, string | undefined>
  const tokens = { access: cookies[ADMIN_COOKIES.access], refresh: cookies[ADMIN_COOKIES.refresh] }
  const notSignedIn = new UnauthorizedException({
    message: 'Please sign in.',
    code: 'NOT_SIGNED_IN',
  })
  if (!tokens.access && !tokens.refresh) throw notSignedIn

  let result
  try {
    result = await auth.authenticate(tokens)
  } catch (error) {
    clearSessionCookies(res, config.cookies, ADMIN_COOKIES) // not (or no longer) staff
    throw error
  }
  if (!result) {
    clearSessionCookies(res, config.cookies, ADMIN_COOKIES) // dead session: don't keep sending it
    throw notSignedIn
  }
  if (result.renewed) setSessionCookies(res, result.renewed, config.cookies, ADMIN_COOKIES)
  req.admin = result.admin
  req.adminTokens = result.renewed
    ? { accessToken: result.renewed.accessToken, refreshToken: result.renewed.refreshToken }
    : { accessToken: tokens.access ?? '', refreshToken: tokens.refresh ?? '' }
  return result
}

/** Every admin endpoint: staff + 2FA done. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const result = await identify(ctx, this.auth, this.config)
    if (!result.twoFactorDone)
      throw new UnauthorizedException({
        message: 'Enter the code from your authenticator app to continue.',
        code: 'TWO_FACTOR_REQUIRED',
      })
    return true
  }
}

/**
 * ONLY the two 2FA steps of sign-in (set up the app, enter a code): staff with
 * a password-only session. Nothing else may ever use this guard.
 */
@Injectable()
export class AdminPasswordStepGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await identify(ctx, this.auth, this.config)
    return true
  }
}

/** In a handler: @CurrentAdmin() admin — the signed-in staff member. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<WithAdmin>().admin!,
)

/** In a handler: @AdminSessionTokens() tokens — this request's (possibly renewed) tokens. */
export const AdminSessionTokens = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) =>
    ctx.switchToHttp().getRequest<WithAdmin>().adminTokens!,
)
