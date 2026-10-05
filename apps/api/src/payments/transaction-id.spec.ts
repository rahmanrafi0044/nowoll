import { MAX_TRAN_ID_LENGTH } from '@nowoll/payments'
import { newTransactionId } from './transaction-id.js'

describe('newTransactionId', () => {
  it('looks like NW10001-7F3A9C and fits SSLCommerz limits', () => {
    const id = newTransactionId(10001)
    expect(id).toMatch(/^NW10001-[0-9A-F]{6}$/)
    expect(id.length).toBeLessThanOrEqual(MAX_TRAN_ID_LENGTH)
  })

  it('is different for every attempt', () => {
    expect(new Set(Array.from({ length: 200 }, () => newTransactionId(10001))).size).toBe(200)
  })
})
