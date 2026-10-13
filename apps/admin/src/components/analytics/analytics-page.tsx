'use client'

import type { CustomersReport, OrdersReport, RevenueSeries } from '@nowoll/types'
import { Button, Input } from '@nowoll/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import {
  fetchCustomersFor,
  fetchOrdersFor,
  fetchRevenueFor,
  fetchTopCategoriesFor,
  fetchTopProductsFor,
} from '@/lib/analytics-api'
import {
  type AnalyticsPeriod,
  customProblem,
  daysIn,
  formatRange,
  PRESETS,
  periodHref,
} from '@/lib/analytics-period'
import { formatBdt, percentChange } from '@/lib/format'
import { SalesTrend } from './sales-trend'

// ============================================================================
// Admin → Analytics (step 41). ADMIN only (the API enforces it). One period
// for the whole page, kept in the address. Each box loads on its own, so one
// failing call never blanks the rest. What the numbers mean: docs/analytics.md.
// ============================================================================

export function AnalyticsPage({ period }: { period: AnalyticsPeriod }) {
  const { from, to } = period
  // Stable loaders per period (useLoad reloads when the function changes).
  const loadRevenue = useCallback(() => fetchRevenueFor({ from, to }), [from, to])
  const loadCustomers = useCallback(() => fetchCustomersFor({ from, to }), [from, to])
  const loadOrders = useCallback(() => fetchOrdersFor({ from, to }), [from, to])
  const revenue = useLoad(loadRevenue)
  const customers = useLoad(loadCustomers)
  const orders = useLoad(loadOrders)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {period.label}
            {period.preset !== 'custom' && ` · ${formatRange(from, to)}`} · compared with the{' '}
            {daysIn(from, to)} days before. Sales = confirmed orders or further, counted on the day
            they were placed (Bangladesh time).
          </p>
        </div>
        <PeriodPicker period={period} />
      </div>

      <Tiles
        revenue={revenue.state.status === 'ok' ? revenue.state.data : null}
        customers={customers.state.status === 'ok' ? customers.state.data : null}
        orders={orders.state.status === 'ok' ? orders.state.data : null}
      />

      <Panel title="Sales" state={revenue.state} retry={revenue.retry}>
        {(series) => <SalesSection key={`${from}-${to}`} first={series} />}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <TopProductsBox from={from} to={to} />
        <TopCategoriesBox from={from} to={to} />
      </div>

      <Panel
        title="Orders placed in this period"
        subtitle="Where they are now — including those later cancelled or returned."
        state={orders.state}
        retry={orders.retry}
      >
        {(o) => <OrdersBox o={o} />}
      </Panel>

      <Panel
        title="Customers"
        subtitle="A customer is an email address, so guest buyers count too."
        state={customers.state}
        retry={customers.retry}
      >
        {(c) => <CustomersBox c={c} />}
      </Panel>
    </div>
  )
}

// ── Period picker ──────────────────────────────────────────────────────────

