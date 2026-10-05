'use client'

import { useState } from 'react'
import { initPayment, isGatewayUrl } from '@/lib/cart-api'

export interface PayNowState {
  /** "starting" stays on while the browser is leaving for SSLCommerz. */
  status: 'idle' | 'starting' | 'error'
  code?: string
  message?: string
}

/** Opens the SSLCommerz payment page for an order (a new attempt every time — step 20 decision #1). */
export function usePayNow(initialMessage: string | null = null) {
  const [state, setState] = useState<PayNowState>(
    initialMessage ? { status: 'error', message: initialMessage } : { status: 'idle' },
  )

  async function payNow(orderId: string) {
    setState({ status: 'starting' })
    const result = await startPayment(orderId)
    if (result.ok) return window.location.assign(result.url)
    setState({ status: 'error', code: result.code, message: result.message })
  }

  return { ...state, payNow }
}

/** One "Pay" press: the URL to send the customer to, or why not. */
export async function startPayment(
  orderId: string,
): Promise<{ ok: true; url: string } | { ok: false; code?: string; message: string }> {
  const result = await initPayment(orderId)
  if (result.ok) {
    if (isGatewayUrl(result.data.redirectUrl)) return { ok: true, url: result.data.redirectUrl }
    return { ok: false, message: 'The payment page could not be opened. Please try again.' }
  }
  return {
    ok: false,
    code: result.error,
    message:
      result.status === 429
        ? 'Too many attempts — please wait a minute and try again.'
        : result.message || 'The payment page could not be opened. Please try again.',
  }
}
