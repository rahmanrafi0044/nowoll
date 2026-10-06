import type { AnalyticsSummary } from '@nowoll/types'

// Work waiting for someone right now — the box to check first each morning.
// (Links to the matching lists arrive with the orders page, step 31, and the
// returns page, step 35.)
export function NeedsAttention({ counts }: { counts: AnalyticsSummary['needsAttention'] }) {
  const rows = [
    { n: counts.codToConfirm, text: 'cash-on-delivery orders to confirm by phone' },
    { n: counts.toShip, text: 'confirmed orders to pack and ship' },
    { n: counts.paymentsToReview, text: 'online payments to check by hand' },
    { n: counts.returnRequests, text: 'return requests to approve or reject' },
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
          <span className={`text-sm ${r.n === 0 ? 'text-muted-foreground' : ''}`}>{r.text}</span>
        </li>
      ))}
    </ul>
  )
}
