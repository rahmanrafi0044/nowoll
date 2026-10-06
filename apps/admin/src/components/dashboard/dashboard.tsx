'use client'

import { fetchLowStock, fetchRevenue, fetchSummary, fetchTopProducts } from '@/lib/analytics-api'
import { formatDayMonth } from '@/lib/format'
import { KpiCards } from './kpi-cards'
import { LowStock } from './low-stock'
import { NeedsAttention } from './needs-attention'
import { Panel } from './panel'
import { RevenueChart } from './revenue-chart'
import { TopProducts } from './top-products'
import { useLoad } from './use-load'

// Stable loaders (module level) — useLoad re-runs whenever its loader changes.
const loadRevenue = () => fetchRevenue(7)
const loadTopProducts = () => fetchTopProducts(30, 5)

/**
 * The admin home page (step 29b). Four independent requests, so a slow or
 * failing one never blanks the whole page. "Sales" = confirmed or later
 * orders, by the Bangladesh day they were placed (apps/api/src/analytics).
 */
export function Dashboard() {
  const summary = useLoad(fetchSummary)
  const revenue = useLoad(loadRevenue)
  const top = useLoad(loadTopProducts)
  const lowStock = useLoad(fetchLowStock)

  return (
    <div className="flex flex-col gap-6">
      {summary.state.status === 'ok' ? (
        <KpiCards summary={summary.state.data} />
      ) : (
        <Panel title="Sales" state={summary.state} retry={summary.retry}>
          {() => null}
        </Panel>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="Sales per day"
          subtitle="Last 7 days · confirmed orders and later"
          state={revenue.state}
          retry={revenue.retry}
          className="lg:col-span-2"
        >
          {(data) => <RevenueChart series={data} />}
        </Panel>
        <Panel title="Needs attention" state={summary.state} retry={summary.retry}>
          {(data) => <NeedsAttention counts={data.needsAttention} />}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Top products"
          subtitle={
            top.state.status === 'ok'
              ? `${formatDayMonth(top.state.data.from)} – ${formatDayMonth(top.state.data.to)} · by units sold`
              : 'Last 30 days · by units sold'
          }
          state={top.state}
          retry={top.retry}
        >
          {(data) => <TopProducts data={data} />}
        </Panel>
        <Panel title="Low stock" state={lowStock.state} retry={lowStock.retry}>
          {(data) => <LowStock data={data} />}
        </Panel>
      </div>
    </div>
  )
}
