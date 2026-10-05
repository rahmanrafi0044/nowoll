import type { ApiResult, CartQuoteView, DiscountPreviewView } from '@nowoll/types'
import { publicEnv } from '@/lib/env'

type Items = { variantId: string; quantity: number }[]

async function post<T>(
  path: string,
  body: unknown,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error?: string; message: string }> {
  try {
    const res = await fetch(`${publicEnv.apiUrl}/api/v1${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
