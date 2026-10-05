'use client'

import type { CartQuoteLineView } from '@nowoll/types'
import Image from 'next/image'
import Link from 'next/link'
import { formatBdt } from '@/lib/format'
import { type CartItem, useCartStore } from '@/stores/cart-store'
import { QuantityStepper } from './quantity-stepper'

export function CartLine({
  item,
  line,
  priceChanged,
  onNavigate,
}: {
  item: CartItem
  line: CartQuoteLineView | undefined // undefined while today's prices are loading
  priceChanged: boolean
  onNavigate?: () => void // e.g. close the drawer when following the product link
}) {
  const updateQuantity = useCartStore((s) => s.updateQuantity)
  const removeItem = useCartStore((s) => s.removeItem)
  const unavailable = line?.status === 'unavailable'
  const notEnough = line?.status === 'insufficient_stock'
  const label = `${item.productName} (${item.variantLabel})`

  return (
    <li className={`flex gap-4 py-4 ${unavailable ? 'opacity-60' : ''}`}>
      <div className="relative size-20 shrink-0 overflow-hidden rounded-control bg-surface-muted">
        {item.imageUrl && (
          <Image src={item.imageUrl} alt="" fill sizes="80px" className="object-cover" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex justify-between gap-2">
          <Link
            href={`/products/${item.productSlug}`}
            onClick={onNavigate}
            className="font-medium hover:underline"
          >
            {item.productName}
          </Link>
          {!unavailable && (
            <span className="font-medium tabular-nums">
              {formatBdt(item.unitPrice * item.quantity)}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {item.variantLabel} · {formatBdt(item.unitPrice)} each
        </p>
        {/* Decisions #1–#3: tell the customer, never change their bag silently */}
        {priceChanged && !unavailable && (
          <p className="text-sm text-info">Price updated to today&apos;s price.</p>
        )}
        {unavailable && (
          <p className="text-sm font-medium text-danger">No longer available — please remove it.</p>
        )}
        {notEnough && (
          <p className="text-sm font-medium text-danger">Only a few left — reduce the quantity.</p>
        )}
        <div className="mt-1 flex items-center justify-between">
          {!unavailable ? (
            <QuantityStepper
              value={item.quantity}
              onChange={(q) => updateQuantity(item.variantId, q)}
              label={label}
            />
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={() => removeItem(item.variantId)}
            className="text-sm underline underline-offset-4 hover:text-danger"
            aria-label={`Remove ${label}`}
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  )
}