function PeriodPicker({ period }: { period: AnalyticsPeriod }) {
  const router = useRouter()
  const [custom, setCustom] = useState(period.preset === 'custom')
  const [from, setFrom] = useState(period.from)
  const [to, setTo] = useState(period.to)
  const [problem, setProblem] = useState<string | null>(null)

  function apply(e: FormEvent) {
    e.preventDefault()
    const p = customProblem(from, to)
    setProblem(p)
    if (!p) router.push(periodHref({ from, to }))
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Period" className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button
            key={p.id}
            size="sm"
            variant={period.preset === p.id ? 'primary' : 'secondary'}
            aria-pressed={period.preset === p.id}
            onClick={() => {
              setCustom(false)
              router.push(periodHref({ preset: p.id }))
            }}
          >
            {p.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant={period.preset === 'custom' ? 'primary' : 'secondary'}
          aria-pressed={period.preset === 'custom'}
          aria-expanded={custom}
          onClick={() => setCustom((c) => !c)}
        >
          Custom dates
        </Button>
      </div>
      {custom && (
        <form
          onSubmit={apply}
          aria-label="Custom dates"
          className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3"
        >
          <div className="w-44">
            <Input
              label="From"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="w-44">
            <Input label="To" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button type="submit" size="sm">
            Show
          </Button>
          {problem && (
            <p role="alert" className="w-full text-sm text-danger">
              {problem}
            </p>
          )}
        </form>
      )}
    </div>
  )
}

// ── Summary tiles ──────────────────────────────────────────────────────────

function Tiles({
  revenue,
  customers,
  orders,
}: {
  revenue: RevenueSeries | null
  customers: CustomersReport | null
  orders: OrdersReport | null
}) {
  const average = (revenue: string | number, n: number) => (n === 0 ? 0 : Number(revenue) / n)
  return (
    <ul aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Tile
        label="Sales"
        value={revenue ? formatBdt(revenue.total) : null}
        change={revenue && percentChange(Number(revenue.total), Number(revenue.previous.revenue))}
      />
      <Tile
        label="Orders (sales)"
        value={revenue ? String(revenue.orders) : null}
        change={revenue && percentChange(revenue.orders, revenue.previous.orders)}
      />
      <Tile
        label="Average order"
        value={revenue ? formatBdt(Math.round(average(revenue.total, revenue.orders))) : null}
        change={
          revenue &&
          percentChange(
            average(revenue.total, revenue.orders),
            average(revenue.previous.revenue, revenue.previous.orders),
          )
        }
      />
      <Tile
        label="Customers"
        value={customers ? String(customers.customers) : null}
        detail={
          customers
            ? `${customers.newCustomers} new · ${customers.returningCustomers} returning`
            : undefined
        }
        change={customers && percentChange(customers.customers, customers.previous.customers)}
      />
      <Tile
        label="Cancelled"
        value={orders ? `${orders.cancellationRate}%` : null}
        detail={orders ? `${orders.outcomes.cancelled} of ${orders.placed} placed` : undefined}
        // Percentage POINTS for a rate, and lower is better.
        change={
          orders &&
          Math.round((orders.cancellationRate - orders.previous.cancellationRate) * 10) / 10
        }
        unit="points"
        lowerIsBetter
      />
    </ul>
  )
}

function Tile({
  label,
  value,
  detail,
  change,
  unit = '%',
  lowerIsBetter = false,
}: {
  label: string
  value: string | null
  detail?: string
  change: number | null | undefined
  unit?: '%' | 'points'
  lowerIsBetter?: boolean
}) {
  const good = change != null && change !== 0 && change > 0 !== lowerIsBetter
  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value ?? '…'}</p>
      {detail && <p className="text-xs text-muted-foreground">{detail}</p>}
      {change != null && (
        <p
          className={`mt-1 text-xs ${change === 0 ? 'text-muted-foreground' : good ? 'text-success' : 'text-danger'}`}
        >
          {change === 0
            ? '■ no change'
            : `${change > 0 ? '▲' : '▼'} ${Math.abs(change)}${unit === '%' ? '%' : ' points'}`}{' '}
          <span className="text-muted-foreground">vs previous period</span>
        </p>
      )}
      {change === null && value !== null && (
        <p className="mt-1 text-xs text-muted-foreground">nothing to compare with</p>
      )}
    </li>
  )
}

// ── Sales chart ────────────────────────────────────────────────────────────

const GROUPS = [
  { id: 'day', label: 'By day' },
  { id: 'week', label: 'By week' },
  { id: 'month', label: 'By month' },
] as const

/** The chart, its grouping, and the previous period loaded the same way. */
function SalesSection({ first }: { first: RevenueSeries }) {
  const [series, setSeries] = useState(first)
  const [previous, setPrevious] = useState<RevenueSeries | null>(null)
  const [groupBy, setGroupBy] = useState(first.groupBy)
  const tooManyDays = first.days.length > 92

  useEffect(() => {
    let live = true
    const now =
      groupBy === first.groupBy
        ? Promise.resolve({ ok: true as const, data: first })
        : fetchRevenueFor(first, groupBy)
    void Promise.all([
      now,
      fetchRevenueFor({ from: first.previous.from, to: first.previous.to }, groupBy),
    ]).then(([a, b]) => {
      if (!live) return
      if (a.ok) setSeries(a.data)
      setPrevious(b.ok ? b.data : null)
    })
    return () => {
      live = false
    }
  }, [first, groupBy])

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Group the chart" className="flex flex-wrap gap-2">
        {GROUPS.filter((g) => !(g.id === 'day' && tooManyDays)).map((g) => (
          <Button
            key={g.id}
            size="sm"
            variant={groupBy === g.id ? 'primary' : 'ghost'}
            aria-pressed={groupBy === g.id}
            onClick={() => setGroupBy(g.id)}
          >
            {g.label}
          </Button>
        ))}
      </div>
      <SalesTrend current={series} previous={previous} />
    </div>
  )
}

