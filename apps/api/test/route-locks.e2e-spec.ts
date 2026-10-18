// ============================================================================
// Security audit (step 53, docs/security-audit.md) — OWASP A01 "Broken access
// control": EVERY route of the API, with the lock it has, checked here.
//
//   - a route under /admin/ must carry BOTH admin locks: AdminGuard (signed in,
//     staff, 2FA done) and AdminRoleGuard (ADMIN or STAFF) — via @AdminOnly().
//     Only the sign-in steps themselves use the password-step lock.
//   - every route WITHOUT any sign-in lock must be in OPEN_ROUTES below: a list
//     reviewed by hand. A new route that isn't locked fails this test until
//     someone decides, on purpose, that it may be public.
//
// It reads Nest's own route metadata from the real AppModule, so it sees what
// the running API serves — not what a comment says.
// ============================================================================
import type { INestApplication } from '@nestjs/common'
import { DiscoveryService, MetadataScanner } from '@nestjs/core'
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js'
import { RequestMethod } from '@nestjs/common'
import { AdminGuard } from '../src/common/guards/admin.guard.js'
import { AdminRoleGuard } from '../src/common/guards/admin-role.guard.js'
import { createTestApp } from './utils/app.js'

type Lock = 'admin' | 'admin-password-step' | 'signed-in' | 'optional-sign-in' | 'none'
interface Route {
  route: string // "GET /api/v1/products/:slug"
  lock: Lock
  roleGuard: boolean
}

const join = (...parts: string[]) =>
  '/' +
  parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .join('/')

async function routesOf(app: INestApplication): Promise<Route[]> {
  const discovery = app.get(DiscoveryService)
  const scanner = app.get(MetadataScanner)
  const routes: Route[] = []
  for (const wrapper of discovery.getControllers()) {
    const { metatype, instance } = wrapper
    if (!metatype || !instance) continue
    const base = (Reflect.getMetadata(PATH_METADATA, metatype) as string | undefined) ?? ''
    const classGuards = (Reflect.getMetadata(GUARDS_METADATA, metatype) as unknown[]) ?? []
    const proto = Object.getPrototypeOf(instance) as object
    for (const name of scanner.getAllMethodNames(proto)) {
      const handler = (proto as Record<string, unknown>)[name] as object
      const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined
      if (path === undefined) continue // not a route
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number]
      const guards = [
        ...classGuards,
        ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ?? []),
      ].map((g) => (typeof g === 'function' ? g.name : (g as object).constructor.name))
      const lock: Lock = guards.includes(AdminGuard.name)
        ? 'admin'
        : guards.includes('AdminPasswordStepGuard')
          ? 'admin-password-step'
          : guards.includes('SignedInGuard')
            ? 'signed-in'
            : guards.includes('OptionalSignInGuard')
              ? 'optional-sign-in'
              : 'none'
      routes.push({
        route: `${method} ${join('api/v1', base, path)}`,
        lock,
        roleGuard: guards.includes(AdminRoleGuard.name),
      })
    }
  }
  return routes.sort((a, b) => a.route.localeCompare(b.route))
}

/**
 * Routes anyone may call without signing in — REVIEWED one by one in the
 * security audit (docs/security-audit.md → A01). Adding one here is a decision:
 * say in the PR why it must be public and what limits it (rate limit, signature…).
 */
const OPEN_ROUTES: string[] = [
  'GET /api/v1/blog',
  'GET /api/v1/blog/:slug',
  'GET /api/v1/blog/sitemap',
  'GET /api/v1/categories',
  'GET /api/v1/categories/:slug',
  'GET /api/v1/content-blocks/:key',
  'GET /api/v1/feeds/meta-catalog.csv',
  'GET /api/v1/health',
  'GET /api/v1/orders/:id/receipt',
  'GET /api/v1/pages',
  'GET /api/v1/pages/:slug',
  'GET /api/v1/payment/status/:orderId',
  'GET /api/v1/products',
  'GET /api/v1/products/:slug',
  'GET /api/v1/products/facets',
  'GET /api/v1/redirects',
  'GET /api/v1/reviews/product/:productId',
  'GET /api/v1/settings/public',
  'GET /api/v1/shipping/rates',
  'GET /api/v1/variants/product/:productId',
  'POST /api/v1/admin/auth/login',
  'POST /api/v1/admin/auth/logout',
  'POST /api/v1/auth/forgot-password',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/logout',
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/reset-password',
  'POST /api/v1/cart/price',
  'POST /api/v1/checkout/quote',
  'POST /api/v1/discounts/validate',
  'POST /api/v1/orders/track',
  'POST /api/v1/payment/sslcommerz/cancel',
  'POST /api/v1/payment/sslcommerz/fail',
  'POST /api/v1/payment/sslcommerz/init',
  'POST /api/v1/payment/sslcommerz/ipn',
  'POST /api/v1/payment/sslcommerz/success',
  'POST /api/v1/subscribers',
  'POST /api/v1/subscribers/confirm',
  'POST /api/v1/subscribers/unsubscribe',
  'POST /api/v1/webhooks/resend',
]

/**
 * The admin panel's own sign-in, which can't need a full admin session yet:
 * login/logout open (rate-limited 5/min), the 2FA steps only after the
 * password ("password step" lock), and "who am I" for any staff session.
 */
const ADMIN_SIGN_IN_STEPS: Record<string, Lock> = {
  'POST /api/v1/admin/auth/login': 'none',
  'POST /api/v1/admin/auth/logout': 'none',
  'POST /api/v1/admin/auth/2fa/enroll': 'admin-password-step',
  'POST /api/v1/admin/auth/2fa/verify': 'admin-password-step',
  'GET /api/v1/admin/auth/me': 'admin',
}

describe('Route locks (security audit, OWASP A01)', () => {
  let routes: Route[]
  beforeAll(async () => {
    const app = await createTestApp({ asAdmin: false })
    routes = await routesOf(app)
    await app.close()
  })

  it('finds the routes (sanity: the scan works)', () => {
    expect(routes.length).toBeGreaterThan(50)
  })

  it('every /admin/ route has both admin locks (signed-in staff with 2FA, and the role check)', () => {
    const adminRoutes = routes.filter(
      (r) => r.route.includes('/api/v1/admin/') && !(r.route in ADMIN_SIGN_IN_STEPS),
    )
    expect(adminRoutes.length).toBeGreaterThan(30)
    expect(adminRoutes.filter((r) => !(r.lock === 'admin' && r.roleGuard))).toEqual([])
  })

  it('every admin-locked route ANYWHERE (e.g. PATCH /products/:id) also has the role check', () => {
    const missing = routes.filter(
      (r) => r.lock === 'admin' && !r.roleGuard && !(r.route in ADMIN_SIGN_IN_STEPS),
    )
    expect(missing).toEqual([])
  })

  it('the admin sign-in steps have exactly their own locks', () => {
    for (const [route, lock] of Object.entries(ADMIN_SIGN_IN_STEPS))
      expect({ route, lock: routes.find((r) => r.route === route)?.lock }).toEqual({ route, lock })
  })

  it('the only open routes are the reviewed ones', () => {
    const open = routes.filter((r) => r.lock === 'none').map((r) => r.route)
    expect(open).toEqual(OPEN_ROUTES)
  })
})
