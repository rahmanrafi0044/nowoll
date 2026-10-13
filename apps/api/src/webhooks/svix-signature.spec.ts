import { createHmac } from 'node:crypto'
import { verifySvixSignature } from './svix-signature.js'

// A signature made independently, exactly as Svix documents it.
const SECRET = `whsec_${Buffer.from('a-test-signing-key-32-bytes-long').toString('base64')}`
const NOW = new Date('2026-10-13T10:00:00Z')
const TS = String(NOW.getTime() / 1000)
const BODY = Buffer.from(
  '{"type":"contact.updated","data":{"email":"a@example.com","unsubscribed":true}}',
)
const sign = (id: string, ts: string, body: Buffer, secret = SECRET) =>
  `v1,${createHmac('sha256', Buffer.from(secret.slice(6), 'base64'))
    .update(`${id}.${ts}.${body.toString()}`)
    .digest('base64')}`

const check = (over: Partial<Parameters<typeof verifySvixSignature>[0]> = {}) =>
  verifySvixSignature({
    id: 'msg_1',
    timestamp: TS,
    signature: sign('msg_1', TS, BODY),
    rawBody: BODY,
    secret: SECRET,
    now: NOW,
    ...over,
  })

describe('Resend (Svix) webhook signature', () => {
  it('accepts a correct signature — also among several (key rotation)', () => {
    expect(check()).toBe(true)
    expect(check({ signature: `v1,AAAA ${sign('msg_1', TS, BODY)}` })).toBe(true)
  })

  it('refuses a changed body, another id, another secret, or missing headers', () => {
    expect(check({ rawBody: Buffer.from(BODY.toString().replace('true', 'false')) })).toBe(false)
    expect(check({ id: 'msg_2' })).toBe(false)
    const other = `whsec_${Buffer.from('another-key-another-key-another!').toString('base64')}`
    expect(check({ signature: sign('msg_1', TS, BODY, other) })).toBe(false)
    expect(check({ signature: undefined })).toBe(false)
    expect(check({ rawBody: undefined })).toBe(false)
    expect(check({ signature: 'v2,whatever' })).toBe(false)
  })

  it('refuses old or future timestamps (> 5 minutes): no replays', () => {
    const old = String(NOW.getTime() / 1000 - 301)
    expect(check({ timestamp: old, signature: sign('msg_1', old, BODY) })).toBe(false)
    const soon = String(NOW.getTime() / 1000 + 301)
    expect(check({ timestamp: soon, signature: sign('msg_1', soon, BODY) })).toBe(false)
    const ok = String(NOW.getTime() / 1000 - 299)
    expect(check({ timestamp: ok, signature: sign('msg_1', ok, BODY) })).toBe(true)
    expect(check({ timestamp: 'abc' })).toBe(false)
  })
})
