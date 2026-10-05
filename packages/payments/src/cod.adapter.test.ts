import { describe, expect, it } from 'vitest'
import { CodAdapter } from './cod.adapter.js'

describe('CodAdapter', () => {
  it('has nothing to pay now and nowhere to redirect', async () => {
    const result = await new CodAdapter().createPayment({} as never)
    expect(result).toEqual({ ok: true, redirectUrl: null, sessionKey: null })
  })

  it('never reports a COD payment as paid by itself (an admin confirms the cash)', async () => {
    expect((await new CodAdapter().verifyPayment()).outcome).toBe('NOT_PAID')
    expect((await new CodAdapter().getStatus()).state).toBe('PENDING')
  })
})
