// HTTP tests for /api/v1/auth/* (real nowoll_test DB, FAKE Supabase Auth).
// What matters most: the session only ever travels in HttpOnly cookies,
// errors never reveal which emails have accounts, and sessions renew/expire safely.
import { randomUUID } from 'node:crypto'
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { AUTH_PROVIDER } from '../src/auth/auth-provider.js'
import { createTestApp } from './utils/app.js'
import { makeCategory, makeProduct, seedShippingZones } from './utils/factories.js'
import type { FakeAuthProvider } from './utils/fake-auth-provider.js'
import { resetDatabase, testPrisma } from './utils/test-db.js'

const db = testPrisma()
afterAll(() => db.$disconnect())

/** Set-Cookie headers → { name: { value, attributes (lower-case) } } */
function cookies(res: request.Response) {
  const raw = ([] as string[]).concat(res.headers['set-cookie'] ?? [])
  return Object.fromEntries(
    raw.map((c) => {
      const [pair, ...attrs] = c.split(';').map((s) => s.trim())
      const [name, ...v] = pair!.split('=')
      return [name!, { value: v.join('='), attrs: attrs.map((a) => a.toLowerCase()) }]
    }),
  ) as Record<string, { value: string; attrs: string[] }>
}
const cookieHeader = (res: request.Response) =>
  Object.entries(cookies(res))
    .filter(([, c]) => c.value)
    .map(([n, c]) => `${n}=${c.value}`)
    .join('; ')

const newCustomer = {
  fullName: '  Rafi Rahman ',
  email: ' Rafi@Example.com ',
  phone: '017 1234-5678',
  password: 'correct horse battery',
}

