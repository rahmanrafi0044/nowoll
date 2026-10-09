import type { AnalyticsSummary } from '@nowoll/types'
import Link from 'next/link'

// Work waiting for someone right now — the box to check first each morning.
// Each line opens the matching, already-filtered list (orders: step 31b;
// return requests: the returns page, which opens on "To decide" — step 35).
export function NeedsAttention({ counts }: { counts: AnalyticsSummary['needsAttention'] }) {
  const rows = [
    {
      n: counts.codToConfirm,
      text: 'cash-on-delivery orders to confirm by phone',
      href: '/admin/orders?status=PENDING&paymentMethod=COD',
    },
    {
      n: counts.toShip,
      text: 'confirmed orders to pack and ship',
      href: '/admin/orders?status=CONFIRMED,PROCESSING',
    },
    {
      n: counts.paymentsToReview,
      text: 'online payments to check by hand',
      href: '/admin/orders?paymentStatus=UNDER_REVIEW',
    },
    {
      n: counts.returnRequests,
      text: 'return requests to approve or reject',
      href: '/admin/returns',
    },
  ]
  if (rows.every((r) => r.n === 0))
    return <p className="text-sm text-muted-foreground">All caught up — nothing is waiting.</p>
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.text} className="flex items-baseline gap-3">
          <span
            className={`min-w-8 text-right text-xl font-semibold tabular-nums ${r.n === 0 ? 'text-muted-foreground' : ''}`}
          >
            {r.n}
          </span>
          {r.href && r.n > 0 ? (
            <Link href={r.href} className="text-sm underline underline-offset-4">
              {r.text}
            </Link>
          ) : (
            <span className={`text-sm ${r.n === 0 ? 'text-muted-foreground' : ''}`}>{r.text}</span>
          )}
        </li>
      ))}
    </ul>
  )
}
