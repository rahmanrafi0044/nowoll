'use client'

import { Badge, Button } from '@nowoll/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { formatInstantDateTime } from '@/lib/date'
import { formatBdt } from '@/lib/format'
import { RETURN_REASON, RETURN_STATUS, RETURN_TABS } from '@/lib/return-labels'
import { fetchReturns, type ReturnFilters } from '@/lib/returns-api'

// ============================================================================
// The returns queue (step 35). Tabs follow the work: to decide → waiting for
// the parcel → to refund. Oldest first — whoever asked first is served first.
// It opens on "To decide"; the tab and search live in the page address.
// ============================================================================

export function ReturnList({ filters, all }: { filters: ReturnFilters; all: boolean }) {
  const router = useRouter()
  const key = JSON.stringify(filters)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the filters' value identity
  const load = useCallback(() => fetchReturns(filters), [key])
  const { state, retry } = useLoad(load)
  const [q, setQ] = useState(filters.q ?? '')

  const href = (change: { status?: string; q?: string; page?: number }) => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(change))
      if (v !== undefined && v !== '' && !(k === 'page' && v === 1)) params.set(k, String(v))
    const query = params.toString()
    return query ? `/admin/returns?${query}` : '/admin/returns'
  }
  const current = all ? 'all' : filters.status
  const search = (e: FormEvent) => {
    e.preventDefault()
    router.push(href({ q: q.trim() || undefined, status: q.trim() ? 'all' : current }))
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Returns</h1>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav aria-label="Return stages" className="flex flex-wrap gap-1">
          {RETURN_TABS.map((t) => {
            const value = t.status ?? 'all'
            const active = current === value
            return (
              <Link
                key={value}
                href={href({ status: value === 'REQUESTED' ? undefined : value })}
                aria-current={active ? 'page' : undefined}
                className={`rounded-control px-3 py-2 text-sm ${active ? 'bg-brand font-medium text-brand-foreground' : 'text-muted-foreground hover:bg-surface-muted'}`}
              >
                {t.label}
              </Link>
            )
          })}
        </nav>
        <form role="search" onSubmit={search} className="flex gap-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Order number
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="NW-10001"
              className="h-11 w-40 rounded-control border border-border-strong bg-surface px-3 text-sm"
            />
          </label>
          <Button type="submit" variant="secondary" className="self-end">
            Search
          </Button>
        </form>
      </div>
      <Panel title="Return requests" state={state} retry={retry}>
        {(data) =>
          data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {filters.q ? 'No return for that order number.' : 'Nothing here right now.'}
            </p>
          ) : (
            <>
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 font-medium">Order</th>
                      <th className="py-2 font-medium">Customer</th>
                      <th className="py-2 font-medium">Items</th>
                      <th className="py-2 font-medium">Reason</th>
                      <th className="py-2 font-medium">Status</th>
                      <th className="py-2 text-right font-medium">Refund</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((r) => (
                      <tr key={r.id} className="border-b border-border align-top">
                        <td className="py-2.5">
                          <Link
                            href={`/admin/returns/${r.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            Return of {r.orderNumber}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            Asked {formatInstantDateTime(r.createdAt)}
                          </span>
                        </td>
                        <td className="py-2.5">
                          {r.customer.name ?? r.customer.email}
                          <span className="block text-xs text-muted-foreground">
                            {r.customer.phone}
                          </span>
                        </td>
                        <td className="py-2.5">
                          {r.items
                            .map((i) => `${i.quantity} × ${i.productName} (${i.variantLabel})`)
                            .join(', ')}
                        </td>
                        <td className="py-2.5">{RETURN_REASON[r.reason]}</td>
                        <td className="py-2.5">
                          <Badge variant={RETURN_STATUS[r.status].variant}>
                            {RETURN_STATUS[r.status].label}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {r.refundAmount ? (
                            formatBdt(r.refundAmount)
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
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
                  {data.total} return{data.total === 1 ? '' : 's'} · page {data.page} of{' '}
                  {Math.max(1, data.totalPages)}
                </span>
                <span className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={data.page <= 1}
                    onClick={() =>
                      router.push(
                        href({
                          status: current === 'REQUESTED' ? undefined : current,
                          q: filters.q,
                          page: data.page - 1,
                        }),
                      )
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={data.page >= data.totalPages}
                    onClick={() =>
                      router.push(
                        href({
                          status: current === 'REQUESTED' ? undefined : current,
                          q: filters.q,
                          page: data.page + 1,
                        }),
                      )
                    }
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
