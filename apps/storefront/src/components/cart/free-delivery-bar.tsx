import { formatBdt } from '@/lib/format'
import type { FreeDeliveryOffer } from '@/lib/free-delivery'

/**
 * "৳450 more for free delivery" with a thin bar that fills up (design refresh
 * 38f). The words carry the meaning; the bar is decoration for sighted
 * shoppers, so screen readers skip it. Polite live region: changing the
 * quantity reads the new sentence once, without interrupting.
 */
export function FreeDeliveryBar({ offer, amount }: { offer: FreeDeliveryOffer; amount: number }) {
  const left = Math.max(0, offer.threshold - amount)
  const filled = Math.min(100, Math.round((amount / offer.threshold) * 100))
  const where = offer.zone ? ` (${offer.zone})` : ''
  return (
    <div className="flex flex-col gap-2 py-4">
      <p className="text-sm" aria-live="polite">
        {left > 0 ? (
          <>
            <span className="font-medium tabular-nums">{formatBdt(left)}</span> more for free
            delivery{where}
          </>
        ) : (
          <>Your order gets free delivery{where}</>
        )}
      </p>
      <div aria-hidden="true" className="h-1 overflow-hidden bg-surface-muted">
        <div
          className="h-full bg-accent transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${filled}%` }}
        />
      </div>
    </div>
  )
}
