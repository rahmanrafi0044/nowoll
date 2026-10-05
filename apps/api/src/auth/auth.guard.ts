import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { AUTH_CONFIG, type AuthConfig } from './auth-config.js'
import {
  ACCESS_COOKIE,
  clearSessionCookies,
  REFRESH_COOKIE,
  setSessionCookies,
} from './auth-cookies.js'
import { type AccountProfile, AuthService } from './auth.service.js'

// The signed-in customer, attached to the request by the guards below.
type WithAccount = Request & { account?: AccountProfile }

/**
 * Shared by both guards: read the cookies, verify, renew if needed.
 * A renewed session (expired access token + valid refresh token) gets NEW
 * cookies on this very response, so the browser stays signed in.
 */
async function identify(ctx: ExecutionContext, auth: AuthService, config: AuthConfig) {
  const req = ctx.switchToHttp().getRequest<WithAccount>()
  const res = ctx.switchToHttp().getResponse<Response>()
  const cookies = (req.cookies ?? {}) as Record<string, string | undefined>
  const tokens = { access: cookies[ACCESS_COOKIE], refresh: cookies[REFRESH_COOKIE] }
  if (!tokens.access && !tokens.refresh) return null

  const result = await auth.authenticate(tokens)
  if (!result) {
    clearSessionCookies(res, config.cookies) // dead session: don't keep sending it
    return null
  }
  if (result.renewed) setSessionCookies(res, result.renewed, config.cookies)
  req.account = result.user
  return result.user
}

/** Route needs a signed-in customer: 401 otherwise. */
@Injectable()
export class SignedInGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (await identify(ctx, this.auth, this.config)) return true
    throw new UnauthorizedException({ message: 'Please sign in.', code: 'NOT_SIGNED_IN' })
  }
}

/** Signed in or not, the route works — but a signed-in customer is recognised (e.g. checkout). */
@Injectable()
export class OptionalSignInGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    @Inject(AUTH_CONFIG) private readonly config: AuthConfig,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await identify(ctx, this.auth, this.config)
    return true
  }
}

/** In a handler: @CurrentAccount() account — the signed-in customer (undefined for guests). */
export const CurrentAccount = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest<WithAccount>().account,
)
