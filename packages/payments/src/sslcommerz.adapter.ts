import { type HttpClient, fetchClient } from './http.js'
import { canPayOnline, sameAmount, twoDecimals } from './money.js'
import type {
  CreatePaymentParams,
  GatewayStatus,
  PaymentDetails,
  PaymentProvider,
  PaymentResult,
  RefundParams,
  RefundResult,
  VerifyParams,
  VerifyResult,
} from './types.js'

// ============================================================================
// SSLCommerz adapter — written against the OFFICIAL v4 documentation
// (https://developer.sslcommerz.com/doc/v4/), summarised in
// docs/integrations/sslcommerz.md. Field names below are theirs, not guesses.
// ============================================================================

export interface SslCommerzConfig {
  storeId: string
  storePassword: string
  isLive: boolean
}

/** Official limit for tran_id (and refund_trans_id). */
export const MAX_TRAN_ID_LENGTH = 30

const HOSTS = {
  sandbox: 'https://sandbox.sslcommerz.com',
  live: 'https://securepay.sslcommerz.com',
}
const PATHS = {
  session: '/gwprocess/v4/api.php',
  validation: '/validator/api/validationserverAPI.php',
  transactionQuery: '/validator/api/merchantTransIDvalidationAPI.php', // also used for refunds (official docs)
}

/** True when real-looking credentials are present (not the .env.example placeholders). */
export function isSslCommerzConfigured(c: Partial<SslCommerzConfig>): c is SslCommerzConfig {
  const placeholder = (v?: string) => !v || /^your[_-]/i.test(v)
  return !placeholder(c.storeId) && !placeholder(c.storePassword)
}

type Fields = Record<string, unknown>
const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null)

export class SslCommerzAdapter implements PaymentProvider {
  readonly method = 'SSLCOMMERZ' as const

  constructor(
    private readonly config: Partial<SslCommerzConfig>,
    private readonly http: HttpClient = fetchClient,
  ) {}

  private get host() {
    return this.config.isLive ? HOSTS.live : HOSTS.sandbox
  }

  /** Step 1 of an online payment: ask SSLCommerz for a payment page for this order. */
  async createPayment(p: CreatePaymentParams): Promise<PaymentResult> {
    if (!isSslCommerzConfigured(this.config)) {
      return {
        ok: false,
        reason: 'NOT_CONFIGURED',
        message: "Online payment isn't set up yet. Please choose cash on delivery.",
      }
    }
    // SSLCommerz: tran_id is at most 30 characters. A longer id would be
    // refused or cut short — and a cut-short id could no longer be matched
    // back to its order when the payment notification arrives. Fail loudly.
    if (p.transactionId.length > MAX_TRAN_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(p.transactionId)) {
      throw new Error(
        `SSLCommerz tran_id must be 1–${MAX_TRAN_ID_LENGTH} letters, digits, - or _ (got ${p.transactionId.length} characters)`,
      )
    }
    if (!canPayOnline(p.amount)) {
      return {
        ok: false,
        reason: 'AMOUNT_OUT_OF_RANGE',
        message: 'Online payment is available for orders from ৳10 to ৳5,00,000.',
      }
    }

    // SSLCommerz field limits (official docs): most text fields max 50 characters.
    const cut = (s: string, n = 50) => s.slice(0, n)
    // cus_postcode is required by SSLCommerz but optional for our customers (decision #4).
    // TODO: confirm with SSLCommerz support that "0000" is acceptable when unknown.
    const postcode = (v?: string | null) => (v && v.trim() ? v.trim() : '0000')

    const form = new URLSearchParams({
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
      total_amount: twoDecimals(p.amount),
      currency: 'BDT',
      tran_id: p.transactionId,
      success_url: p.urls.success,
      fail_url: p.urls.fail,
      cancel_url: p.urls.cancel,
      ipn_url: p.urls.ipn,
      cus_name: cut(p.customer.name),
      cus_email: cut(p.customer.email),
      cus_add1: cut(p.customer.address),
      cus_city: cut(p.customer.city),
      cus_postcode: postcode(p.customer.postcode),
      cus_country: 'Bangladesh',
      cus_phone: cut(p.customer.phone, 20),
      // Decision #4: real delivery address (also helps SSLCommerz's fraud checks).
      shipping_method: 'YES',
      num_of_item: String(p.itemCount),
      ship_name: cut(p.shipping.name),
      ship_add1: cut(p.shipping.address),
      ship_city: cut(p.shipping.city),
      ship_postcode: postcode(p.shipping.postcode),
      ship_country: 'Bangladesh',
      product_name: cut(p.productNames.join(', '), 255),
      product_category: 'clothing',
      product_profile: 'physical-goods',
    })

    const json = await this.request('POST', `${this.host}${PATHS.session}`, form.toString())
    if (!json)
      return {
        ok: false,
        reason: 'UNREACHABLE',
        message: 'The payment service is not responding. Please try again in a minute.',
      }
    if (json.status !== 'SUCCESS' || !str(json.GatewayPageURL)) {
      return {
        ok: false,
        reason: 'GATEWAY_REFUSED',
        message: str(json.failedreason) ?? 'The payment service refused this payment.',
      }
    }
    return {
      ok: true,
      redirectUrl: json.GatewayPageURL as string,
      sessionKey: str(json.sessionkey),
    }
  }

