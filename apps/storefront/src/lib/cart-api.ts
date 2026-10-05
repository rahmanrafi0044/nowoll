import type {
  ApiResult,
  CartQuoteView,
  CheckoutQuoteView,
  DiscountPreviewView,
  OrderPlacedView,
  OrderReceiptView,
  OrderTrackingView,
  PaymentInitView,
  PaymentStatusView,
} from '@nowoll/types'
import { publicEnv } from '@/lib/env'

type Items = { variantId: string; quantity: number }[]

export type ApiCallResult<T> =
  { ok: true; data: T } | { ok: false; status: number; error?: string; message: string }

/**
 * One call to the API from the browser. Never throws: failures come back as { ok: false }.
 * credentials: 'include' sends the login cookies (HttpOnly — this code never sees them),
 * so a signed-in customer is recognised, e.g. when placing an order.
 */
export async function call<T>(
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<ApiCallResult<T>> {
  try {
    const res = await fetch(`${publicEnv.apiUrl}/api/v1${path}`, {
      method,
      credentials: 'include',
      ...(method === 'POST' && {
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
      }),
    })
    const json = (await res.json()) as ApiResult<T>
    if (json.success) return { ok: true, data: json.data }
    return { ok: false, status: res.status, error: json.error, message: json.message }
  } catch {
    return {
      ok: false,
      status: 0,
      message: 'Could not connect. Check your internet and try again.',
    }
  }
}

const post = <T>(path: string, body: unknown, headers: Record<string, string> = {}) =>
  call<T>('POST', path, body, headers)

/** Today's price and availability for each line (see apps/api cart module). */
export const fetchCartQuote = (items: Items) => post<CartQuoteView>('/cart/price', { items })

/** What a discount code would take off — a preview; nothing is used up. */
export const fetchDiscountPreview = (code: string, items: Items) =>
  post<DiscountPreviewView>('/discounts/validate', { code, items })

/** Every number on the checkout summary (shipping, VAT, discount, total). */
export const fetchCheckoutQuote = (body: {
  items: Items
  district?: string
  discountCode?: string
  email?: string
}) => post<CheckoutQuoteView>('/checkout/quote', body)

export interface PlaceOrderBody {
  items: Items
  contact: { fullName: string; email: string; phone: string }
  address: {
    division: string
    district: string
    area?: string
    addressLine1: string
    addressLine2?: string
    postalCode?: string
  }
  paymentMethod: 'COD' | 'SSLCOMMERZ'
  discountCode?: string
  expectedTotal: string
}

/** Places the order. The key makes retries safe: the same key never creates a second order. */
export const placeOrder = (body: PlaceOrderBody, idempotencyKey: string) =>
  post<OrderPlacedView>('/orders', body, { 'idempotency-key': idempotencyKey })

/** Asks for an SSLCommerz payment page for this order (step 20). */
export const initPayment = (orderId: string) =>
  post<PaymentInitView>('/payment/sslcommerz/init', { orderId })

/** Is the order paid yet? The thank-you and payment-failed pages ask this. */
export const fetchPaymentStatus = (orderId: string) =>
  call<PaymentStatusView>('GET', `/payment/status/${encodeURIComponent(orderId)}`)

/** The full receipt for the confirmation page (the random order id is the key). */
export const fetchReceipt = (orderId: string) =>
  call<OrderReceiptView>('GET', `/orders/${encodeURIComponent(orderId)}/receipt`)

/** "Track your order": order number + the email or mobile used at checkout (in the body, never the URL). */
export const trackOrder = (body: { orderNumber: string; contact: string }) =>
  post<OrderTrackingView>('/orders/track', body)

/**
 * OPEN-REDIRECT GUARD: we only ever send customers to SSLCommerz's own
 * secure pages, even if a broken or tampered response says otherwise.
 */
export function isGatewayUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return (
      protocol === 'https:' &&
      (hostname === 'sslcommerz.com' || hostname.endsWith('.sslcommerz.com'))
    )
  } catch {
    return false
  }
}
