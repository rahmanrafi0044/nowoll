import { localPhone, SteadfastCourier } from './steadfast.courier.js'
import type { ParcelBooking } from './courier.js'

// The real Steadfast adapter against a PRETEND network: every call is recorded,
// nothing reaches Steadfast. Shapes from docs/integrations/courier.md.
const parcel: ParcelBooking = {
  invoice: 'NW-10001',
  recipientName: 'Rafi <Rahman>',
  recipientPhone: '+8801712345678',
  recipientAddress: 'House 17/1; Road 3/A, Dhanmondi, Dhaka',
  codAmount: 1060,
  note: 'Call before 3 PM',
  itemDescription: 'Mehr Three-Piece (M / Ivory) × 2',
}
const keys = { apiKey: 'api-key-1', secretKey: 'secret-key-1' }

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = []
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  })
  return { fn: fn as unknown as typeof fetch, calls }
}

describe('SteadfastCourier', () => {
  it('ready only with BOTH keys', () => {
    expect(new SteadfastCourier({}).readiness()).toBe('no_keys')
    expect(new SteadfastCourier({ apiKey: 'k' }).readiness()).toBe('no_keys')
    expect(new SteadfastCourier(keys).readiness()).toBe('ready')
  })

  it('books: the documented request (keys in headers, their field names, local phone) → ids back', async () => {
    const net = fakeFetch(200, {
      status: 200,
      message: 'Consignment has been created successfully.',
      consignment: {
        consignment_id: 1424107,
        invoice: 'NW-10001',
        tracking_code: '15BAEB8A',
        status: 'in_review',
      },
    })
    const result = await new SteadfastCourier(keys, net.fn).book(parcel)
    expect(result).toEqual({
      ok: true,
      consignmentId: '1424107',
      trackingCode: '15BAEB8A',
      status: 'in_review',
    })
    const [call] = net.calls
    expect(call!.url).toBe('https://portal.packzy.com/api/v1/create_order')
    expect(call!.init.method).toBe('POST')
    expect(call!.init.headers).toMatchObject({
      'Api-Key': 'api-key-1',
      'Secret-Key': 'secret-key-1',
      'Content-Type': 'application/json',
    })
    expect(JSON.parse(String(call!.init.body))).toEqual({
      invoice: 'NW-10001',
      recipient_name: 'Rafi Rahman', // their stripped characters (<>) removed by us first
      recipient_phone: '01712345678',
      recipient_address: 'House 17/1 Road 3/A, Dhanmondi, Dhaka',
      cod_amount: 1060,
      note: 'Call before 3 PM',
      item_description: 'Mehr Three-Piece (M / Ivory) × 2',
    })
  })

  it('trims to their limits; leaves out an empty note', async () => {
    const net = fakeFetch(200, {
      status: 200,
      consignment: { consignment_id: 1, tracking_code: 'T', status: 'in_review' },
    })
    await new SteadfastCourier(keys, net.fn).book({
      ...parcel,
      recipientAddress: 'x'.repeat(600),
      note: '  ',
      itemDescription: 'y'.repeat(300),
    })
    const body = JSON.parse(String(net.calls[0]!.init.body))
    expect(body.recipient_address).toHaveLength(490)
    expect(body.item_description).toHaveLength(255)
    expect(body).not.toHaveProperty('note')
  })

  it('a rejected field → refused with the field named; nothing retried', async () => {
    const net = fakeFetch(422, { status: 400, errors: { recipient_phone: ['Invalid phone'] } })
    expect(await new SteadfastCourier(keys, net.fn).book(parcel)).toEqual({
      ok: false,
      retryable: false,
      reason: 'recipient_phone: Invalid phone',
    })
  })

  it('keys wrong / account inactive → refused, with what to check (never the keys)', async () => {
    const r401 = await new SteadfastCourier(keys, fakeFetch(401, {}).fn).book(parcel)
    expect(r401).toMatchObject({ ok: false, retryable: false })
    expect(r401.ok === false && r401.reason).toMatch(/API keys were not accepted/)
    expect(JSON.stringify(r401)).not.toContain('secret-key-1')
    const r403 = await new SteadfastCourier(keys, fakeFetch(403, {}).fn).book(parcel)
    expect(r403.ok === false && r403.reason).toMatch(/inactive|KYC/)
  })

  it('busy (429), their fault (500) or no answer → "try again later"', async () => {
    for (const status of [429, 500, 503])
      expect(await new SteadfastCourier(keys, fakeFetch(status, {}).fn).book(parcel)).toMatchObject(
        {
          ok: false,
          retryable: true,
        },
      )
    const offline = (async () => {
      throw new TypeError('fetch failed')
    }) as unknown as typeof fetch
    expect(await new SteadfastCourier(keys, offline).book(parcel)).toMatchObject({
      ok: false,
      retryable: true,
    })
  })

  it('a phone that is not a Bangladeshi mobile → refused before calling Steadfast', async () => {
    const net = fakeFetch(200, {})
    const r = await new SteadfastCourier(keys, net.fn).book({ ...parcel, recipientPhone: '12345' })
    expect(r).toMatchObject({ ok: false, retryable: false })
    expect(net.calls).toHaveLength(0)
  })

  it('localPhone: +880 / 880 / 01 forms → 01XXXXXXXXX', () => {
    expect(localPhone('+8801712345678')).toBe('01712345678')
    expect(localPhone('8801712345678')).toBe('01712345678')
    expect(localPhone('01712345678')).toBe('01712345678')
    expect(localPhone('0171234567')).toBeNull()
    expect(localPhone('+12025550123')).toBeNull()
  })
})
