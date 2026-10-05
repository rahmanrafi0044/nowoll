// ============================================================================
// ADAPTER PATTERN (CLAUDE.md §9): the API's business logic talks to this one
// interface and never knows which payment provider is behind it. Adding bKash
// direct or Nagad later = writing one more adapter, nothing else changes.
// ============================================================================

/** A money amount as a decimal string, e.g. "1550" or "1550.50" (never a float). */
export type Amount = string

export interface CreatePaymentParams {
  transactionId: string // our id; SSLCommerz calls it tran_id (max 30 chars, unique per attempt)
  amount: Amount
  customer: {
    name: string
    email: string
    phone: string
    address: string
    city: string
    postcode?: string | null
  }
  shipping: { name: string; address: string; city: string; postcode?: string | null }
  productNames: string[]
  itemCount: number
  urls: { success: string; fail: string; cancel: string; ipn: string }
}

export type PaymentResult =
  | { ok: true; redirectUrl: string | null; sessionKey: string | null } // null redirect = nothing to pay now (COD)
  | {
      ok: false
      reason: 'NOT_CONFIGURED' | 'AMOUNT_OUT_OF_RANGE' | 'GATEWAY_REFUSED' | 'UNREACHABLE'
      message: string
    }

export interface VerifyParams {
  valId: string // from the payment notification — the ONLY thing we trust from it
  expected: { transactionId: string; amount: Amount; currency: 'BDT' }
}

export interface PaymentDetails {
  valId: string
  bankTransactionId: string | null
  cardType: string | null
  amount: Amount
}

export type VerifyResult =
  | { outcome: 'PAID'; details: PaymentDetails; raw: unknown }
  // Paid, but SSLCommerz flags it as risky (risk_level = 1): a human checks first (decision #2).
  | { outcome: 'REVIEW'; reason: string; details: PaymentDetails; raw: unknown }
  | { outcome: 'NOT_PAID'; reason: string; raw: unknown }
  // The validation server couldn't be reached: NEVER guess — mark for review and retry/alert.
  | { outcome: 'UNREACHABLE'; reason: string }

export interface RefundParams {
  bankTransactionId: string
  refundTransactionId: string // our unique id for this refund (max 30 chars)
  amount: Amount
  remarks: string
}

export type RefundResult =
  | { ok: true; status: 'refunded' | 'processing'; refundRefId: string | null; raw: unknown }
  | { ok: false; reason: string; raw: unknown }

export type GatewayStatus =
  | { state: 'PAID' | 'PENDING' | 'FAILED' | 'NOT_FOUND'; raw: unknown }
  | { state: 'UNREACHABLE'; reason: string }

export interface PaymentProvider {
  readonly method: 'SSLCOMMERZ' | 'COD'
  createPayment(params: CreatePaymentParams): Promise<PaymentResult>
  verifyPayment(params: VerifyParams): Promise<VerifyResult>
  refundPayment(params: RefundParams): Promise<RefundResult>
  getStatus(transactionId: string): Promise<GatewayStatus>
}
