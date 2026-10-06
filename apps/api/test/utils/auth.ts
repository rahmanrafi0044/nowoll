// Signs a customer up through the real /auth/register route (FAKE Supabase
// behind it) and returns their login cookies, ready for .set('Cookie', …).
import type { NestExpressApplication } from '@nestjs/platform-express'
import request from 'supertest'

export async function signUp(
  app: NestExpressApplication,
  email: string,
  extra: { fullName?: string; phone?: string; password?: string } = {},
): Promise<{ cookie: string; userId: string }> {
  // Each sign-up comes from a different (pretend) visitor, so tests that need
  // many accounts don't hit the real 5-per-minute sign-up limit. (The API
  // trusts one proxy hop, so X-Forwarded-For decides the visitor's IP.)
  const n = () => Math.floor(Math.random() * 250) + 1
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .set('X-Forwarded-For', `10.${n()}.${n()}.${n()}`)
    .send({
      fullName: extra.fullName ?? 'Test Customer',
      email,
      password: extra.password ?? 'test-password-1',
      ...(extra.phone && { phone: extra.phone }),
    })
    .expect(201)
  const cookie = ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .map((c) => c.split(';')[0])
    .join('; ')
  return { cookie, userId: res.body.data.user.id }
}