  /**
   * THE security check (CLAUDE.md §9): ask SSLCommerz's validation API about a
   * val_id. We never trust the status inside a payment notification — anyone
   * can POST a fake one. Paid only if (decision #1):
   *   status is VALID or VALIDATED (= already validated before, e.g. by the redirect)
   *   AND tran_id, amount (to the poisha) and currency all match OUR record.
   */
  async verifyPayment({ valId, expected }: VerifyParams): Promise<VerifyResult> {
    if (!isSslCommerzConfigured(this.config))
      return { outcome: 'UNREACHABLE', reason: 'SSLCommerz is not configured' }
    const query = new URLSearchParams({
      val_id: valId,
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
      format: 'json',
      v: '1',
    })
    const raw = await this.request('GET', `${this.host}${PATHS.validation}?${query}`)
    if (!raw) return { outcome: 'UNREACHABLE', reason: 'Validation API did not respond' }

    const status = str(raw.status)
    if (status !== 'VALID' && status !== 'VALIDATED')
      return { outcome: 'NOT_PAID', reason: `Validation status ${status ?? 'missing'}`, raw }
    if (str(raw.tran_id) !== expected.transactionId)
      return { outcome: 'NOT_PAID', reason: 'Transaction id does not match', raw }
    const amount = str(raw.amount) ?? ''
    if (!sameAmount(amount, expected.amount))
      return {
        outcome: 'NOT_PAID',
        reason: `Amount ${amount} does not match ${expected.amount}`,
        raw,
      }
    // `currency_type` is what we sent; `currency` is the store's settlement currency.
    const currency = str(raw.currency_type) ?? str(raw.currency)
    if (currency !== expected.currency)
      return {
        outcome: 'NOT_PAID',
        reason: `Currency ${currency ?? 'missing'} is not ${expected.currency}`,
        raw,
      }

    const details: PaymentDetails = {
      valId: str(raw.val_id) ?? valId,
      bankTransactionId: str(raw.bank_tran_id),
      cardType: str(raw.card_type),
      amount,
    }
    // Decision #2: SSLCommerz says "verify risky transactions before delivering".
    if (String(raw.risk_level) === '1') {
      return {
        outcome: 'REVIEW',
        reason: `Flagged risky by SSLCommerz: ${str(raw.risk_title) ?? 'no reason given'}`,
        details,
        raw,
      }
    }
    return { outcome: 'PAID', details, raw }
  }

  /**
   * Refund through SSLCommerz. Official docs: GET on the transaction-query
   * endpoint; ONLY works from a server IP registered with SSLCommerz
   * (decision #6 — a launch-checklist item). Triggered by returns in Phase 4.
   */
  async refundPayment(p: RefundParams): Promise<RefundResult> {
    if (!isSslCommerzConfigured(this.config))
      return { ok: false, reason: 'SSLCommerz is not configured', raw: null }
    const query = new URLSearchParams({
      bank_tran_id: p.bankTransactionId,
      refund_trans_id: p.refundTransactionId,
      refund_amount: twoDecimals(p.amount),
      refund_remarks: p.remarks.slice(0, 255),
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
      format: 'json',
    })
    const raw = await this.request('GET', `${this.host}${PATHS.transactionQuery}?${query}`)
    if (!raw) return { ok: false, reason: 'Refund API did not respond', raw: null }
    if (raw.APIConnect !== 'DONE')
      return {
        ok: false,
        reason:
          `Refund API: ${str(raw.APIConnect) ?? 'no answer'} ${str(raw.errorReason) ?? ''}`.trim(),
        raw,
      }
    const status = str(raw.status)
    if (status === 'success')
      return { ok: true, status: 'refunded', refundRefId: str(raw.refund_ref_id), raw }
    if (status === 'processing')
      return { ok: true, status: 'processing', refundRefId: str(raw.refund_ref_id), raw }
    return {
      ok: false,
      reason: `Refund ${status ?? 'failed'}: ${str(raw.errorReason) ?? 'no reason given'}`,
      raw,
    }
  }

  /** Looks a payment up by OUR transaction id — for when a notification never arrived. */
  async getStatus(transactionId: string): Promise<GatewayStatus> {
    if (!isSslCommerzConfigured(this.config))
      return { state: 'UNREACHABLE', reason: 'SSLCommerz is not configured' }
    const query = new URLSearchParams({
      tran_id: transactionId,
      store_id: this.config.storeId,
      store_passwd: this.config.storePassword,
      format: 'json',
    })
    const raw = await this.request('GET', `${this.host}${PATHS.transactionQuery}?${query}`)
    if (!raw) return { state: 'UNREACHABLE', reason: 'Transaction query did not respond' }
    const elements = Array.isArray(raw.element) ? (raw.element as Fields[]) : []
    if (Number(raw.no_of_trans_found ?? 0) === 0 || elements.length === 0)
      return { state: 'NOT_FOUND', raw }
    const statuses = elements.map((e) => str(e.status))
    if (statuses.some((s) => s === 'VALID' || s === 'VALIDATED')) return { state: 'PAID', raw }
    if (statuses.some((s) => s === 'PENDING')) return { state: 'PENDING', raw }
    return { state: 'FAILED', raw }
  }

  /**
   * One request; null when SSLCommerz can't be reached or doesn't answer JSON.
   * The URL (which may contain the store password) is NEVER put in an error message.
   */
  private async request(
    method: 'GET' | 'POST',
    url: string,
    body?: string,
  ): Promise<Fields | null> {
    try {
      const res = await this.http(url, {
        method,
        ...(body !== undefined && {
          body,
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        }),
      })
      if (res.status >= 500) return null
      const parsed: unknown = JSON.parse(await res.text())
      return parsed && typeof parsed === 'object' ? (parsed as Fields) : null
    } catch {
      return null
    }
  }
}
