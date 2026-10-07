'use client'

import { Badge, Button } from '@nowoll/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { formatInstantDateTime } from '@/lib/date'
import { formatBdt } from '@/lib/format'
import { ORDER_STATUS, PAYMENT_METHOD, PAYMENT_STATUS } from '@/lib/order-labels'
import { fetchOrders, type OrderFilters } from '@/lib/orders-api'

// The admin order list (step 31a). Like the product list, the filters live in
// the page address: Back works, and a filtered list can be bookmarked (e.g.
// "COD orders to confirm" — the dashboard links here in step 31b).

const select = 'h-11 rounded-control border border-border-strong bg-surface px-3 text-sm'

export function OrderList({ filters }: { filters: OrderFilters }) {
  const router = useRouter()
  const key = JSON.stringify(filters)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the filters' value identity
  const load = useCallback(() => fetchOrders(filters), [key])
  const { state, retry } = useLoad(load)

  /** A new address with these filter changes; any change goes back to page 1. */
  const go = (change: Partial<OrderFilters>) => {
    const next = { ...filters, page: undefined, ...change }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(next))
      if (v !== undefined && v !== '' && !(k === 'page' && v === 1)) params.set(k, String(v))
    const query = params.toString()
    router.push(query ? `/admin/orders?${query}` : '/admin/orders')
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Orders</h1>
      <Filters key={filters.q ?? ''} filters={filters} onChange={go} />
      <Panel title="All orders" state={state} retry={retry}>
        {(data) =>
          data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No orders match these filters.</p>
          ) : (
            <>
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 font-medium">Order</th>
                      <th className="py-2 font-medium">Placed</th>
                      <th className="py-2 font-medium">Customer</th>
                      <th className="py-2 font-medium">Status</th>
                      <th className="py-2 font-medium">Payment</th>
                      <th className="py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((o) => (
                      <tr key={o.id} className="border-b border-border align-top">
                        <td className="py-2.5">
                          <Link
                            href={`/admin/orders/${o.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {o.number}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {o.itemCount} item{o.itemCount === 1 ? '' : 's'}
                          </span>
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          {formatInstantDateTime(o.createdAt)}
                        </td>
                        <td className="py-2.5">
                          {o.customerName}
                          <span className="block text-xs text-muted-foreground">
                            {o.phone} · {o.district}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <Badge variant={ORDER_STATUS[o.status].variant}>
                            {ORDER_STATUS[o.status].label}
                          </Badge>
                        </td>
                        <td className="py-2.5">
                          <Badge variant={PAYMENT_STATUS[o.paymentStatus].variant}>
                            {PAYMENT_STATUS[o.paymentStatus].label}
                          </Badge>
                          <span className="block text-xs text-muted-foreground">
                            {o.paymentMethod === 'COD' ? 'Cash on delivery' : 'Online'}
                          </span>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{formatBdt(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <nav
                aria-label="Pages"
                className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <span className="text-muted-foreground">
                  {data.total} order{data.total === 1 ? '' : 's'} · page {data.page} of{' '}
                  {Math.max(1, data.totalPages)}
                </span>
                <span className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={data.page <= 1}
                    onClick={() => go({ page: data.page - 1 })}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={data.page >= data.totalPages}
                    onClick={() => go({ page: data.page + 1 })}
                  >
                    Next
                  </Button>
                </span>
              </nav>
            </>
          )
        }
      </Panel>
    </div>
  )
}

function Filters({
  filters,
  onChange,
}: {
  filters: OrderFilters
  onChange: (change: Partial<OrderFilters>) => void
}) {
  const [q, setQ] = useState(filters.q ?? '')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onChange({ q: q.trim() || undefined })
  }
  return (
    <div className="flex flex-wrap items-end gap-3">
      <form role="search" onSubmit={submit} className="flex gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Search
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="NW-10001, name, phone, email"
            className={`${select} w-64`}
          />
        </label>
        <Button type="submit" variant="secondary" className="self-end">
          Search
        </Button>
      </form>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Status
        <select
          className={select}
          value={filters.status ?? ''}
          onChange={(e) => onChange({ status: e.target.value || undefined })}
        >
          <option value="">Any status</option>
          {Object.entries(ORDER_STATUS).map(([value, s]) => (
            <option key={value} value={value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Payment method
        <select
          className={select}
          value={filters.paymentMethod ?? ''}
          onChange={(e) =>
            onChange({
              paymentMethod: (e.target.value || undefined) as OrderFilters['paymentMethod'],
            })
          }
        >
          <option value="">Any method</option>
          {Object.entries(PAYMENT_METHOD).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Payment
        <select
          className={select}
          value={filters.paymentStatus ?? ''}
          onChange={(e) => onChange({ paymentStatus: e.target.value || undefined })}
        >
          <option value="">Any payment</option>
          {Object.entries(PAYMENT_STATUS).map(([value, s]) => (
            <option key={value} value={value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        From
        <input
          type="date"
          className={select}
          value={filters.from ?? ''}
          onChange={(e) => onChange({ from: e.target.value || undefined })}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        To
        <input
          type="date"
          className={select}
          value={filters.to ?? ''}
          onChange={(e) => onChange({ to: e.target.value || undefined })}
        />
      </label>
    </div>
  )
}
