'use client'

import type { CheckoutQuoteView } from '@nowoll/types'
import { useEffect, useState } from 'react'
import { fetchCheckoutQuote } from '@/lib/cart-api'
import { useCartStore } from '@/stores/cart-store'

export interface CheckoutQuoteState {
  quote: CheckoutQuoteView | null
  loading: boolean
  error: { code?: string; message: string } | null
}

interface Result {
  key: string
  quote: CheckoutQuoteView | null
  error: CheckoutQuoteState['error']
}

/**
 * Asks the API for the checkout numbers whenever something that changes them
 * changes: the bag, the discount code, the district (shipping zone) or the
 * email (once-per-customer codes). Same "derived loading" pattern as useCartQuote.
 */
export function useCheckoutQuote(
  district: string | undefined,
  email: string | undefined,
): CheckoutQuoteState {
  const items = useCartStore((s) => s.items)
  const discountCode = useCartStore((s) => s.discountCode)
  const [result, setResult] = useState<Result | null>(null)

  const key = [
    items.map((i) => `${i.variantId}:${i.quantity}`).join(','),
    discountCode ?? '',
    district ?? '',
    email ?? '',
  ].join('|')

  useEffect(() => {
    if (items.length === 0) return
    let cancelled = false
    const timer = setTimeout(async () => {
      const response = await fetchCheckoutQuote({
        items: items.map(({ variantId, quantity }) => ({ variantId, quantity })),
        ...(district && { district }),
        ...(discountCode && { discountCode }),
        ...(email && { email }),
      })
      if (cancelled) return
      setResult(
        response.ok
          ? { key, quote: response.data, error: null }
          : {
              key,
              quote: null,
              error: {
                code: response.error,
                message:
                  response.status === 429
                    ? 'Too many updates — please wait a moment.'
                    : response.message,
              },
            },
      )
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures items/code/district/email
  }, [key])

  const fresh = result?.key === key ? result : null
  return {
    quote: fresh?.quote ?? result?.quote ?? null,
    loading: items.length > 0 && !fresh,
    error: fresh?.error ?? null,
  }
}
