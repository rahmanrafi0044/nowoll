// Signs a staff member in to the ADMIN panel through the real routes —
// password, then the authenticator-app code (FAKE Supabase behind it) — and
// returns their admin cookies, ready for .set('Cookie', …).
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'
import { AUTH_PROVIDER } from '../../src/auth/auth-provider.js'
import type { FakeAuthProvider } from './fake-auth-provider.js'
import { testPrisma } from './test-db.js'

export const STAFF_PASSWORD = 'staff-password-1'

/** Each call looks like a different visitor, so the 5/min limit isn't shared between helpers. */
export const visitor = () => {
  const n = () => Math.floor(Math.random() * 250) + 1
  return `10.${n()}.${n()}.${n()}`
}

/** The "name=value; name=value" Cookie header from a response's Set-Cookie. */
export const cookiesFrom = (res: request.Response): string =>
  ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .map((c) => c.split(';')[0]!)
    .filter((c) => !c.endsWith('=')) // a cleared cookie
    .join('; ')

/** A Supabase account + users row with this role (what `pnpm admin:grant` sets up). */
export async function staffAccount(
  app: NestExpressApplication,
  email: string,
  role: 'ADMIN' | 'STAFF' | 'CUSTOMER' = 'ADMIN',
) {
  const account = app.get<FakeAuthProvider>(AUTH_PROVIDER).addAccount(email, STAFF_PASSWORD, 'Rafi')
  await testPrisma().user.create({ data: { id: account.id, email, fullName: 'Rafi', role } })
  return account
}

/** Password + 2FA code (setting up the app the first time). Returns the full (aal2) admin cookies. */
export async function signInAsStaff(
  app: NestExpressApplication,
  email: string,
  role: 'ADMIN' | 'STAFF' = 'ADMIN',
): Promise<{ cookie: string; userId: string }> {
  const fake = app.get<FakeAuthProvider>(AUTH_PROVIDER)
  const account = fake.accounts.get(email) ?? (await staffAccount(app, email, role))
  const http = () => request(app.getHttpServer())
  const ip = visitor()
  const login = await http()
    .post('/api/v1/admin/auth/login')
    .set('X-Forwarded-For', ip)
    .send({ email, password: STAFF_PASSWORD })
    .expect(200)
  const pending = cookiesFrom(login)
  if (login.body.data.next === 'enroll')
    await http()
      .post('/api/v1/admin/auth/2fa/enroll')
      .set('X-Forwarded-For', ip)
      .set('Cookie', pending)
      .expect(200)
  const verified = await http()
    .post('/api/v1/admin/auth/2fa/verify')
    .set('X-Forwarded-For', ip)
    .set('Cookie', pending)
    .send({ code: fake.codeOnPhone(account.id) })
    .expect(200)
  return { cookie: cookiesFrom(verified), userId: account.id }
}
