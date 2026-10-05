import { beforeEach, describe, expect, it } from 'vitest'
import type { HttpClient } from './http.js'
import { isSslCommerzConfigured, SslCommerzAdapter } from './sslcommerz.adapter.js'
import type { CreatePaymentParams } from './types.js'

// A fake SSLCommerz: records each request and replies with whatever the test sets.
// Response shapes follow the official v4 documentation.
type Call = { method: string; url: URL; form: URLSearchParams | null }
let calls: Call[] = []
let reply: (call: Call) => { status?: number; body: unknown } | 'NETWORK_ERROR' = () => ({
  body: {},
})
const fakeHttp: HttpClient = async (url, init) => {
  const call = {
    method: init.method,
    url: new URL(url),
    form: init.body ? new URLSearchParams(init.body) : null,
  }
  calls.push(call)
  const r = reply(call)
  if (r === 'NETWORK_ERROR') throw new Error('ECONNRESET')
  return {
    status: r.status ?? 200,
    text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)),
  }
}

const SECRET = 'very-secret-pass'
const config = { storeId: 'nowoll_test', storePassword: SECRET, isLive: false }
const adapter = () => new SslCommerzAdapter(config, fakeHttp)

const params: CreatePaymentParams = {
  transactionId: 'NW10001-7F3A9C',
  amount: '1550',
  customer: {
    name: 'Rafi Rahman',
    email: 'rafi@example.com',
    phone: '+8801712345678',
    address: 'House 12, Road 5',
    city: 'Dhaka',
    postcode: null,
  },
  shipping: { name: 'Rafi Rahman', address: 'House 12, Road 5', city: 'Dhaka', postcode: '1205' },
  productNames: ['Oxford Shirt', 'Linen Panjabi'],
  itemCount: 2,
  urls: {
    success: 'https://api.nowoll.com/api/v1/payment/sslcommerz/success',
    fail: 'https://api.nowoll.com/api/v1/payment/sslcommerz/fail',
    cancel: 'https://api.nowoll.com/api/v1/payment/sslcommerz/cancel',
    ipn: 'https://api.nowoll.com/api/v1/payment/sslcommerz/ipn',
  },
}

beforeEach(() => {
  calls = []
  reply = () => ({ body: {} })
})

describe('isSslCommerzConfigured', () => {
  it('treats .env.example placeholders as not configured', () => {
    expect(
      isSslCommerzConfigured({ storeId: 'your_store_id', storePassword: 'your_store_password' }),
    ).toBe(false)
    expect(isSslCommerzConfigured({ storeId: '', storePassword: 'x' })).toBe(false)
    expect(isSslCommerzConfigured(config)).toBe(true)
  })
})

