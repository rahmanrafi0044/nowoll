import type {
  CreatePaymentParams,
  GatewayStatus,
  PaymentProvider,
  PaymentResult,
  RefundResult,
  RefundStatusResult,
  VerifyResult,
} from './types.js'

/**
 * Cash on Delivery: there's no gateway. The courier collects the cash and the
 * admin marks the order paid (spec: "COD orders: payment_status = PENDING;
 * admin marks paid after collecting payment"). So "creating" a payment just
 * means: nothing to pay now, no page to send the customer to.
 */
export class CodAdapter implements PaymentProvider {
  readonly method = 'COD' as const

  async createPayment(_params: CreatePaymentParams): Promise<PaymentResult> {
    return { ok: true, redirectUrl: null, sessionKey: null }
  }

  async verifyPayment(): Promise<VerifyResult> {
    return {
      outcome: 'NOT_PAID',
      reason: 'Cash on delivery is confirmed by an admin after the courier collects it',
      raw: null,
    }
  }

  async refundPayment(): Promise<RefundResult> {
    return {
      ok: false,
      reason: 'Cash refunds are paid out by hand (bKash/bank transfer) and recorded by an admin',
      raw: null,
    }
  }

  async getStatus(): Promise<GatewayStatus> {
    return { state: 'PENDING', raw: null }
  }

  async getRefundStatus(): Promise<RefundStatusResult> {
    return { state: 'UNREACHABLE', reason: 'Cash refunds are recorded by an admin, not queried' }
  }
}
