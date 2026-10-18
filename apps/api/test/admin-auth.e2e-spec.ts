// Step 29a: admin sign-in — password, then a 6-digit code from an
// authenticator app — and the REAL AdminGuard on every admin endpoint.
// The security rules under test (deny by default):
//   • staff only (users.role ADMIN/STAFF), checked in OUR database every request
//   • 2FA done (aal2) — a password-only session can only set up the app / enter a code
//   • the admin session is separate from the shop's
import { Logger } from '@nestjs/common'
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { AUTH_PROVIDER } from '../src/auth/auth-provider.js'
import { cookiesFrom, signInAsStaff, STAFF_PASSWORD, staffAccount, visitor } from './utils/admin.js'
import { signUp } from './utils/auth.js'
import { createTestApp } from './utils/app.js'
import { FakeAuthProvider } from './utils/fake-auth-provider.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('admin sign-in (step 29a)', () => {
  let app: NestExpressApplication
  let fake: FakeAuthProvider
  const http = () => request(app.getHttpServer())
  const login = (email: string, password = STAFF_PASSWORD, ip = visitor()) =>
    http().post('/api/v1/admin/auth/login').set('X-Forwarded-For', ip).send({ email, password })
  const post = (path: string, cookie: string, body: object = {}, ip = visitor()) =>
    http()
      .post(`/api/v1/admin/auth/${path}`)
      .set('X-Forwarded-For', ip)
      .set('Cookie', cookie)
      .send(body)
  const me = (cookie?: string) => {
    const req = http().get('/api/v1/admin/auth/me')
    return cookie ? req.set('Cookie', cookie) : req
  }
  // Three admin endpoints from different modules — all behind the same guard.
  // (Sent one after another: supertest can't start several at once on one app.)
  async function adminEndpoints(cookie: string) {
    const c = (req: request.Test) => (cookie ? req.set('Cookie', cookie) : req)
    return [
      await c(http().get('/api/v1/inventory')),
      await c(http().get('/api/v1/returns')),
      await c(http().post('/api/v1/categories')).send({ name: 'Guarded' }),
    ]
  }

  beforeEach(async () => {
    await resetDatabase()
    app = await createTestApp({ asAdmin: false }) // the REAL AdminGuard
    fake = app.get<FakeAuthProvider>(AUTH_PROVIDER)
  })
  afterEach(() => app.close())

  describe('first sign-in: set up the authenticator app', () => {
    it('password → QR code → code → signed in; the admin cookies are HttpOnly + SameSite=Strict', async () => {
      const staff = await staffAccount(app, 'rafi@nowoll.com')
      const step1 = await login('rafi@nowoll.com').expect(200)
      expect(step1.body.data).toEqual({ next: 'enroll' })
      const raw = ([] as string[]).concat(step1.headers['set-cookie'] ?? [])
      expect(raw.map((c) => c.split('=')[0]).sort()).toEqual([
        'nw_admin_access',
        'nw_admin_refresh',
      ])
      for (const c of raw) {
        expect(c).toMatch(/HttpOnly/i)
        expect(c).toMatch(/SameSite=Strict/i)
      }
      const pending = cookiesFrom(step1)

      const qr = await post('2fa/enroll', pending).expect(200)
      expect(qr.body.data.qrCode).toMatch(/^data:image\/svg\+xml/)
      expect(qr.body.data.secret).toEqual(expect.any(String))

      const wrong = await post('2fa/verify', pending, { code: '000000' }).expect(400)
      expect(wrong.body.error).toBe('WRONG_CODE')
      const ok = await post('2fa/verify', pending, { code: fake.codeOnPhone(staff.id) }).expect(200)
      expect(ok.body.data.admin).toEqual({
        id: staff.id,
        email: 'rafi@nowoll.com',
        fullName: 'Rafi',
        role: 'ADMIN',
      })

      const full = cookiesFrom(ok)
      expect((await me(full).expect(200)).body.data.admin.role).toBe('ADMIN')
      for (const r of await adminEndpoints(full)) expect(r.status).not.toBe(401)
    })

    it('a half-finished set-up (QR shown, no code) is replaced by the next one', async () => {
      const staff = await staffAccount(app, 'rafi@nowoll.com')
      const pending = cookiesFrom(await login('rafi@nowoll.com').expect(200))
      const first = (await post('2fa/enroll', pending).expect(200)).body.data.secret
      const again = cookiesFrom(await login('rafi@nowoll.com').expect(200))
      const second = (await post('2fa/enroll', again).expect(200)).body.data.secret
      expect(second).not.toBe(first)
      await post('2fa/verify', again, { code: FakeAuthProvider.codeFor(first) }).expect(400)
      await post('2fa/verify', again, { code: fake.codeOnPhone(staff.id) }).expect(200)
    })

    it('the code is required to be exactly 6 digits', async () => {
      await staffAccount(app, 'rafi@nowoll.com')
      const pending = cookiesFrom(await login('rafi@nowoll.com').expect(200))
      await post('2fa/enroll', pending).expect(200)
      for (const code of ['12345', '1234567', 'abcdef', ''])
        await post('2fa/verify', pending, { code }).expect(400)
    })
  })

  describe('later sign-ins', () => {
    it('password → code (no new QR: a stolen password must not be enough to replace the app)', async () => {
      const { userId } = await signInAsStaff(app, 'rafi@nowoll.com')
      const step1 = await login('rafi@nowoll.com').expect(200)
      expect(step1.body.data).toEqual({ next: 'verify' })
      const pending = cookiesFrom(step1)
      expect((await post('2fa/enroll', pending).expect(409)).body.error).toBe('ALREADY_ENROLLED')
      await post('2fa/verify', pending, { code: fake.codeOnPhone(userId) }).expect(200)
    })

    it('STAFF can sign in too', async () => {
      const { cookie } = await signInAsStaff(app, 'staff@nowoll.com', 'STAFF')
      expect((await me(cookie).expect(200)).body.data.admin.role).toBe('STAFF')
    })
  })

  describe('the password alone (no code yet) opens nothing', () => {
    it('admin endpoints and /me → 401 TWO_FACTOR_REQUIRED', async () => {
      await staffAccount(app, 'rafi@nowoll.com')
      const pending = cookiesFrom(await login('rafi@nowoll.com').expect(200))
      expect((await me(pending).expect(401)).body.error).toBe('TWO_FACTOR_REQUIRED')
      for (const res of await adminEndpoints(pending)) {
        expect(res.status).toBe(401)
        expect(res.body.error).toBe('TWO_FACTOR_REQUIRED')
      }
      expect(await db.category.count()).toBe(0)
    })
  })

  describe('who is refused', () => {
    it('no session at all → 401', async () => {
      expect((await me().expect(401)).body.error).toBe('NOT_SIGNED_IN')
      for (const r of await adminEndpoints('')) expect(r.status).toBe(401)
    })

    it('a customer with the right password → 403 NOT_STAFF, and no admin session is kept', async () => {
      await staffAccount(app, 'shopper@example.com', 'CUSTOMER')
      const res = await login('shopper@example.com').expect(403)
      expect(res.body.error).toBe('NOT_STAFF')
      expect(res.headers['set-cookie']).toBeUndefined()
    })

    it('a Supabase account we never granted → 403, and no users row is created for it', async () => {
      const a = fake.addAccount('stranger@example.com', STAFF_PASSWORD)
      expect((await login('stranger@example.com').expect(403)).body.error).toBe('NOT_STAFF')
      expect(await db.user.findUnique({ where: { id: a.id } })).toBeNull()
    })

    it('a wrong password → 401, the same answer as an unknown email', async () => {
      await staffAccount(app, 'rafi@nowoll.com')
      const wrong = await login('rafi@nowoll.com', 'not-the-password').expect(401)
      const unknown = await login('nobody@nowoll.com').expect(401)
      expect(wrong.body).toEqual(unknown.body)
    })

    it('failed sign-ins are logged with the email partly hidden — never the password (security audit)', async () => {
      const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
      await staffAccount(app, 'rafi@nowoll.com')
      await staffAccount(app, 'shopper@example.com', 'CUSTOMER')
      await login('rafi@nowoll.com', 'not-the-password').expect(401)
      await login('shopper@example.com').expect(403)
      const lines = warn.mock.calls.map((c) => String(c[0]))
      warn.mockRestore()
      expect(lines).toEqual(
        expect.arrayContaining([
          'Admin sign-in failed: wrong email or password (r***@nowoll.com)',
          'Admin sign-in refused: not staff or disabled (s***@example.com)',
        ]),
      )
      expect(lines.join(' ')).not.toMatch(/not-the-password|rafi@|shopper@/)
    })

    it('the SHOP session never opens the admin panel — even for an admin', async () => {
      const shop = await signUp(app, 'rafi@nowoll.com')
      await db.user.update({ where: { id: shop.userId }, data: { role: 'ADMIN' } })
      expect((await me(shop.cookie).expect(401)).body.error).toBe('NOT_SIGNED_IN')
      for (const r of await adminEndpoints(shop.cookie)) expect(r.status).toBe(401)
    })

    it('a forged token → 401 and the cookies are cleared', async () => {
      const res = await me('nw_admin_access=forged; nw_admin_refresh=forged').expect(401)
      expect(String(res.headers['set-cookie'])).toMatch(/nw_admin_access=;/)
    })

    it('Supabase down at sign-in → 503 and no session', async () => {
      await staffAccount(app, 'rafi@nowoll.com')
      fake.down = true
      const res = await login('rafi@nowoll.com').expect(503)
      expect(res.headers['set-cookie']).toBeUndefined()
    })
  })

  describe('changes take effect on the very next request', () => {
    it('role removed (pnpm admin:revoke) → 403 NOT_STAFF, cookies cleared', async () => {
      const { cookie, userId } = await signInAsStaff(app, 'rafi@nowoll.com')
      await db.user.update({ where: { id: userId }, data: { role: 'CUSTOMER' } })
      const res = await me(cookie).expect(403)
      expect(res.body.error).toBe('NOT_STAFF')
      expect(String(res.headers['set-cookie'])).toMatch(/nw_admin_access=;/)
      for (const r of await adminEndpoints(cookie)) expect(r.status).toBe(403)
    })

    it('banned → 403 ACCOUNT_DISABLED; soft-deleted → 403', async () => {
      const a = await signInAsStaff(app, 'a@nowoll.com')
      await db.user.update({ where: { id: a.userId }, data: { status: 'BANNED' } })
      expect((await me(a.cookie).expect(403)).body.error).toBe('ACCOUNT_DISABLED')
      const b = await signInAsStaff(app, 'b@nowoll.com')
      await db.user.update({ where: { id: b.userId }, data: { deletedAt: new Date() } })
      await me(b.cookie).expect(403)
    })

    it('authenticator app removed (lost phone) → signed out everywhere', async () => {
      const { cookie, userId } = await signInAsStaff(app, 'rafi@nowoll.com')
      await fake.removeTotp(userId)
      await me(cookie).expect(401)
      expect((await login('rafi@nowoll.com').expect(200)).body.data).toEqual({ next: 'enroll' })
    })
  })

  describe('session lifetime', () => {
    it('an expired access token is renewed — and the renewed session still counts as 2FA-done', async () => {
      const { cookie } = await signInAsStaff(app, 'rafi@nowoll.com')
      fake.expireAccessTokens()
      const res = await me(cookie).expect(200)
      const renewed = cookiesFrom(res)
      expect(renewed).toMatch(/nw_admin_access=/)
      await me(renewed).expect(200)
    })

    it('an expired PASSWORD-ONLY session renews as password-only (still no access)', async () => {
      await staffAccount(app, 'rafi@nowoll.com')
      const pending = cookiesFrom(await login('rafi@nowoll.com').expect(200))
      fake.expireAccessTokens()
      expect((await me(pending).expect(401)).body.error).toBe('TWO_FACTOR_REQUIRED')
    })

    it('sign out → cookies cleared and the session is dead at Supabase too', async () => {
      const { cookie } = await signInAsStaff(app, 'rafi@nowoll.com')
      const out = await http().post('/api/v1/admin/auth/logout').set('Cookie', cookie).expect(200)
      expect(String(out.headers['set-cookie'])).toMatch(/nw_admin_access=;/)
      await me(cookie).expect(401) // the OLD cookies no longer work either
    })

    it('signing out of the shop leaves the admin session alone', async () => {
      const shop = await signUp(app, 'rafi@example.com')
      const admin = await signInAsStaff(app, 'rafi@nowoll.com')
      await http()
        .post('/api/v1/auth/logout')
        .set('Cookie', `${shop.cookie}; ${admin.cookie}`)
        .expect(200)
      await me(admin.cookie).expect(200)
    })
  })

  describe('rate limits (guessing codes or passwords)', () => {
    it('a 6th code attempt within a minute → 429', async () => {
      await staffAccount(app, 'rafi@nowoll.com')
      const ip = visitor()
      const pending = cookiesFrom(await login('rafi@nowoll.com', STAFF_PASSWORD, ip).expect(200))
      await post('2fa/enroll', pending, {}, ip).expect(200)
      for (let i = 0; i < 5; i++)
        await post('2fa/verify', pending, { code: '000000' }, ip).expect(400)
      await post('2fa/verify', pending, { code: '000000' }, ip).expect(429)
    })

    it('a 6th password attempt within a minute → 429', async () => {
      const ip = visitor()
      for (let i = 0; i < 5; i++) await login('rafi@nowoll.com', 'guess', ip).expect(401)
      await login('rafi@nowoll.com', 'guess', ip).expect(429)
    })
  })
})