describe('createPayment', () => {
  it('POSTs a form to the SANDBOX session API with the official field names', async () => {
    reply = () => ({
      body: {
        status: 'SUCCESS',
        sessionkey: 'ABC123',
        GatewayPageURL: 'https://sandbox.sslcommerz.com/EasyCheckOut/testcde',
      },
    })
    const result = await adapter().createPayment(params)
    expect(result).toEqual({
      ok: true,
      redirectUrl: 'https://sandbox.sslcommerz.com/EasyCheckOut/testcde',
      sessionKey: 'ABC123',
    })

    const call = calls[0]!
    expect(call.method).toBe('POST')
    expect(call.url.href).toBe('https://sandbox.sslcommerz.com/gwprocess/v4/api.php')
    expect(Object.fromEntries(call.form!)).toMatchObject({
      store_id: 'nowoll_test',
      total_amount: '1550.00',
      currency: 'BDT',
      tran_id: params.transactionId,
      ipn_url: params.urls.ipn,
      cus_name: 'Rafi Rahman',
      cus_postcode: '0000', // none given → placeholder (decision #4, TODO confirm with SSLCommerz)
      cus_country: 'Bangladesh',
      shipping_method: 'YES',
      num_of_item: '2',
      ship_postcode: '1205',
      product_name: 'Oxford Shirt, Linen Panjabi',
      product_category: 'clothing',
      product_profile: 'physical-goods',
    })
  })

  it('uses the LIVE host only when isLive is true', async () => {
    reply = () => ({
      body: { status: 'SUCCESS', GatewayPageURL: 'https://securepay.sslcommerz.com/x' },
    })
    await new SslCommerzAdapter({ ...config, isLive: true }, fakeHttp).createPayment(params)
    expect(calls[0]!.url.origin).toBe('https://securepay.sslcommerz.com')
  })

  it('refuses a tran_id longer than 30 characters (e.g. a raw UUID) instead of letting it be cut short', async () => {
    await expect(
      adapter().createPayment({ ...params, transactionId: '3f2a7c1e-0000-4000-8000-000000000001' }),
    ).rejects.toThrow(/at most|1–30/)
    await expect(
      adapter().createPayment({ ...params, transactionId: 'NW 10001' }),
    ).rejects.toThrow()
    expect(calls).toHaveLength(0)
  })

  it('trims fields to the SSLCommerz length limits', async () => {
    reply = () => ({ body: { status: 'SUCCESS', GatewayPageURL: 'https://x' } })
    await adapter().createPayment({
      ...params,
      customer: { ...params.customer, name: 'N'.repeat(80) },
    })
    expect(calls[0]!.form!.get('cus_name')).toHaveLength(50)
  })

  it.each([['9.99'], ['500000.01']])(
    'refuses %s without contacting SSLCommerz (decision #3)',
    async (amount) => {
      expect(await adapter().createPayment({ ...params, amount })).toMatchObject({
        ok: false,
        reason: 'AMOUNT_OUT_OF_RANGE',
      })
      expect(calls).toHaveLength(0)
    },
  )

  it('says "not set up" when credentials are placeholders (decision #7)', async () => {
    const a = new SslCommerzAdapter(
      { storeId: 'your_store_id', storePassword: 'your_store_password', isLive: false },
      fakeHttp,
    )
    expect(await a.createPayment(params)).toMatchObject({ ok: false, reason: 'NOT_CONFIGURED' })
    expect(calls).toHaveLength(0)
  })

  it("passes on SSLCommerz's refusal reason", async () => {
    reply = () => ({
      body: { status: 'FAILED', failedreason: 'Store Credential Error Or Store is De-active' },
    })
    expect(await adapter().createPayment(params)).toEqual({
      ok: false,
      reason: 'GATEWAY_REFUSED',
      message: 'Store Credential Error Or Store is De-active',
    })
  })

  it.each([
    ['a network error', () => 'NETWORK_ERROR' as const],
    ['a 502 from the gateway', () => ({ status: 502, body: 'Bad gateway' })],
    ['a non-JSON answer', () => ({ body: '<html>maintenance</html>' })],
  ])('reports UNREACHABLE on %s — without leaking the password', async (_label, r) => {
    reply = r
    const result = await adapter().createPayment(params)
    expect(result).toMatchObject({ ok: false, reason: 'UNREACHABLE' })
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })
})

