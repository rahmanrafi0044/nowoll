import { describe, expect, it, vi } from 'vitest'
import {
  type BrowserDetails,
  buildServerEvent,
  type CustomerDetails,
  FBC_PATTERN,
  FBP_PATTERN,
  type FetchLike,
  metaUserData,
  normalizePhone,
  readMetaAnswer,
  sendToMeta,
  sha256,
  splitName,
} from './meta-capi.js'

// Reference hashes worked out separately (Python hashlib), not by this code.
const H = {
  email: '973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b', // test@example.com
  phone: 'c327520f85b0c6058fed05dfc0a63d8755f325b6ea1b550824f4a8e380d75de1', // 8801712345678
  rahim: 'f691ebb4628c366e48cfad9d7d3a4ed275f1dc5b47949732f993f4e52454cc3b',
  ahmed: '9af2921d3fd57fe886c9022d1fcc055d53a79e4032fa6137e397583884e1a5de',
  dhaka: 'de90643718108ec9a93cc6905f2b976297505a8abeac37b747132877fb32fb8d',
  zip: 'eaf2067e34d6876930d2b304db688ab6b9d5064b7e682f7831297d39fbe01c92', // 1207
  bd: '5e657ff6158d3e2a6d23e2a523917a2305acee9423365e268695c4b7b8919f4c',
}

const customer: CustomerDetails = {
  email: '  Test@Example.com ',
  phone: '+8801712345678',
  fullName: ' Rahim Uddin  Ahmed ',
  city: 'Dhaka',
  postalCode: '1207',
}
const browser: BrowserDetails = {
  clientIp: '103.4.145.2',
  userAgent: 'Mozilla/5.0 (Linux; Android 14)',
  fbp: 'fb.1.1760000000000.1234567890',
  fbc: 'fb.1.1760000000000.IwAR2xyz_ABC-def',
  sourceUrl: 'https://nowoll.com/checkout',
}

describe('customer details for Meta (hashed as Meta asks)', () => {
  it('normalises, then SHA-256 (lowercase hex)', () => {
    expect(sha256('bd')).toBe(H.bd)
    expect(normalizePhone('+8801712345678')).toBe('8801712345678')
    expect(normalizePhone('01712-345678')).toBe('8801712345678')
    expect(splitName(' Rahim Uddin  Ahmed ')).toEqual({ fn: 'rahim', ln: 'ahmed' })
    expect(splitName('Md. Abdul-Karim')).toEqual({ fn: 'md', ln: 'abdulkarim' }) // no punctuation
    expect(splitName('Rahim')).toEqual({ fn: 'rahim', ln: '' })
    expect(splitName('রহিম আহমেদ').fn).toBe('রহিম') // Bangla letters kept
  })

  it('hashes email, phone, names, city, postcode, country, external id — browser details as-is', () => {
    expect(metaUserData(customer, browser)).toEqual({
      em: [H.email],
      ph: [H.phone],
      fn: [H.rahim],
      ln: [H.ahmed],
      ct: [H.dhaka],
      zp: [H.zip],
      country: [H.bd],
      external_id: [H.email],
      client_ip_address: '103.4.145.2',
      client_user_agent: 'Mozilla/5.0 (Linux; Android 14)',
      fbp: 'fb.1.1760000000000.1234567890',
      fbc: 'fb.1.1760000000000.IwAR2xyz_ABC-def',
    })
  })

  it('nothing in clear text ever leaves (no email, phone or name in the event)', () => {
    const json = JSON.stringify(metaUserData(customer, browser))
    for (const secret of ['example.com', '1712345678', 'rahim', 'Rahim', 'Dhaka', '1207'])
      expect(json).not.toContain(secret)
  })

  it('missing optional details are left out, not sent empty', () => {
    const u = metaUserData(
      { ...customer, fullName: 'Rahim', postalCode: null, phone: '' },
      { ...browser, fbp: null, fbc: null },
    )
    expect(u).not.toHaveProperty('ph') // never the hash of an empty string
    const noEmail = metaUserData({ ...customer, email: ' ' }, browser)
    expect(noEmail).not.toHaveProperty('em')
    expect(noEmail).not.toHaveProperty('external_id')
    expect(u).not.toHaveProperty('ln')
    expect(u).not.toHaveProperty('zp')
    expect(u).not.toHaveProperty('fbp')
    expect(u).not.toHaveProperty('fbc')
  })
})

