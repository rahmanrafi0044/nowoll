'use client'

import type { PaymentStatusView } from '@nowoll/types'
import { useEffect, useState } from 'react'
import { fetchPaymentStatus } from '@/lib/cart-api'

export const POLL_INTERVAL_MS = 3000
export const MAX_POLLS = 20 // ~1 minute; then "Check again" (the API allows 30/min)

interface State {
  view: PaymentStatusView | null
  notFound: boolean
  error: string | null
  /** Stopped polling while the payment was still unconfirmed. */
  gaveUp: boolean
}

const settled = (v: PaymentStatusView) => v.paymentStatus !== 'PENDING' || v.status !== 'PENDING'

/**
 * Asks the API about an order's payment. With `poll`, keeps asking every few
 * seconds until SSLCommerz's confirmation has been processed (usually seconds;
 * the IPN can take a little longer than the customer's browser).
 */
export function usePaymentStatus(orderId: string | null, poll: boolean) {
  const [state, setState] = useState<State>({
    view: null,
    notFound: false,
    error: null,
    gaveUp: false,
  })
  const [round, setRound] = useState(0)

  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let tries = 0

    async function tick(id: string) {
      const result = await fetchPaymentStatus(id)
      if (cancelled) return
      tries++
      if (result.ok) {
        setState((s) => ({ ...s, view: result.data, error: null }))
        if (!poll || settled(result.data)) return
      } else if (result.status === 404 || result.status === 400) {
        return setState((s) => ({ ...s, notFound: true }))
      } else {
        setState((s) => ({
          ...s,
          error:
            result.status === 429 ? 'Checking too often — trying again shortly.' : result.message,
        }))
        if (!poll) return
      }
      if (tries >= MAX_POLLS) return setState((s) => ({ ...s, gaveUp: true }))
      timer = setTimeout(() => void tick(id), POLL_INTERVAL_MS)
    }
    void tick(orderId)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [orderId, poll, round])

  return {
    ...state,
    loading: !!orderId && !state.view && !state.notFound && !state.error,
    checkAgain: () => {
      setState((s) => ({ ...s, gaveUp: false }))
      setRound((r) => r + 1)
    },
  }
}
