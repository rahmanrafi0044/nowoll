import type {
  ApiResult,
  CartQuoteView,
  CheckoutQuoteView,
  DiscountPreviewView,
  OrderPlacedView,
} from '@nowoll/types'
import { publicEnv } from '@/lib/env'

type Items = { variantId: string; quantity: number }[]

async function post<T>(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<{ ok: true; data: T } | { ok: false; status: number; error?: string; message: string }> {
  try {
    const res = await fetch(`${publicEnv.apiUrl}/api/v1${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
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
