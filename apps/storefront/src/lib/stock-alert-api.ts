import { call } from '@/lib/cart-api'

// "Notify me when it's back" (38f) — apps/api/src/stock-alerts.
export const askBackInStock = (variantId: string, email: string) =>
  call<{ waiting: true }>('POST', '/stock-alerts', { variantId, email })