describe('server events', () => {
  const order = {
    orderNumber: 'NW-10001',
    total: 3060,
    items: [
      { productId: 'p1', sku: 'NW-OXF-M', name: 'Oxford', variant: 'M', price: 1490, quantity: 2 },
    ],
  }

  it('Purchase: same event ID as the browser Pixel (Meta keeps one), unix seconds, website', () => {
    const e = buildServerEvent({
      kind: 'purchase',
      order,
      customer,
      browser,
      at: new Date('2026-10-12T10:00:00.900Z'),
    })
    expect(e).toMatchObject({
      event_name: 'Purchase',
      event_id: 'purchase-NW-10001',
      event_time: 1791799200,
      action_source: 'website',
      event_source_url: 'https://nowoll.com/checkout',
      custom_data: {
        value: 3060,
        currency: 'BDT',
        content_ids: ['NW-OXF-M'],
        content_type: 'product',
        contents: [{ id: 'NW-OXF-M', quantity: 2, item_price: 1490 }],
        num_items: 2,
        order_id: 'NW-10001',
      },
    })
  })

  it('OrderDelivered: its own event ID', () => {
    const e = buildServerEvent({ kind: 'delivered', order, customer, browser, at: new Date() })
    expect(e.event_name).toBe('OrderDelivered')
    expect(e.event_id).toBe('delivered-NW-10001')
  })
})

describe("Meta's answer (docs/integrations/meta.md → Answers)", () => {
  it('2xx → received count, warnings, trace id', () => {
    expect(readMetaAnswer(200, { events_received: 1, messages: [], fbtrace_id: 'Abc' })).toEqual({
      ok: true,
      eventsReceived: 1,
      messages: [],
      fbtraceId: 'Abc',
    })
  })

  it('temporary problems are retried; a wrong event or an expired token are not', () => {
    const err = (code: number, status = 400) =>
      readMetaAnswer(status, { error: { message: 'x', code, fbtrace_id: 'T' } })
    for (const code of [1, 2, 4, 17, 341, 368]) expect(err(code)).toMatchObject({ retry: true })
    expect(readMetaAnswer(503, null)).toMatchObject({ ok: false, retry: true })
    expect(readMetaAnswer(429, {})).toMatchObject({ retry: true })
    expect(err(100)).toMatchObject({ retry: false, tokenProblem: false, fbtraceId: 'T' })
    expect(err(190, 401)).toMatchObject({ retry: false, tokenProblem: true })
  })

  it("prefers Meta's message for people, and names the code", () => {
    expect(
      readMetaAnswer(400, {
        error: { message: 'Invalid parameter', error_user_msg: 'event_time is too old', code: 100 },
      }),
    ).toMatchObject({ message: 'event_time is too old (code 100)' })
  })
})

describe('sending', () => {
  const event = buildServerEvent({
    kind: 'purchase',
    order: { orderNumber: 'NW-1', total: 100, items: [] },
    customer,
    browser,
    at: new Date(),
  })

  it('POSTs {data, test_event_code} to the versioned endpoint with the token as access_token', async () => {
    const fetch = vi.fn<FetchLike>(async () => ({
      status: 200,
      json: async () => ({ events_received: 1, messages: [], fbtrace_id: 'F' }),
    }))
    const r = await sendToMeta({
      pixelId: '123456789012',
      accessToken: 'tok&en',
      events: [event],
      testEventCode: 'TEST123',
      fetch,
    })
    expect(r).toMatchObject({ ok: true, eventsReceived: 1 })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://graph.facebook.com/v25.0/123456789012/events?access_token=tok%26en')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ data: [event], test_event_code: 'TEST123' })
  })

  it('no test code → none sent (real orders never carry one)', async () => {
    const fetch = vi.fn<FetchLike>(async () => ({ status: 200, json: async () => ({}) }))
    await sendToMeta({ pixelId: '1', accessToken: 't', events: [event], fetch })
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).not.toHaveProperty('test_event_code')
  })

  it('network failure → "retry", and the token never appears in the message', async () => {
    const fetch = vi.fn<FetchLike>(async () => {
      throw new TypeError('fetch failed for https://graph.facebook.com/...access_token=SECRET')
    })
    const r = await sendToMeta({ pixelId: '1', accessToken: 'SECRET', events: [event], fetch })
    expect(r).toMatchObject({ ok: false, retry: true })
    expect(JSON.stringify(r)).not.toContain('SECRET')
  })

  it('a non-JSON error page is judged by its status', async () => {
    const fetch = vi.fn<FetchLike>(async () => ({
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token <')
      },
    }))
    expect(
      await sendToMeta({ pixelId: '1', accessToken: 't', events: [event], fetch }),
    ).toMatchObject({ ok: false, retry: true })
  })
})

describe('cookie formats accepted from the browser', () => {
  it('_fbp and _fbc as Meta writes them; anything else refused', () => {
    expect(FBP_PATTERN.test('fb.1.1760000000000.1234567890')).toBe(true)
    expect(FBC_PATTERN.test('fb.1.1760000000000.IwAR2xyz_ABC-def')).toBe(true)
    expect(FBP_PATTERN.test('fb.1.1760000000000.abc')).toBe(false)
    expect(FBC_PATTERN.test('fb.1.1760000000000.<script>')).toBe(false)
    expect(FBC_PATTERN.test('x'.repeat(30))).toBe(false)
  })
})