// ── Tables ─────────────────────────────────────────────────────────────────

/** A thin bar for a row's share — SVG, so no inline style is needed. */
function ShareBar({ share, label }: { share: number; label: string }) {
  const pct = Math.max(0, Math.min(100, share))
  return (
    <svg width="100%" height="8" role="img" aria-label={label} className="block">
      <rect width="100%" height="8" rx="4" className="fill-chart-grid" />
      {pct > 0 && <rect width={`${pct}%`} height="8" rx="4" className="fill-chart-1" />}
    </svg>
  )
}

const pctOf = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10

function TopProductsBox({ from, to }: { from: string; to: string }) {
  const load = useCallback(() => fetchTopProductsFor({ from, to }, 10), [from, to])
  const { state, retry } = useLoad(load)
  return (
    <Panel
      title="Top products"
      subtitle="By units sold. Product sales = price × quantity, before order discounts."
      state={state}
      retry={retry}
    >
      {(top) =>
        top.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No products sold in this period.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-1.5 font-medium">Product</th>
                <th className="py-1.5 text-right font-medium">Units</th>
                <th className="py-1.5 text-right font-medium">Product sales</th>
              </tr>
            </thead>
            <tbody>
              {top.items.map((p) => (
                <tr key={p.productId ?? p.name} className="border-b border-border align-top">
                  <td className="py-1.5 pr-3">
                    {p.productId ? (
                      <Link href={`/admin/products/${p.productId}`} className="hover:underline">
                        {p.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">{p.name} (deleted)</span>
                    )}
                    <ShareBar
                      share={(p.unitsSold / top.items[0]!.unitsSold) * 100}
                      label={`${p.unitsSold} units`}
                    />
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{p.unitsSold}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatBdt(p.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      }
    </Panel>
  )
}

function TopCategoriesBox({ from, to }: { from: string; to: string }) {
  const [level, setLevel] = useState<'category' | 'top'>('category')
  const load = useCallback(() => fetchTopCategoriesFor({ from, to }, level, 10), [from, to, level])
  const { state, retry } = useLoad(load)
  return (
    <Panel
      title="Top categories"
      subtitle="Product sales per category (before order discounts), with its share of all."
      state={state}
      retry={retry}
    >
      {(cats) => (
        <div className="flex flex-col gap-3">
          <div role="group" aria-label="Category level" className="flex gap-2">
            {(
              [
                ['category', 'Each category'],
                ['top', 'Top level'],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                size="sm"
                variant={level === id ? 'primary' : 'ghost'}
                aria-pressed={level === id}
                onClick={() => setLevel(id)}
              >
                {label}
              </Button>
            ))}
          </div>
          {cats.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products sold in this period.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-1.5 font-medium">Category</th>
                  <th className="py-1.5 text-right font-medium">Units</th>
                  <th className="py-1.5 text-right font-medium">Product sales</th>
                  <th className="py-1.5 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {cats.items.map((c) => {
                  const share = pctOf(Number(c.revenue), Number(cats.total))
                  return (
                    <tr
                      key={c.categoryId ?? 'unknown'}
                      className="border-b border-border align-top"
                    >
                      <td className="py-1.5 pr-3">
                        {c.path}
                        <ShareBar share={share} label={`${share}% of product sales`} />
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{c.unitsSold}</td>
                      <td className="py-1.5 text-right tabular-nums">{formatBdt(c.revenue)}</td>
                      <td className="py-1.5 text-right tabular-nums">{share}%</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-1.5">All categories</td>
                  <td />
                  <td className="py-1.5 text-right tabular-nums">{formatBdt(cats.total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </Panel>
  )
}

const OUTCOMES: { key: keyof OrdersReport['outcomes']; label: string; note?: string }[] = [
  { key: 'sale', label: 'Sales', note: 'confirmed, being packed, shipped or delivered' },
  { key: 'delivered', label: '…of which delivered' },
  { key: 'pending', label: 'Not confirmed yet', note: 'COD call due, or online not paid' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'returned', label: 'Returned' },
]

function OrdersBox({ o }: { o: OrdersReport }) {
  if (o.placed === 0)
    return <p className="text-sm text-muted-foreground">No orders placed in this period.</p>
  const salesTotal = o.byPaymentMethod.reduce((n, m) => n + m.orders, 0)
  const methodName = (m: string) => (m === 'COD' ? 'Cash on delivery' : 'Online (SSLCommerz)')
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <table className="w-full text-sm">
        <caption className="mb-1 text-left font-medium">{o.placed} placed</caption>
        <tbody>
          {OUTCOMES.map((r) => (
            <tr key={r.key} className="border-b border-border">
              <td className={`py-1.5 ${r.key === 'delivered' ? 'pl-4 text-muted-foreground' : ''}`}>
                {r.label}
                {r.note && <span className="block text-xs text-muted-foreground">{r.note}</span>}
              </td>
              <td className="py-1.5 text-right tabular-nums">{o.outcomes[r.key]}</td>
              <td className="py-1.5 text-right text-muted-foreground tabular-nums">
                {pctOf(o.outcomes[r.key], o.placed)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <SplitTable
        caption="Sales by payment"
        rows={o.byPaymentMethod.map((m) => ({
          key: m.method,
          name: methodName(m.method),
          orders: m.orders,
          revenue: m.revenue,
        }))}
        total={salesTotal}
      />
      <SplitTable
        caption="Sales by delivery zone"
        rows={o.byZone.map((z) => ({
          key: z.zone,
          name: z.zone,
          orders: z.orders,
          revenue: z.revenue,
        }))}
        total={salesTotal}
      />
    </div>
  )
}

function SplitTable({
  caption,
  rows,
  total,
}: {
  caption: string
  rows: { key: string; name: string; orders: number; revenue: string }[]
  total: number
}) {
  return (
    <table className="w-full text-sm">
      <caption className="mb-1 text-left font-medium">{caption}</caption>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td className="py-1.5 text-muted-foreground">No sales</td>
          </tr>
        )}
        {rows.map((r) => {
          const share = pctOf(r.orders, total)
          return (
            <tr key={r.key} className="border-b border-border align-top">
              <td className="py-1.5 pr-3">
                {r.name}
                <ShareBar share={share} label={`${share}% of sales orders`} />
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {r.orders}
                <span className="block text-xs text-muted-foreground">{share}%</span>
              </td>
              <td className="py-1.5 text-right tabular-nums">{formatBdt(r.revenue)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function CustomersBox({ c }: { c: CustomersReport }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        <strong>{c.customers}</strong> bought · <strong>{c.newCustomers}</strong> for the first time
        · <strong>{c.returningCustomers}</strong> had bought before ·{' '}
        <strong>{c.repeatRate}%</strong> ordered more than once in this period
      </p>
      {c.topCustomers.length > 0 && (
        <table className="w-full text-sm">
          <caption className="mb-1 text-left font-medium">Top customers by spend</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1.5 font-medium">Name</th>
              <th className="py-1.5 font-medium">Email</th>
              <th className="py-1.5 text-right font-medium">Orders</th>
              <th className="py-1.5 text-right font-medium">Spent</th>
            </tr>
          </thead>
          <tbody>
            {c.topCustomers.map((t) => (
              <tr key={t.email} className="border-b border-border">
                <td className="py-1.5 pr-3">
                  {t.userId ? (
                    <Link href={`/admin/customers/${t.userId}`} className="hover:underline">
                      {t.name}
                    </Link>
                  ) : (
                    <>
                      {t.name} <span className="text-xs text-muted-foreground">(guest)</span>
                    </>
                  )}
                </td>
                <td className="py-1.5 pr-3 break-all text-muted-foreground">{t.email}</td>
                <td className="py-1.5 text-right tabular-nums">{t.orders}</td>
                <td className="py-1.5 text-right tabular-nums">{formatBdt(t.spent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
