import { randomUUID } from 'node:crypto'
import { emailSenderFromEnv, isResendConfigured } from './senders/from-env.js'
import { type HttpFetch, ResendEmailSender } from './senders/resend.js'
import { SmtpEmailSender } from './senders/smtp.js'

const KEY = 're_secret_test_key_123'
const email = {
  to: 'rafi@example.com',
  subject: 'Order NW-10001 — thank you!',
  html: '<p>Hi</p>',
  text: 'Hi',
  replyTo: 'help@nowoll.com',
  tag: 'order-confirmation',
  idempotencyKey: 'order-confirmation:NW-10001',
}

describe('ResendEmailSender (official API, fake server)', () => {
  let calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[]
  let answer: { status: number; body: unknown } | 'NETWORK_ERROR'
  const http: HttpFetch = async (url, init) => {
    calls.push({
      url,
      headers: init.headers,
      body: JSON.parse(init.body) as Record<string, unknown>,
    })
    if (answer === 'NETWORK_ERROR') throw new Error('ECONNRESET')
    const { status, body } = answer
    return { status, text: async () => JSON.stringify(body) }
  }
  const sender = () => new ResendEmailSender(KEY, 'Nowoll <orders@mail.nowoll.com>', http)

  beforeEach(() => {
    calls = []
    answer = { status: 200, body: { id: 'em_123' } }
  })

  it('POSTs the documented fields with the Bearer key and Idempotency-Key', async () => {
    expect(await sender().send(email)).toEqual({ ok: true, id: 'em_123' })
    expect(calls[0]).toEqual({
      url: 'https://api.resend.com/emails',
      headers: {
        Authorization: `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'order-confirmation:NW-10001',
      },
      body: {
        from: 'Nowoll <orders@mail.nowoll.com>',
        to: ['rafi@example.com'],
        subject: 'Order NW-10001 — thank you!',
        html: '<p>Hi</p>',
        text: 'Hi',
        reply_to: 'help@nowoll.com',
        tags: [{ name: 'type', value: 'order-confirmation' }],
      },
    })
  })

  it.each([
    [{ status: 429, body: { name: 'rate_limit_exceeded', message: 'Too many requests' } }, true],
    [{ status: 500, body: { message: 'Internal' } }, true],
    [{ status: 422, body: { name: 'validation_error', message: 'Invalid `to` field' } }, false],
    [{ status: 403, body: { name: 'invalid_api_key' } }, false],
  ])('%j → retryable: %s, and the key never appears in the reason', async (reply, retryable) => {
    answer = reply
    const result = await sender().send(email)
    expect(result).toMatchObject({ ok: false, retryable })
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  it('no answer at all → retryable', async () => {
    answer = 'NETWORK_ERROR'
    expect(await sender().send(email)).toEqual({
      ok: false,
      reason: 'Resend did not respond',
      retryable: true,
    })
  })
})

describe('emailSenderFromEnv — real customers are never emailed by accident', () => {
  it('development → Mailpit, even with a real Resend key in .env', () => {
    expect(emailSenderFromEnv({ NODE_ENV: 'development', RESEND_API_KEY: KEY }).name).toBe('smtp')
  })

  it('production → Resend, and refuses to start without a real key', () => {
    expect(
      emailSenderFromEnv({
        NODE_ENV: 'production',
        RESEND_API_KEY: KEY,
        EMAIL_FROM: 'Nowoll <a@b.c>',
      }).name,
    ).toBe('resend')
    expect(() =>
      emailSenderFromEnv({ NODE_ENV: 'production', RESEND_API_KEY: 're_your_api_key' }),
    ).toThrow(/RESEND_API_KEY/)
    expect(() => emailSenderFromEnv({ NODE_ENV: 'production' })).toThrow(/RESEND_API_KEY/)
  })

  it('EMAIL_USE_RESEND=true lets a developer test real sending on purpose', () => {
    expect(
      emailSenderFromEnv({ NODE_ENV: 'development', RESEND_API_KEY: KEY, EMAIL_USE_RESEND: 'true' })
        .name,
    ).toBe('resend')
  })

  it('knows the .env.example placeholder is not a key', () => {
    expect(isResendConfigured('re_your_api_key')).toBe(false)
    expect(isResendConfigured('')).toBe(false)
    expect(isResendConfigured(KEY)).toBe(true)
  })
})

// A REAL delivery to Mailpit (docker compose up -d mailpit; CI runs it as a service).
describe('SmtpEmailSender → Mailpit', () => {
  const MAILPIT_API = `http://${process.env.SMTP_HOST || 'localhost'}:8025/api/v1`

  it('the email arrives in Mailpit with subject, HTML and text', async () => {
    const subject = `test ${randomUUID()}`
    const sender = new SmtpEmailSender(
      process.env.SMTP_HOST || 'localhost',
      Number(process.env.SMTP_PORT || 1025),
      'Nowoll <orders@nowoll.test>',
    )
    const result = await sender.send({ ...email, subject })
    expect(result.ok).toBe(true)

    const search = (await (
      await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`subject:"${subject}"`)}`)
    ).json()) as {
      messages: { ID: string }[]
    }
    expect(search.messages).toHaveLength(1)
    const message = (await (
      await fetch(`${MAILPIT_API}/message/${search.messages[0]!.ID}`)
    ).json()) as {
      HTML: string
      Text: string
      To: { Address: string }[]
      ReplyTo: { Address: string }[]
    }
    expect(message).toMatchObject({
      HTML: expect.stringContaining('<p>Hi</p>'),
      Text: expect.stringContaining('Hi'),
    })
    expect(message.To[0]!.Address).toBe('rafi@example.com')
    expect(message.ReplyTo[0]!.Address).toBe('help@nowoll.com')
  })
})
