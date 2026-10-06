import type { OrderTrackingView } from '@nowoll/types'
import { formatDate, JOURNEY, STATUS_LABEL } from './order-status'

/**
 * Where an order is: placed → confirmed → packed → on its way → delivered,
 * with the date each step was reached. A cancelled/returned order gets one
 * line instead. Used by "Track your order" and "My orders" (step 23).
 */
export function OrderProgress({
  status,
  timeline,
}: {
  status: OrderTrackingView['status']
  timeline: OrderTrackingView['timeline']
}) {
  const reachedAt = new Map(timeline.map((t) => [t.status, t.at]))
  if (status === 'CANCELLED' || status === 'RETURNED')
    return (
      <p role="status" className="rounded-control bg-surface-muted p-4">
        <strong>{STATUS_LABEL[status]}</strong>
        {reachedAt.get(status) && ` on ${formatDate(reachedAt.get(status)!)}`}.
        {status === 'CANCELLED' &&
          ' If you paid and money was taken, it will be refunded — contact us with your order number.'}
      </p>
    )

  const current = JOURNEY.indexOf(status)
  return (
    <ol aria-label="Order progress" className="flex flex-col gap-3">
      {JOURNEY.map((step, i) => {
        const done = i <= current
        return (
          <li
            key={step}
            aria-current={i === current ? 'step' : undefined}
            className="flex items-center gap-3"
          >
            <span
              aria-hidden
              className={`flex size-6 items-center justify-center rounded-full text-xs ${done ? 'bg-brand text-brand-foreground' : 'border border-border-strong'}`}
            >
              {done ? '✓' : ''}
            </span>
            <span className={done ? 'font-medium' : 'text-muted-foreground'}>
              {STATUS_LABEL[step]}
              <span className="sr-only">{done ? ' (done)' : ' (not yet)'}</span>
            </span>
            {reachedAt.get(step) && (
              <span className="ml-auto text-sm text-muted-foreground">
                {formatDate(reachedAt.get(step)!)}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