describe('verifyPayment — the security check', () => {
  const expected = { transactionId: params.transactionId, amount: '1550', currency: 'BDT' as const }
  const valid = {
    status: 'VALID',
    tran_id: params.transactionId,
    val_id: 'VAL123',
    amount: '1550.00',
    currency: 'BDT',
    currency_type: 'BDT',
    bank_tran_id: 'BANK1',
    card_type: 'BKASH-BKash',
    risk_level: '0',
  }

  it('GETs the validation API with val_id and store credentials', async () => {
    reply = () => ({ body: valid })
    await adapter().verifyPayment({ valId: 'VAL123', expected })
    const call = calls[0]!
    expect(call.method).toBe('GET')
    expect(call.url.origin + call.url.pathname).toBe(
      'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php',
    )
    expect(Object.fromEntries(call.url.searchParams)).toMatchObject({
      val_id: 'VAL123',
      store_id: 'nowoll_test',
      format: 'json',
    })
  })

  it('VALID with matching transaction, amount and currency → PAID', async () => {
    reply = () => ({ body: valid })
    expect(await adapter().verifyPayment({ valId: 'VAL123', expected })).toMatchObject({
      outcome: 'PAID',
      details: {
        valId: 'VAL123',
        bankTransactionId: 'BANK1',
        cardType: 'BKASH-BKash',
        amount: '1550.00',
      },
    })
  })

  it('VALIDATED (already checked once, e.g. by the redirect) also means PAID (decision #1)', async () => {
    reply = () => ({ body: { ...valid, status: 'VALIDATED' } })
    expect((await adapter().verifyPayment({ valId: 'VAL123', expected })).outcome).toBe('PAID')
  })

  it.each([
    ['an invalid val_id', { status: 'INVALID_TRANSACTION' }],
    ['a different transaction', { tran_id: 'someone-elses-order' }],
    ['an amount one poisha short', { amount: '1549.99' }],
    ['another currency', { currency: 'USD', currency_type: 'USD' }],
  ])('rejects %s → NOT_PAID', async (_label, change) => {
    reply = () => ({ body: { ...valid, ...change } })
    expect((await adapter().verifyPayment({ valId: 'VAL123', expected })).outcome).toBe('NOT_PAID')
  })

  it('a payment flagged risky (risk_level 1) needs a human → REVIEW (decision #2)', async () => {
    reply = () => ({
      body: { ...valid, risk_level: '1', risk_title: 'Card used from a new country' },
    })
    expect(await adapter().verifyPayment({ valId: 'VAL123', expected })).toMatchObject({
      outcome: 'REVIEW',
      reason: expect.stringContaining('Card used from a new country'),
    })
  })

  it('validation API down → UNREACHABLE (never guessed as paid or unpaid)', async () => {
    reply = () => 'NETWORK_ERROR'
    const result = await adapter().verifyPayment({ valId: 'VAL123', expected })
    expect(result.outcome).toBe('UNREACHABLE')
    expect(JSON.stringify(result)).not.toContain(SECRET)
  })
})

describe('refundPayment', () => {
  const refund = {
    bankTransactionId: 'BANK1',
    refundTransactionId: 'RF-1',
    amount: '500',
    remarks: 'Return of order NW-10001',
  }

  it('sends the official refund parameters', async () => {
    reply = () => ({ body: { APIConnect: 'DONE', status: 'success', refund_ref_id: 'REF9' } })
    expect(await adapter().refundPayment(refund)).toMatchObject({
      ok: true,
      status: 'refunded',
      refundRefId: 'REF9',
    })
    expect(Object.fromEntries(calls[0]!.url.searchParams)).toMatchObject({
      bank_tran_id: 'BANK1',
      refund_trans_id: 'RF-1',
      refund_amount: '500.00',
      refund_remarks: 'Return of order NW-10001',
    })
  })

  it.each([
    [
      { APIConnect: 'DONE', status: 'processing', refund_ref_id: 'REF9' },
      { ok: true, status: 'processing' },
    ],
    [{ APIConnect: 'DONE', status: 'failed', errorReason: 'Already refunded' }, { ok: false }],
    [{ APIConnect: 'INVALID_REQUEST' }, { ok: false }], // e.g. our IP isn't registered with SSLCommerz
  ])('maps %j', async (body, expectedResult) => {
    reply = () => ({ body })
    expect(await adapter().refundPayment(refund)).toMatchObject(expectedResult)
  })
})

describe('getStatus', () => {
  it.each([
    [{ no_of_trans_found: 1, element: [{ status: 'VALID' }] }, 'PAID'],
    [{ no_of_trans_found: 1, element: [{ status: 'PENDING' }] }, 'PENDING'],
    [{ no_of_trans_found: 2, element: [{ status: 'FAILED' }, { status: 'FAILED' }] }, 'FAILED'],
    [{ no_of_trans_found: 0 }, 'NOT_FOUND'],
  ])('maps %j → %s', async (body, state) => {
    reply = () => ({ body })
    expect((await adapter().getStatus('t1')).state).toBe(state)
  })
})
