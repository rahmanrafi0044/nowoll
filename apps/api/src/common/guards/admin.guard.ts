import { type CanActivate, Injectable, UnauthorizedException } from '@nestjs/common'

// GUARD: NestJS runs this before the route handler; returning false or throwing
// stops the request. Every admin-only endpoint uses it (via @AdminOnly()).
//
// DENY BY DEFAULT until Phase 4. Real admin sign-in (Supabase token + ADMIN/STAFF
// role + 2FA, matching apps/admin/src/lib/admin-access.ts) doesn't exist yet, so
// this refuses EVERY request. That way no admin endpoint can ever be reachable
// without auth by accident. Tests replace this guard to exercise the endpoints.
// TODO(phase 4): verify the Supabase JWT, user_role ∈ {ADMIN, STAFF} and aal2.
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(): boolean {
    throw new UnauthorizedException('Admin sign-in is not available yet.')
  }
}
