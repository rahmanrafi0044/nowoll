// Step 38e: staff management and REAL role checks. These tests sign in for
// real (password + 2FA through the fake Supabase) — the real AdminGuard
// AND the new AdminRoleGuard run, nothing is bypassed.
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { AUTH_PROVIDER } from '../src/auth/auth-provider.js'
import { signInAsStaff, staffAccount } from './utils/admin.js'
import { createTestApp } from './utils/app.js'
import type { FakeAuthProvider } from './utils/fake-auth-provider.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

describe('staff (step 38e)', () => {
  let app: NestExpressApplication
  const http = () => request(app.getHttpServer())

  beforeEach(async () => {
    await resetDatabase()
    app = await createTestApp({ asAdmin: false }) // the real guards
  })
  afterEach(() => app.close())

  describe('what Staff may do (the API enforces it, not just the menu)', () => {
    it('Staff: day-to-day pages work; money-out and shop-wide rules → 403 ADMIN_ONLY', async () => {
      const { cookie } = await signInAsStaff(app, 'staff@nowoll.test', 'STAFF')
      const as = (req: request.Test) => req.set('Cookie', cookie)
      for (const path of [
        '/api/v1/orders',
        '/api/v1/admin/products',
        '/api/v1/admin/categories',
        '/api/v1/admin/content-blocks',
        '/api/v1/admin/pages',
      ])
        await as(http().get(path)).expect(200)

      // Built one by one when sent (a request built early can't be sent later).
      const refused: (() => request.Test)[] = [
        () => as(http().get('/api/v1/admin/settings')),
        () =>
          as(
            http()
              .patch('/api/v1/admin/settings')
              .send({ values: { store_name: 'x' } }),
          ),
        () => as(http().get('/api/v1/admin/payments/status')),
        () => as(http().get('/api/v1/admin/shipping/zones')),
        () => as(http().get('/api/v1/discounts')),
        () => as(http().post('/api/v1/discounts').send({})),
        () => as(http().get('/api/v1/admin/staff')),
        () => as(http().post('/api/v1/admin/staff').send({ email: 'x@y.z', role: 'ADMIN' })),
        () =>
          as(http().patch('/api/v1/returns/00000000-0000-4000-8000-000000000000/refund').send({})),
      ]
      for (const send of refused) {
        const res = await send().expect(403)
        expect(res.body.error).toBe('ADMIN_ONLY')
      }
      // Checking a code at checkout stays public.
      await http()
        .post('/api/v1/discounts/validate')
        .send({ code: 'NOPE', subtotal: 100 })
        .expect((r) => {
          expect(r.status).not.toBe(403)
        })
    })

    it('Admin: everything', async () => {
      const { cookie } = await signInAsStaff(app, 'boss@nowoll.test', 'ADMIN')
      for (const path of [
        '/api/v1/admin/settings',
        '/api/v1/admin/shipping/zones',
        '/api/v1/discounts',
        '/api/v1/admin/staff',
      ])
        await http().get(path).set('Cookie', cookie).expect(200)
    })

    it('a role change applies on the very next click (read from the database every request)', async () => {
      const { cookie, userId } = await signInAsStaff(app, 'staff@nowoll.test', 'ADMIN')
      await http().get('/api/v1/admin/settings').set('Cookie', cookie).expect(200)
      await db.user.update({ where: { id: userId }, data: { role: 'STAFF' } })
      await http().get('/api/v1/admin/settings').set('Cookie', cookie).expect(403)
    })
  })

  describe('managing staff', () => {
    async function asBoss() {
      const boss = await signInAsStaff(app, 'boss@nowoll.test', 'ADMIN')
      const as = (req: request.Test) => req.set('Cookie', boss.cookie)
      return { ...boss, as }
    }

    it('add an existing shop account → listed (with 2FA not set up yet), logged', async () => {
      const { as, userId } = await asBoss()
      await staffAccount(app, 'helper@nowoll.test', 'CUSTOMER')
      await as(
        http().post('/api/v1/admin/staff').send({ email: ' Helper@Nowoll.test ', role: 'STAFF' }),
      ).expect(201)
      const page = (await as(http().get('/api/v1/admin/staff')).expect(200)).body.data
      expect(
        page.members.map((m: { email: string; role: string; isYou: boolean }) => [
          m.email,
          m.role,
          m.isYou,
        ]),
      ).toEqual([
        ['boss@nowoll.test', 'ADMIN', true],
        ['helper@nowoll.test', 'STAFF', false],
      ])
      expect(page.members[0].twoFactor).toBe(true) // the boss signed in with 2FA
      expect(page.members[1].twoFactor).toBe(false) // sets it up at their first sign-in
      expect(page.changes[0]).toMatchObject({
        action: 'GRANTED',
        fromRole: 'CUSTOMER',
        toRole: 'STAFF',
        actor: { email: 'boss@nowoll.test' },
        target: { email: 'helper@nowoll.test' },
      })
      expect(await db.staffChange.count({ where: { actorId: userId } })).toBe(1)
    })

    it('refused: no such account, a banned one, someone already staff, a bad role', async () => {
      const { as } = await asBoss()
      const none = await as(
        http().post('/api/v1/admin/staff').send({ email: 'nobody@nowoll.test', role: 'STAFF' }),
      ).expect(404)
      expect(none.body.message).toMatch(/sign up on the shop first/)
      const banned = await staffAccount(app, 'banned@nowoll.test', 'CUSTOMER')
      await db.user.update({ where: { id: banned.id }, data: { status: 'BANNED' } })
      expect(
        (
          await as(
            http().post('/api/v1/admin/staff').send({ email: 'banned@nowoll.test', role: 'STAFF' }),
          ).expect(409)
        ).body.error,
      ).toBe('ACCOUNT_BANNED')
      await staffAccount(app, 'already@nowoll.test', 'STAFF')
      expect(
        (
          await as(
            http()
              .post('/api/v1/admin/staff')
              .send({ email: 'already@nowoll.test', role: 'ADMIN' }),
          ).expect(409)
        ).body.error,
      ).toBe('ALREADY_STAFF')
      await as(
        http().post('/api/v1/admin/staff').send({ email: 'x@nowoll.test', role: 'OWNER' }),
      ).expect(400)
      expect(await db.staffChange.count()).toBe(0)
    })

    it('change role and remove access — logged; the removed person is a customer again (account kept)', async () => {
      const { as } = await asBoss()
      const helper = await staffAccount(app, 'helper@nowoll.test', 'STAFF')
      await as(http().patch(`/api/v1/admin/staff/${helper.id}`).send({ role: 'ADMIN' })).expect(200)
      await as(http().delete(`/api/v1/admin/staff/${helper.id}`)).expect(200)
      expect(await db.user.findUniqueOrThrow({ where: { id: helper.id } })).toMatchObject({
        role: 'CUSTOMER',
        deletedAt: null,
      })
      expect(
        (await db.staffChange.findMany({ orderBy: { createdAt: 'asc' } })).map((c) => [
          c.action,
          c.fromRole,
          c.toRole,
        ]),
      ).toEqual([
        ['ROLE_CHANGED', 'STAFF', 'ADMIN'],
        ['REVOKED', 'ADMIN', 'CUSTOMER'],
      ])
      await as(http().delete(`/api/v1/admin/staff/${helper.id}`)).expect(404) // not staff any more
    })

    it('lock-out protection: you can’t change, remove or reset your own access', async () => {
      const { as, userId } = await asBoss()
      const self = await as(
        http().patch(`/api/v1/admin/staff/${userId}`).send({ role: 'STAFF' }),
      ).expect(400)
      expect(self.body.error).toBe('NOT_YOURSELF')
      await as(http().delete(`/api/v1/admin/staff/${userId}`)).expect(400)
      await as(http().post(`/api/v1/admin/staff/${userId}/reset-2fa`)).expect(400)
      expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).role).toBe('ADMIN')
    })

    it('two admins removing EACH OTHER at the same moment: one wins, the shop keeps an admin', async () => {
      const a = await signInAsStaff(app, 'a@nowoll.test', 'ADMIN')
      const b = await signInAsStaff(app, 'b@nowoll.test', 'ADMIN')
      const [byA, byB] = await Promise.all([
        http()
          .patch(`/api/v1/admin/staff/${b.userId}`)
          .set('Cookie', a.cookie)
          .send({ role: 'STAFF' }),
        http()
          .patch(`/api/v1/admin/staff/${a.userId}`)
          .set('Cookie', b.cookie)
          .send({ role: 'STAFF' }),
      ])
      // Exactly one wins. The other is refused — how depends on timing:
      //   403 ADMIN_ONLY    the first change finished before the second request
      //                     arrived (that admin is already Staff — roles are read per click)
      //   409 LAST_ADMIN    it arrived just after, and saw no other admin left
      //   409 STAFF_CHANGED truly at the same moment (the serializable transaction;
      //                     forced deterministically in staff.service.spec.ts)
      const statuses = [byA.status, byB.status]
      expect(statuses.filter((s) => s === 200)).toHaveLength(1)
      const refused = byA.status === 200 ? byB : byA
      expect(['ADMIN_ONLY', 'LAST_ADMIN', 'STAFF_CHANGED']).toContain(refused.body.error)
      expect(await db.user.count({ where: { role: 'ADMIN' } })).toBe(1)
    })

    it('reset someone’s authenticator app: removed in Supabase, logged; they set up a new one next time', async () => {
      const { as } = await asBoss()
      const helper = await signInAsStaff(app, 'helper@nowoll.test', 'STAFF')
      const fake = app.get<FakeAuthProvider>(AUTH_PROVIDER)
      expect(await fake.hasVerifiedTotp(helper.userId)).toBe(true)
      await as(http().post(`/api/v1/admin/staff/${helper.userId}/reset-2fa`)).expect(200)
      expect(await fake.hasVerifiedTotp(helper.userId)).toBe(false)
      expect((await db.staffChange.findFirstOrThrow()).action).toBe('TWO_FACTOR_RESET')
      const login = await http()
        .post('/api/v1/admin/auth/login')
        .set('X-Forwarded-For', '10.9.9.9')
        .send({ email: 'helper@nowoll.test', password: 'staff-password-1' })
        .expect(200)
      expect(login.body.data.next).toBe('enroll')
    })
  })
})
