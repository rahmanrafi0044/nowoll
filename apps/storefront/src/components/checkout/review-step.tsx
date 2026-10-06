'use client'

import type { CheckoutQuoteView } from '@nowoll/types'
import { Button } from '@nowoll/ui'
import Link from 'next/link'
import { useState } from 'react'
import { startPayment } from '@/hooks/use-pay-now'
import { createAddress } from '@/lib/account-api'
import { placeOrder } from '@/lib/cart-api'
import { formatBdt } from '@/lib/format'
import { useCartStore } from '@/stores/cart-store'
import { useCheckoutStore } from '@/stores/checkout-store'
import { paymentLabel } from './payment-step'
import { deliveryEstimate } from './shipping-step'

type Problem = { message: string; action?: 'BAG' | 'REMOVE_CODE' | 'PAYMENT' }

// The last look before paying: every detail in one place, each with a way back.
export function ReviewStep({
  quote,
  quoteLoading,
}: {
  quote: CheckoutQuoteView | null
  quoteLoading: boolean
}) {
  const {
    contact,
    address,
    payment,
    saveAddress,
    goTo,
    ensureAttemptKey,
    setPlaced,
    refreshQuote,
  } = useCheckoutStore()
  const items = useCartStore((s) => s.items)
  const discountCode = useCartStore((s) => s.discountCode)
  const setDiscountCode = useCartStore((s) => s.setDiscountCode)
  const clearCart = useCartStore((s) => s.clear)
  const [sending, setSending] = useState<false | 'order' | 'payment'>(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  if (!contact || !address || !payment) return null

  async function submit() {
    if (!quote || !contact || !address || !payment) return
    setSending('order')
    setProblem(null)
    const result = await placeOrder(
      {
        items: items.map(({ variantId, quantity }) => ({ variantId, quantity })),
        contact,
        address: {
          division: address.division,
          district: address.district,
          addressLine1: address.addressLine1,
          ...(address.area && { area: address.area }),
          ...(address.addressLine2 && { addressLine2: address.addressLine2 }),
          ...(address.postalCode && { postalCode: address.postalCode }),
        },
        paymentMethod: payment,
        ...(discountCode && { discountCode }),
        expectedTotal: quote.totals.total, // the API refuses if the real total differs (PRICE_CHANGED)
      },
      // The same key on every attempt of this checkout: a retry can't create a second order.
      ensureAttemptKey(),
    )

    if (result.ok) {
      // Signed in and ticked "Save to my addresses" (step 23). Best effort: the
      // order is placed either way — a failed save (e.g. the 10-address limit) is not worth an error.
      if (saveAddress)
        await createAddress({
          fullName: contact.fullName,
          phone: contact.phone,
          division: address.division,
          district: address.district,
          addressLine1: address.addressLine1,
          area: address.area || null,
          addressLine2: address.addressLine2 || null,
          postalCode: address.postalCode || null,
        })
      // Online payment: go straight to SSLCommerz. The order is saved either
      // way, so if the payment page can't be opened, the confirmation offers "Pay now".
      if (result.data.nextAction === 'PAY') {
        setSending('payment')
        const payment = await startPayment(result.data.orderId)
        clearCart()
        setPlaced(result.data, payment.ok ? undefined : payment.message)
        if (payment.ok) window.location.assign(payment.url)
        return
      }
      setSending(false)
      clearCart()
      setPlaced(result.data)
      return
    }
    setSending(false)
    switch (result.error) {
      case 'PRICE_CHANGED':
        refreshQuote()
        return setProblem({ message: result.message })
      case 'OUT_OF_STOCK':
      case 'ITEMS_UNAVAILABLE':
        return setProblem({ message: result.message, action: 'BAG' })
      case 'ONLINE_PAYMENT_UNAVAILABLE':
      case 'ONLINE_PAYMENT_AMOUNT':
        return setProblem({ message: result.message, action: 'PAYMENT' })
      default:
        if (result.error?.startsWith('DISCOUNT_'))
          return setProblem({ message: result.message, action: 'REMOVE_CODE' })
        if (result.status === 429)
          return setProblem({ message: 'Too many attempts — please wait a minute and try again.' })
        if (result.status === 0)
          return setProblem({
            message: `${result.message} Your order wasn't placed twice — it's safe to try again.`,
          })
        return setProblem({ message: result.message || 'Something went wrong. Please try again.' })
    }
  }
  const estimate = quote?.shipping ? deliveryEstimate(quote.shipping) : null

  const rows: {
    label: string
    value: string
    step: 'contact' | 'address' | 'shipping' | 'payment'
  }[] = [
    {
      label: 'Contact',
      value: `${contact.fullName} · ${contact.email} · ${contact.phone}`,
      step: 'contact',
    },
    {
      label: 'Deliver to',
      value: [
        address.addressLine1,
        address.addressLine2,
        address.area,
        address.district,
        address.division,
        address.postalCode,
      ]
        .filter(Boolean)
        .join(', '),
      step: 'address',
    },
    {
      label: 'Delivery',
      value: quote?.shipping
        ? `${quote.shipping.name}${estimate ? `, ${estimate}` : ''} — ${quote.totals.freeShipping ? 'Free' : formatBdt(quote.totals.shippingFee)}`
        : '…',
      step: 'shipping',
    },
    { label: 'Payment', value: paymentLabel(payment), step: 'payment' },
  ]

  return (
    <div className="flex flex-col gap-5">
      <dl className="flex flex-col gap-3 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex items-start justify-between gap-4">
            <div>
              <dt className="font-medium">{r.label}</dt>
              <dd className="text-muted-foreground">{r.value}</dd>
            </div>
            <button
              type="button"
              onClick={() => goTo(r.step)}
              className="text-sm underline underline-offset-4"
              aria-label={`Change ${r.label.toLowerCase()}`}
            >
              Change
            </button>
          </div>
        ))}
      </dl>

      {quote && (
        <p className="flex justify-between border-t border-border pt-4 text-lg font-semibold">
          <span>{payment === 'COD' ? 'Pay on delivery' : 'Total to pay'}</span>
          <span className="tabular-nums">{formatBdt(quote.totals.total)}</span>
        </p>
      )}

      {problem && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-control bg-danger-soft p-3 text-sm text-danger"
        >
          <p>{problem.message}</p>
          {problem.action === 'BAG' && (
            <Link href="/cart" className="font-medium underline underline-offset-4">
              Review your bag
            </Link>
          )}
          {problem.action === 'PAYMENT' && (
            <button
              type="button"
              className="self-start font-medium underline underline-offset-4"
              onClick={() => {
                setProblem(null)
                goTo('payment')
              }}
            >
              Choose another way to pay
            </button>
          )}
          {problem.action === 'REMOVE_CODE' && (
            <button
              type="button"
              className="self-start font-medium underline underline-offset-4"
              onClick={() => {
                setDiscountCode(null)
                setProblem(null)
              }}
            >
              Remove the code and continue
            </button>
          )}
        </div>
      )}

      <Button size="lg" fullWidth onClick={submit} disabled={!!sending || quoteLoading || !quote}>
        {sending === 'payment'
          ? 'Opening the payment page…'
          : sending
            ? 'Placing your order…'
            : payment === 'COD'
              ? 'Place order'
              : 'Place order and pay'}
      </Button>
      <p className="text-xs text-muted-foreground">
        By placing your order you agree to our{' '}
        <Link href="/terms" className="underline">
          terms
        </Link>{' '}
        and{' '}
        <Link href="/returns" className="underline">
          return policy
        </Link>
        .
      </p>
    </div>
  )
}
