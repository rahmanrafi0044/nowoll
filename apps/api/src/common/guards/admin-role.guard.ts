import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import type { StaffRole } from '../../admin-auth/admin-auth.service.js'

// ============================================================================
// ROLE CHECK (step 38e). Runs AFTER AdminGuard (which proved: signed in,
// staff, 2FA done, and put the role on the request). Routes marked
// @AdminOnly({ role: 'ADMIN' }) — money going out, shop-wide rules, staff —
// refuse STAFF with 403 ADMIN_ONLY. The role is read from OUR database on
// every request (AdminGuard), so a change applies on the very next click.
// ============================================================================

export const ADMIN_ROLE_KEY = 'adminRole'

/** Marks a handler/controller as needing this role (used by @AdminOnly). */
export const RequireRole = (role: StaffRole) => SetMetadata(ADMIN_ROLE_KEY, role)

/** Set by AdminGuard (and, in tests only, by its stand-in) — never from the request body. */
export type WithAdminRole = Request & { adminRole?: StaffRole }

@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const needed = this.reflector.getAllAndOverride<StaffRole | undefined>(ADMIN_ROLE_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!needed || needed === 'STAFF') return true // any staff member (AdminGuard already checked)
    const role = ctx.switchToHttp().getRequest<WithAdminRole>().adminRole
    if (role !== 'ADMIN')
      throw new ForbiddenException({
        message: 'Only an admin can do this. Ask an admin if it needs changing.',
        code: 'ADMIN_ONLY',
      })
    return true
  }
}
