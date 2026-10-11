import { applyDecorators, UseGuards } from '@nestjs/common'
import type { StaffRole } from '../../admin-auth/admin-auth.service.js'
import { AdminGuard } from '../guards/admin.guard.js'
import { AdminRoleGuard, RequireRole } from '../guards/admin-role.guard.js'

/**
 * Marks a route (or a whole controller) as admin-panel only:
 *   @AdminOnly()                  any staff member (ADMIN or STAFF), 2FA done
 *   @AdminOnly({ role: 'ADMIN' }) ADMIN only — refunds, discounts, settings,
 *                                 shipping, staff (step 38e)
 * AdminGuard runs first (who are you?), then AdminRoleGuard (may you?).
 */
export const AdminOnly = (options: { role?: StaffRole } = {}) =>
  applyDecorators(RequireRole(options.role ?? 'STAFF'), UseGuards(AdminGuard, AdminRoleGuard))
