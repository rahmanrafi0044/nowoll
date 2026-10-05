import { randomBytes } from 'node:crypto'

/**
 * A payment attempt's transaction id, as sent to SSLCommerz as `tran_id`:
 * "NW10001-7F3A9C" — the order number (easy for support to recognise) plus 6
 * random hex characters (so every attempt is unique, and ids can't be guessed
 * in sequence). 14 characters — well inside SSLCommerz's 30-character limit.
 */
export function newTransactionId(orderNumber: number): string {
  return `NW${orderNumber}-${randomBytes(3).toString('hex').toUpperCase()}`
}