describe('/auth', () => {
  let app: NestExpressApplication
  let fake: FakeAuthProvider
  const http = () => request(app.getHttpServer())
  const register = (body: object = newCustomer) => http().post('/api/v1/auth/register').send(body)
  const login = (email: string, password: string) =>
    http().post('/api/v1/auth/login').send({ email, password })
  const me = (cookie?: string) => {
    const req = http().get('/api/v1/auth/me')
    return cookie ? req.set('Cookie', cookie) : req
  }

  beforeEach(async () => {
    await resetDatabase()
    app = await createTestApp({ asAdmin: false }) // fresh per test: rate limits must not leak
    fake = app.get(AUTH_PROVIDER)
  })
  afterEach(() => app.close())

  describe('register', () => {
    it('201: account + users row, signed in via HttpOnly SameSite=Strict cookies only', async () => {
      const res = await register().expect(201)
      expect(res.body).toEqual({
        success: true,
        data: {
          user: {
            id: expect.any(String),
            email: 'rafi@example.com',
            fullName: 'Rafi Rahman',
            phone: '+8801712345678',
          },
        },
      })
      expect(JSON.stringify(res.body)).not.toMatch(/access-|refresh-/) // tokens never in the body
      const c = cookies(res)
      for (const name of ['nw_access', 'nw_refresh']) {
        expect(c[name]!.value).toBeTruthy()
        expect(c[name]!.attrs).toEqual(
          expect.arrayContaining(['httponly', 'samesite=strict', 'path=/']),
        )
      }
      expect(res.headers['cache-control']).toBe('no-store')
      expect(
        await db.user.findUniqueOrThrow({ where: { email: 'rafi@example.com' } }),
      ).toMatchObject({
        id: res.body.data.user.id,
        role: 'CUSTOMER',
      })
    })

    it('409 EMAIL_TAKEN for an email that already has an account', async () => {
      await register().expect(201)
      const res = await register().expect(409)
      expect(res.body.error).toBe('EMAIL_TAKEN')
    })

    it('400 for a short password, a bad email or phone, or extra fields', async () => {
      await register({ ...newCustomer, password: '1234567' }).expect(400)
      await register({ ...newCustomer, email: 'nope' }).expect(400)
      await register({ ...newCustomer, phone: '12345' }).expect(400)
      await register({ ...newCustomer, role: 'ADMIN' }).expect(400) // can't make yourself an admin
    })

    it('503 when Supabase is unreachable — and no half-made account', async () => {
      fake.down = true
      await register().expect(503)
      expect(await db.user.count()).toBe(0)
    })
  })

  describe('login', () => {
    beforeEach(() => register().expect(201))

    it('200 + cookies with the right password (email in any case)', async () => {
      const res = await login('RAFI@example.com', newCustomer.password).expect(200)
      expect(res.body.data.user.email).toBe('rafi@example.com')
      expect(cookies(res).nw_access!.value).toBeTruthy()
    })

    it('a wrong password and an unknown email get the SAME answer', async () => {
      const wrong = await login('rafi@example.com', 'wrong password').expect(401)
      const unknown = await login('nobody@example.com', 'whatever123').expect(401)
      expect(wrong.body).toEqual(unknown.body)
      expect(wrong.body).toMatchObject({
        error: 'INVALID_CREDENTIALS',
        message: 'Email or password is incorrect.',
      })
      expect(cookies(wrong).nw_access).toBeUndefined()
    })

    it('5 attempts per minute, then 429 (stops password guessing)', async () => {
      // 5 guesses (limits are counted per route, so the sign-up above doesn't count)…
      for (let i = 0; i < 5; i++) await login('rafi@example.com', `guess-${i}`).expect(401)
      // …and even the RIGHT password is refused for the rest of the minute.
      await login('rafi@example.com', newCustomer.password).expect(429)
    })

    it('a sign-up whose users row failed to save is repaired on sign-in — WITH the name (found in the real-Supabase check)', async () => {
      fake.addAccount('halfway@example.com', 'halfway-password', 'Halfway Customer')
      const res = await login('halfway@example.com', 'halfway-password').expect(200)
      expect(res.body.data.user).toMatchObject({
        email: 'halfway@example.com',
        fullName: 'Halfway Customer',
      })
      expect(
        (await db.user.findUniqueOrThrow({ where: { email: 'halfway@example.com' } })).fullName,
      ).toBe('Halfway Customer')
    })

    it('an account made outside the shop (e.g. Supabase dashboard) gets its users row on first sign-in', async () => {
      fake.addAccount('staff@nowoll.com', 'dashboard-made-1')
      await login('staff@nowoll.com', 'dashboard-made-1').expect(200)
      expect(await db.user.findUnique({ where: { email: 'staff@nowoll.com' } })).not.toBeNull()
    })

    it('an email already used by a DIFFERENT users row is never merged into it', async () => {
      // e.g. an old account deleted in Supabase but kept in our table (orders point at it)
      await db.user.create({ data: { id: randomUUID(), email: 'old@example.com' } })
      fake.addAccount('old@example.com', 'new-account-1')
      const res = await login('old@example.com', 'new-account-1').expect(409)
      expect(res.body.error).toBe('ACCOUNT_CONFLICT')
      expect(await db.user.count({ where: { email: 'old@example.com' } })).toBe(1)
    })

    it('a banned account is refused', async () => {
      await db.user.update({ where: { email: 'rafi@example.com' }, data: { status: 'BANNED' } })
      const res = await login('rafi@example.com', newCustomer.password).expect(403)
      expect(res.body.error).toBe('ACCOUNT_DISABLED')
    })
  })

  describe('me — who am I?', () => {
    it('200 with the profile when signed in; 401 NOT_SIGNED_IN otherwise', async () => {
      const cookie = cookieHeader(await register().expect(201))
      const res = await me(cookie).expect(200)
      expect(res.body.data.user).toMatchObject({
        email: 'rafi@example.com',
        fullName: 'Rafi Rahman',
      })
      expect((await me().expect(401)).body.error).toBe('NOT_SIGNED_IN')
    })

    it('a forged or edited access token is refused', async () => {
      await register().expect(201)
      await me('nw_access=access-forged-token').expect(401)
    })

    it('an expired access token is renewed with the refresh token — new cookies, still signed in', async () => {
      const first = await register().expect(201)
      fake.expireAccessTokens()
      const res = await me(cookieHeader(first)).expect(200)
      const renewed = cookies(res)
      expect(renewed.nw_access!.value).not.toBe(cookies(first).nw_access!.value)
      expect(renewed.nw_refresh!.value).not.toBe(cookies(first).nw_refresh!.value)
      // The OLD refresh token was used up (rotation): replaying it fails…
      fake.expireAccessTokens()
      await me(cookieHeader(first)).expect(401)
      // …while the new session works.
      await me(cookieHeader(res)).expect(200)
    })

    it('a dead session clears its cookies', async () => {
      const res = await me('nw_access=x; nw_refresh=y').expect(401)
      expect(cookies(res).nw_access!.attrs).toEqual(
        expect.arrayContaining(['expires=thu, 01 jan 1970 00:00:00 gmt']),
      )
    })

    it('a user banned AFTER signing in is refused on the next request', async () => {
      const cookie = cookieHeader(await register().expect(201))
      await db.user.update({ where: { email: 'rafi@example.com' }, data: { status: 'BANNED' } })
      await me(cookie).expect(403)
    })
  })

  describe('logout', () => {
    it('clears the cookies and ends the session at Supabase (its refresh token stops working)', async () => {
      const signedIn = await register().expect(201)
      const res = await http()
        .post('/api/v1/auth/logout')
        .set('Cookie', cookieHeader(signedIn))
        .expect(200)
      expect(cookies(res).nw_refresh!.value).toBe('')
      fake.expireAccessTokens()
      await me(cookieHeader(signedIn)).expect(401) // even someone who kept the old cookies
    })
  })

  describe('forgot / reset password', () => {
    const forgot = (email: string) => http().post('/api/v1/auth/forgot-password').send({ email })

    it('the same answer whether or not the email has an account', async () => {
      await register().expect(201)
      const known = await forgot('rafi@example.com').expect(200)
      const unknown = await forgot('nobody@example.com').expect(200)
      expect(known.body).toEqual(unknown.body)
      expect(fake.resetEmails).toEqual([
        {
          email: 'rafi@example.com',
          redirectTo: 'https://nowoll.test/reset-password',
          tokenHash: expect.any(String),
        },
      ])
    })

    it('the link sets a new password and signs in; the old password stops working; the link works once', async () => {
      await register().expect(201)
      await forgot('rafi@example.com').expect(200)
      const { tokenHash } = fake.resetEmails[0]!
      const res = await http()
        .post('/api/v1/auth/reset-password')
        .send({ tokenHash, password: 'brand new password' })
        .expect(200)
      expect(cookies(res).nw_access!.value).toBeTruthy()
      await login('rafi@example.com', newCustomer.password).expect(401)

      const again = await http()
        .post('/api/v1/auth/reset-password')
        .send({ tokenHash, password: 'another password' })
        .expect(400)
      expect(again.body.error).toBe('RESET_LINK_INVALID')
    })
  })

  describe('placing an order while signed in', () => {
    async function orderBody() {
      await seedShippingZones()
      const c = await makeCategory()
      const p = await makeProduct({
        categoryId: c.id,
        basePrice: '1490',
        variants: [{ size: 'M', color: 'Blue', stock: 5 }],
      })
      return {
        items: [{ variantId: p.variants[0]!.id, quantity: 1 }],
        contact: { fullName: 'Rafi Rahman', email: 'rafi@example.com', phone: '01712345678' },
        address: { division: 'Dhaka', district: 'Dhaka', addressLine1: 'House 12, Road 5' },
        paymentMethod: 'COD',
        expectedTotal: '1550',
      }
    }
    const place = (body: object, cookie?: string) => {
      const req = http().post('/api/v1/orders').set('Idempotency-Key', randomUUID())
      return (cookie ? req.set('Cookie', cookie) : req).send(body)
    }

    it('the order is linked to the account', async () => {
      const signedIn = await register().expect(201)
      await place(await orderBody(), cookieHeader(signedIn)).expect(201)
      expect((await db.order.findFirstOrThrow()).userId).toBe(signedIn.body.data.user.id)
    })

    it('guests still check out exactly as before (and a broken session just counts as a guest)', async () => {
      const body = await orderBody()
      await place(body).expect(201)
      await place(body, 'nw_access=garbage').expect(201)
      expect((await db.order.findMany()).map((o) => o.userId)).toEqual([null, null])
    })
  })
})
