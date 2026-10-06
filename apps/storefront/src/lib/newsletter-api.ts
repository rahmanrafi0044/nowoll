import { call } from '@/lib/cart-api'

// Newsletter double opt-in (step 28). The token comes from the email link.
export const confirmSubscription = (token: string) =>
  call<{ status: 'SUBSCRIBED' }>('POST', '/subscribers/confirm', { token })

export const unsubscribe = (token: string) =>
  call<{ status: 'UNSUBSCRIBED' }>('POST', '/subscribers/unsubscribe', { token })

/** Tokens are 64 hex characters; anything else is a broken link. */
export const isToken = (t: unknown): t is string =>
  typeof t === 'string' && /^[0-9a-f]{64}$/.test(t)
