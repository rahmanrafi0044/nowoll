import { describe, expect, it, vi } from 'vitest'
import type { HttpFetch } from './resend.js'
import { ResendContacts } from './resend-contacts.js'

const SEG = '78261eea-8f8b-4381-83c6-79fa7120f1cf'
const KEY = 're_secret_key'

/** A fake Resend: answers in order; records every call. */
function fakeResend(...answers: { status: number; body?: object }[]) {
  const calls: { url: string; method: string; body: unknown; auth: string }[] = []
  const http = vi.fn<HttpFetch>(async (url, init) => {
    calls.push({
      url,
      method: init.method,
      body: init.body ? JSON.parse(init.body) : null,
      auth: init.headers.Authorization!,
    })
    const a = answers.shift() ?? { status: 200, body: {} }
    return { status: a.status, text: async () => JSON.stringify(a.body ?? {}) }
  })
  return { http, calls }
}

describe('Resend contacts (step 42)', () => {
  it('subscribe, already a contact: update, then put in the segment', async () => {
    const f = fakeResend({ status: 200 }, { status: 200 })
    expect(await new ResendContacts(KEY, f.http).subscribe('a+b@example.com', SEG)).toEqual({
      ok: true,
    })
    expect(f.calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ['PATCH', 'https://api.resend.com/contacts/a%2Bb%40example.com', { unsubscribed: false }],
      ['POST', `https://api.resend.com/contacts/a%2Bb%40example.com/segments/${SEG}`, null],
    ])
    expect(f.calls[0]!.auth).toBe(`Bearer ${KEY}`)
  })

  it('subscribe, new: the update says 404 → create in the segment (only then)', async () => {
    const f = fakeResend({ status: 404, body: { name: 'not_found' } }, { status: 200 })
    expect(await new ResendContacts(KEY, f.http).subscribe('new@example.com', SEG)).toEqual({
      ok: true,
    })
    expect(f.calls[1]).toMatchObject({
      method: 'POST',
      url: 'https://api.resend.com/contacts',
      body: { email: 'new@example.com', unsubscribed: false, segments: [{ id: SEG }] },
    })
    expect(f.calls).toHaveLength(2)
  })

  it('the update refused for another reason → NO create (only a 404 means "not there")', async () => {
    const f = fakeResend({ status: 422, body: { name: 'invalid_parameter', message: 'bad email' } })
    expect(await new ResendContacts(KEY, f.http).subscribe('x@example.com', SEG)).toMatchObject({
      ok: false,
      message: 'Resend 422: invalid_parameter bad email',
    })
    expect(f.calls).toHaveLength(1)
  })

  it('unsubscribe and delete: not in Resend (404) is fine', async () => {
    const f = fakeResend({ status: 404 }, { status: 404 })
    const c = new ResendContacts(KEY, f.http)
    expect(await c.unsubscribe('x@example.com')).toEqual({ ok: true, note: 'not in Resend' })
    expect(await c.remove('x@example.com')).toEqual({ ok: true, note: 'not in Resend' })
    expect(f.calls.map((x) => [x.method, x.body])).toEqual([
      ['PATCH', { unsubscribed: true }],
      ['DELETE', null],
    ])
  })

  it('a "sending access" key → a key problem, explained; the key never in the message', async () => {
    const f = fakeResend({
      status: 401,
      body: {
        name: 'restricted_api_key',
        message: 'This API key is restricted to only send emails',
      },
    })
    const r = await new ResendContacts(KEY, f.http).unsubscribe('x@example.com')
    expect(r).toMatchObject({
      ok: false,
      keyProblem: true,
      retry: false,
      message: expect.stringMatching(/Full access/),
    })
    expect(JSON.stringify(r)).not.toContain(KEY)
  })

  it('temporary trouble (429, 5xx, no answer) → retry; anything else → reported, not retried', async () => {
    const busy = fakeResend({ status: 429, body: { name: 'rate_limit_exceeded' } })
    expect(await new ResendContacts(KEY, busy.http).unsubscribe('x@example.com')).toMatchObject({
      retry: true,
    })
    const down = vi.fn<HttpFetch>(async () => {
      throw new Error('ECONNRESET')
    })
    expect(await new ResendContacts(KEY, down).unsubscribe('x@example.com')).toMatchObject({
      retry: true,
      message: 'Resend did not respond',
    })
    const odd = fakeResend(
      { status: 200 },
      { status: 422, body: { name: 'invalid_parameter', message: 'segment_id must be a UUID' } },
    )
    expect(await new ResendContacts(KEY, odd.http).subscribe('x@example.com', SEG)).toEqual({
      ok: false,
      retry: false,
      keyProblem: false,
      message: 'Resend 422: invalid_parameter segment_id must be a UUID',
    })
  })
})
