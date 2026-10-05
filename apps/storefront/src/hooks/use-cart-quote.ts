'use client'

import type { CartQuoteLineView, CartQuoteView, DiscountPreviewView } from '@nowoll/types'
import { useEffect, useRef, useState } from 'react'
import { fetchCartQuote, fetchDiscountPreview } from '@/lib/cart-api'
import { useCartStore } from '@/stores/cart-store'

export type DiscountState =
  | { state: 'none' }
  | { state: 'checking' }
  | { state: 'applied'; preview: DiscountPreviewView }
  | { state: 'refused'; message: string }
  | { state: 'waiting'; message: string } // can't check right now (bag has a problem, or rate limited)

export interface CartQuoteState {
  quote: CartQuoteView | null
  loading: boolean
  error: string | null
  discount: DiscountState
  priceChanged: Set<string> // variant ids whose price changed since they were added
  lineFor: (variantId: string) => CartQuoteLineView | undefined
}

const DEBOUNCE_MS = 400
const EMPTY_QUOTE: CartQuoteView = { lines: [], subtotal: '0', canCheckout: true }

// Results are stored together with the bag "key" they were computed for.
// Anything that doesn't match the current bag is simply out of date — so
// "loading" is DERIVED from that, instead of being set and unset by hand.
interface QuoteResult {
  key: string
  quote: CartQuoteView | null
  error: string | null
}
interface DiscountResult {
  key: string
  code: string
  discount: DiscountState
}

/**
 * Keeps the bag honest. Whenever its contents change it asks the API for
 * TODAY's prices and availability (decisions #1–#3), quietly updates any
 * price that changed (and remembers which, to show "Price updated"), then
 * re-checks the discount code against the new bag.
 * Waits briefly after the last change so tapping "+" five times sends one request.
 */
export function useCartQuote(): CartQuoteState {
  const items = useCartStore((s) => s.items)
  const discountCode = useCartStore((s) => s.discountCode)
  const syncLine = useCartStore((s) => s.syncLine)

  const [result, setResult] = useState<QuoteResult | null>(null)
  const [discountResult, setDiscountResult] = useState<DiscountResult | null>(null)
  const [priceChanged, setPriceChanged] = useState<Set<string>>(new Set())
  const lastApplied = useRef<DiscountResult | null>(null)

  // Only WHAT is in the bag triggers a refresh — not the prices we update ourselves.
  const key = items.map((i) => `${i.variantId}:${i.quantity}`).join(',')

  useEffect(() => {
    if (key === '') return // empty bag: nothing to ask the API
    const request = useCartStore
      .getState()
      .items.map(({ variantId, quantity }) => ({ variantId, quantity }))
    let cancelled = false

    const timer = setTimeout(async () => {
      const response = await fetchCartQuote(request)
      if (cancelled) return
      if (!response.ok) {
        setResult({ key, quote: null, error: response.message })
        return
      }
      setResult({ key, quote: response.data, error: null })

      // Decision #1: update prices that changed, and remember which ones.
      const current = useCartStore.getState().items
      const changed: string[] = []
      for (const line of response.data.lines) {
        const mine = current.find((i) => i.variantId === line.variantId)
        if (!mine || line.status === 'unavailable' || line.unitPrice === undefined) continue
        const latest = Number(line.unitPrice)
        if (latest !== mine.unitPrice) changed.push(line.variantId)
        syncLine(line.variantId, {
          unitPrice: latest,
          productName: line.productName ?? mine.productName,
          imageUrl: line.imageUrl ?? mine.imageUrl,
        })
      }
      if (changed.length > 0) setPriceChanged((prev) => new Set([...prev, ...changed]))

      // Re-check the discount code against the new bag.
      if (!discountCode) return
      const store = (discount: DiscountState) =>
        setDiscountResult({ key, code: discountCode, discount })
      if (!response.data.canCheckout) {
        store({
          state: 'waiting',
          message: 'Fix the items marked below, then your code will be applied.',
        })
        return
      }
      const preview = await fetchDiscountPreview(discountCode, request)
      if (cancelled) return
      if (preview.ok) {
        lastApplied.current = {
          key,
          code: discountCode,
          discount: { state: 'applied', preview: preview.data },
        }
        store(lastApplied.current.discount)
      } else if (preview.status === 422) {
        store({ state: 'refused', message: preview.message })
      } else if (preview.status === 429 && lastApplied.current?.code === discountCode) {
        store(lastApplied.current.discount) // too many checks this minute: keep the last result; checkout re-checks anyway
      } else {
        store({
          state: 'waiting',
          message: "We couldn't check your code just now — it will be checked at checkout.",
        })
      }
    }, DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [key, discountCode, syncLine])

  const empty = key === ''
  const fresh = result?.key === key ? result : null
  const discount: DiscountState =
    !discountCode || empty
      ? { state: 'none' }
      : discountResult?.key === key && discountResult.code === discountCode
        ? discountResult.discount
        : { state: 'checking' }

  return {
    quote: empty ? EMPTY_QUOTE : (fresh?.quote ?? result?.quote ?? null),
    loading: !empty && !fresh,
    error: fresh?.error ?? null,
    discount,
    priceChanged,
    lineFor: (variantId) =>
      (fresh?.quote ?? result?.quote)?.lines.find((l) => l.variantId === variantId),
  }
}
