// A pretend SSLCommerz for tests: no network, no money. It behaves like the
// real adapter where it matters — a val_id only validates for the tran_id and
// amount it was really paid with — so a "forged" notification test is meaningful.
import {
  type CreatePaymentParams,
  type GatewayStatus,
  type PaymentProvider,
  type PaymentResult,
  type RefundParams,
  type RefundResult,
  type RefundStatusResult,
  sameAmount,
  type VerifyResult,
} from '@nowoll/payments'

interface FakePayment {
  transactionId: string
  amount: string
  risky?: boolean
}

export class FakePaymentGateway implements PaymentProvider {
  readonly method = 'SSLCOMMERZ' as const
  /** Every payment page requested, in order. */
  readonly created: CreatePaymentParams[] = []
  readonly verifyCalls: string[] = []
  readonly statusCalls: string[] = []
  /** Set to make the next createPayment() calls fail. */
  createResult: PaymentResult | null = null
  /** Set to make the validation API / transaction query "unreachable". */
  validatorDown = false
  queryDown = false
  private readonly payments = new Map<string, FakePayment>() // by val_id
  private readonly states = new Map<string, 'PENDING' | 'FAILED'>() // by tran_id

  /** The customer pays on the (fake) SSLCommerz page. Returns the val_id SSLCommerz would send. */
  pay(transactionId: string, amount: string, opts: { risky?: boolean } = {}): string {
    const valId = `VAL-${transactionId}`
    this.payments.set(valId, { transactionId, amount, risky: opts.risky })
    return valId
  }

  /** The customer's payment failed (card declined) or is still in progress. */
  setState(transactionId: string, state: 'PENDING' | 'FAILED') {
    this.states.set(transactionId, state)
  }

  async createPayment(p: CreatePaymentParams): Promise<PaymentResult> {
    this.created.push(p)
    return (
      this.createResult ?? {
        ok: true,
        redirectUrl: `https://sandbox.sslcommerz.com/pay/${p.transactionId}`,
        sessionKey: `SESSION-${p.transactionId}`,
      }
    )
  }

  async verifyPayment({
    valId,
    expected,
  }: Parameters<PaymentProvider['verifyPayment']>[0]): Promise<VerifyResult> {
    this.verifyCalls.push(valId)
    if (this.validatorDown)
      return { outcome: 'UNREACHABLE', reason: 'Validation API did not respond' }
    const p = this.payments.get(valId)
    const raw = p
      ? { status: 'VALID', val_id: valId, tran_id: p.transactionId, amount: p.amount }
      : { status: 'INVALID_TRANSACTION' }
    if (!p) return { outcome: 'NOT_PAID', reason: 'Validation status INVALID_TRANSACTION', raw }
    if (p.transactionId !== expected.transactionId)
      return { outcome: 'NOT_PAID', reason: 'Transaction id does not match', raw }
    if (!sameAmount(p.amount, expected.amount))
      return { outcome: 'NOT_PAID', reason: 'Amount does not match', raw }
    const details = {
      valId,
      bankTransactionId: `BANK-${valId}`,
      cardType: 'BKASH-BKash',
      amount: p.amount,
    }
    return p.risky
      ? {
          outcome: 'REVIEW',
          reason: 'Flagged risky by SSLCommerz: Card holder verification',
          details,
          raw,
        }
      : { outcome: 'PAID', details, raw }
  }

  async getStatus(transactionId: string): Promise<GatewayStatus> {
    this.statusCalls.push(transactionId)
    if (this.queryDown) return { state: 'UNREACHABLE', reason: 'Transaction query did not respond' }
    const paid = [...this.payments.entries()].find(([, p]) => p.transactionId === transactionId)
    if (paid)
      return {
        state: 'PAID',
        raw: {
          no_of_trans_found: 1,
          element: [{ status: 'VALID', val_id: paid[0], tran_id: transactionId }],
        },
      }
    const state = this.states.get(transactionId)
    if (state)
      return {
        state,
        raw: { no_of_trans_found: 1, element: [{ status: state, tran_id: transactionId }] },
      }
    return { state: 'NOT_FOUND', raw: { no_of_trans_found: 0 } }
  }

  /** Every refund SSLCommerz was asked for. */
  readonly refunds: RefundParams[] = []
  /** What the refund API answers next: done at once, still processing, or refused. */
  refundAnswer: 'refunded' | 'processing' | 'failed' | 'unreachable' = 'refunded'
  /** Later answers of the refund status query, by refund_ref_id. */
  readonly refundStatuses = new Map<string, 'REFUNDED' | 'PROCESSING' | 'CANCELLED'>()

  async refundPayment(p: RefundParams): Promise<RefundResult> {
    this.refunds.push(p)
    const refundRefId = `RREF-${this.refunds.length}`
    switch (this.refundAnswer) {
      case 'refunded':
        return {
          ok: true,
          status: 'refunded',
          refundRefId,
          raw: { APIConnect: 'DONE', status: 'success' },
        }
      case 'processing':
        this.refundStatuses.set(refundRefId, 'PROCESSING')
        return {
          ok: true,
          status: 'processing',
          refundRefId,
          raw: { APIConnect: 'DONE', status: 'processing' },
        }
      case 'failed':
        return {
          ok: false,
          reason: 'Refund failed: Insufficient balance',
          raw: { APIConnect: 'DONE', status: 'failed' },
        }
      case 'unreachable':
        return { ok: false, reason: 'Refund API did not respond', raw: null }
    }
  }

  async getRefundStatus(refundRefId: string): Promise<RefundStatusResult> {
    const state = this.refundStatuses.get(refundRefId)
    return state
      ? { state, raw: { status: state.toLowerCase() } }
      : { state: 'UNREACHABLE', reason: 'unknown refund' }
  }
}
