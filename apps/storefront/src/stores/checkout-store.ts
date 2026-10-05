import { create } from 'zustand'
import type { OrderPlacedView } from '@nowoll/types'
import { createJSONStorage, persist } from 'zustand/middleware'

export type CheckoutStep = 'contact' | 'address' | 'shipping' | 'payment' | 'review'
export const STEPS: CheckoutStep[] = ['contact', 'address', 'shipping', 'payment', 'review']
export type PaymentChoice = 'SSLCOMMERZ' | 'COD'

export interface Contact {
  fullName: string
  email: string // normalized (lower case)
  phone: string // normalized: +8801XXXXXXXXX
}

export interface ShippingAddress {
  division: string
  district: string
  area: string
  addressLine1: string
  addressLine2: string
  postalCode: string
}

interface CheckoutState {
  step: CheckoutStep
  done: CheckoutStep[]
  contact: Contact | null
  address: ShippingAddress | null
  payment: PaymentChoice | null
  /**
   * DOUBLE-SUBMIT PROTECTION: one random key per checkout. Every "Place order"
   * attempt (including retries after a network error) sends the SAME key, so
   * the API can never create two orders from one checkout.
   */
  attemptKey: string | null
  /** The order just placed — shown as the confirmation (survives a refresh in this tab). */
  placed: OrderPlacedView | null
  /** Why the payment page couldn't be opened right after placing the order (shown with "Pay now"). */
  paymentNotice: string | null
  /** Bumped to make the summary re-ask the API (e.g. after "prices changed"). */
  quoteNonce: number
  ensureAttemptKey: () => string
  setPlaced: (order: OrderPlacedView, paymentNotice?: string) => void
  refreshQuote: () => void
  complete: (step: CheckoutStep) => void
  goTo: (step: CheckoutStep) => void
  setContact: (c: Contact) => void
  setAddress: (a: ShippingAddress) => void
  setPayment: (p: PaymentChoice) => void
  reset: () => void
}

const initial = {
  step: 'contact' as CheckoutStep,
  done: [] as CheckoutStep[],
  contact: null,
  address: null,
  payment: null,
  attemptKey: null,
  placed: null,
  paymentNotice: null,
  quoteNonce: 0,
}

// What the customer has typed so far. Saved in sessionStorage (decision #5):
// it survives a refresh, but is forgotten when the tab closes — safer than
// localStorage on a shared or family phone.
export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set, get) => ({
      ...initial,
      ensureAttemptKey: () => {
        const existing = get().attemptKey
        if (existing) return existing
        const key = crypto.randomUUID()
        set({ attemptKey: key })
        return key
      },
      // A placed order starts a fresh checkout (new key) but keeps the confirmation.
      setPlaced: (order, paymentNotice) =>
        set({ ...initial, placed: order, paymentNotice: paymentNotice ?? null }),
      refreshQuote: () => set((s) => ({ quoteNonce: s.quoteNonce + 1 })),
      // Marking a step done opens the next one.
      complete: (step) =>
        set((s) => ({
          done: s.done.includes(step) ? s.done : [...s.done, step],
          step: STEPS[Math.min(STEPS.indexOf(step) + 1, STEPS.length - 1)]!,
        })),
      // Only steps whose earlier steps are done can be opened.
      goTo: (step) =>
        set((s) =>
          STEPS.slice(0, STEPS.indexOf(step)).every((p) => s.done.includes(p)) ? { step } : s,
        ),
      setContact: (contact) => set({ contact }),
      setAddress: (address) => set({ address }),
      setPayment: (payment) => set({ payment }),
      reset: () => set(initial),
    }),
    {
      name: 'nowoll-checkout',
      version: 1,
      storage: createJSONStorage(() => sessionStorage),
      skipHydration: true, // loaded in the browser after the page appears (like the bag)
    },
  ),
)
