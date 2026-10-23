'use client'

import { Badge } from '@nowoll/ui'
import Link from 'next/link'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { fetchSizeCharts } from '@/lib/size-charts-api'

const uses = (n: number, one: string, many: string) =>
  n === 0 ? null : `${n} ${n === 1 ? one : many}`

// ============================================================================
// Admin → Size charts (38f): measurement tables customers see in a product
// page's "Size guide". Make one per kind of garment ("Three-piece — regular
// fit"), then choose it on a category (every product in it) or on a product.
// ============================================================================
export function SizeChartList() {
  const { state, retry } = useLoad(fetchSizeCharts)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Size charts</h1>
        <Link
          href="/admin/size-charts/new"
          className="inline-flex h-11 items-center rounded-control bg-brand px-5 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
        >
          New size chart
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        Shown in the “Size guide” on product pages. Choose a chart on a <strong>category</strong>{' '}
        (all its products use it) or on a single <strong>product</strong> (its own chart wins).
      </p>
      <Panel title="Charts" state={state} retry={retry}>
        {(charts) =>
          charts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No size charts yet. Make one, then choose it on a category or product.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {charts.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Link
                    href={`/admin/size-charts/${c.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {c.name}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {c.pieces.map((p) => p.name).join(', ')} · {c.unit === 'INCH' ? 'inches' : 'cm'}
                  </span>
                  <span className="ml-auto flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    {[
                      uses(c.categoryCount, 'category', 'categories'),
                      uses(c.productCount, 'product', 'products'),
                    ]
                      .filter(Boolean)
                      .join(', ') || 'Not used yet'}
                    {c.isActive ? <Badge variant="success">On</Badge> : <Badge>Off</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )
        }
      </Panel>
    </div>
  )
}
