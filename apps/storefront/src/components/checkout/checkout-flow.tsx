'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useCartHydrated } from '@/hooks/use-cart-hydrated'
import { useCheckoutQuote } from '@/hooks/use-checkout-quote'
import { useCartStore } from '@/stores/cart-store'
import { useCheckoutStore } from '@/stores/checkout-store'
import { AddressStep } from './address-step'
import { ContactStep } from './contact-step'
import { OrderPlaced } from './order-placed'
import { OrderSummary } from './order-summary'
import { PaymentStep, paymentLabel } from './payment-step'
import { ReviewStep } from './review-step'
import { ShippingStep } from './shipping-step'
import { StepSection } from './step-section'

/** Sends the browser to the confirmation page. replace(): "Back" won't return to a finished checkout. */
function OpeningConfirmation({ orderId }: { orderId: string }) {
  const href = `/checkout/success?order=${encodeURIComponent(orderId)}`
  useEffect(() => window.location.replace(href), [href])
  return (
    <p className="py-12 text-center text-muted-foreground">
      Order placed — opening your confirmation…{' '}
      <Link href={href} className="underline underline-offset-4">
        View your order
      </Link>
    </p>
  )
}

// The whole checkout: contact → address → delivery → payment → review,
// with a live order summary beside it (spec: Phase 3 step 17).
export function CheckoutFlow() {
  // Load what was typed earlier in this tab (sessionStorage) once we're in the browser.
  useEffect(() => {
    void useCheckoutStore.persist.rehydrate()
  }, [])

  const hydrated = useCartHydrated()
  const items = useCartStore((s) => s.items)
  const contact = useCheckoutStore((s) => s.contact)
  const address = useCheckoutStore((s) => s.address)
  const payment = useCheckoutStore((s) => s.payment)
  const placed = useCheckoutStore((s) => s.placed)
  const paymentNotice = useCheckoutStore((s) => s.paymentNotice)
  const quoteState = useCheckoutQuote(address?.district, contact?.email)

  if (!hydrated) return <p className="py-12 text-center text-muted-foreground">Loading checkout…</p>

  // Just placed an order (the bag is now empty) → show the confirmation.
  // Just placed an order (the bag is now empty): an online order whose payment
  // page didn't open offers "Pay now"; everything else goes to the confirmation page.
  if (placed && items.length === 0)
    return placed.nextAction === 'PAY' ? (
      <OrderPlaced order={placed} notice={paymentNotice} />
    ) : (
      <OpeningConfirmation orderId={placed.orderId} />
    )

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-lg font-medium">Your bag is empty</p>
        <Link href="/shop" className="text-sm font-medium underline underline-offset-4">
          Continue shopping
        </Link>
      </div>
    )
  }

  if (quoteState.error?.code === 'ITEMS_UNAVAILABLE') {
    return (
      <div role="alert" className="flex flex-col items-center gap-4 py-12 text-center">
        <p className="text-lg font-medium">Some items in your bag are no longer available</p>
        <Link href="/cart" className="text-sm font-medium underline underline-offset-4">
          Review your bag
        </Link>
      </div>
    )
  }

  return (
    <div className="md:grid md:grid-cols-[1fr_22rem] md:items-start md:gap-10">
      <div className="order-2 md:order-1">
        {quoteState.error && (
          <p role="alert" className="mb-2 text-sm text-danger">
            {quoteState.error.message}
          </p>
        )}
        <StepSection
          step="contact"
          title="Contact"
          summary={contact && `${contact.fullName} · ${contact.email} · ${contact.phone}`}
        >
          <ContactStep />
        </StepSection>
        <StepSection
          step="address"
          title="Delivery address"
          summary={address && `${address.addressLine1}, ${address.district}`}
        >
          <AddressStep />
        </StepSection>
        <StepSection step="shipping" title="Delivery" summary={quoteState.quote?.shipping?.name}>
          <ShippingStep quote={quoteState.quote} />
        </StepSection>
        <StepSection step="payment" title="Payment" summary={payment && paymentLabel(payment)}>
          <PaymentStep total={quoteState.quote?.totals.total ?? null} />
        </StepSection>
        <StepSection step="review" title="Review and place order">
          <ReviewStep quote={quoteState.quote} quoteLoading={quoteState.loading} />
        </StepSection>
      </div>
      <div className="order-1 mb-6 md:sticky md:top-6 md:order-2 md:mb-0">
        <OrderSummary state={quoteState} />
      </div>
    </div>
  )
}
