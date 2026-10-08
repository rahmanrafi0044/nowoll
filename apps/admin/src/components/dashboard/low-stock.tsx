import Link from 'next/link'
import type { LowStockRow } from '@/lib/analytics-api'

const SHOWN = 8

/** Variants at or below their low-stock limit, emptiest first (the inventory page is step 33). */
export function LowStock({ data }: { data: { items: LowStockRow[]; total: number } }) {
  if (data.total === 0)
    return <p className="text-sm text-muted-foreground">Nothing is running low.</p>
  return (
    <>
      <ul className="flex flex-col divide-y divide-border">
        {data.items.slice(0, SHOWN).map((v) => (
          <li key={v.variantId} className="flex items-baseline justify-between gap-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="font-medium">{v.product.name}</span>{' '}
              <span className="text-muted-foreground">
                {v.size} / {v.color} · {v.sku}
              </span>
            </span>
            <span
              className={`shrink-0 tabular-nums ${v.stock === 0 ? 'font-semibold text-danger' : ''}`}
            >
              {v.stock === 0 ? 'Sold out' : `${v.stock} left`}
              <span className="text-muted-foreground"> (alert at {v.threshold})</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-sm text-muted-foreground">
        {data.total > SHOWN && `and ${data.total - SHOWN} more · `}
        <Link href="/admin/inventory/low-stock" className="underline underline-offset-4">
          See all and change stock
        </Link>
      </p>
    </>
  )
}
