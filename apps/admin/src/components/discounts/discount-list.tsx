'use client'

import type { AdminDiscountRow } from '@nowoll/types'
import { Badge, Button } from '@nowoll/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { DISCOUNT_STATUS, describeDiscount } from '@/lib/discount-labels'
import { type DiscountFilters, fetchDiscounts } from '@/lib/discounts-api'
import { formatBdt } from '@/lib/format'
import { firstDayOf, lastDayOf } from '@/lib/store-days'

const select = 'h-11 rounded-control border border-border-strong bg-surface px-3 text-sm'

/** A row's sentence ("10% off orders of ৳2,000 or more, …"). */
export const describeRow = (d: AdminDiscountRow) =>
  describeDiscount({
    type: d.type,
    value: Number(d.value),
    minOrderAmount: d.minOrderAmount === null ? null : Number(d.minOrderAmount),
    maxDiscountAmount: d.maxDiscountAmount === null ? null : Number(d.maxDiscountAmount),
    usageLimit: d.usageLimit,
    usageLimitPerCustomer: d.usageLimitPerCustomer,
    firstDay: d.startsAt ? firstDayOf(d.startsAt) : null,
    lastDay: d.expiresAt ? lastDayOf(d.expiresAt) : null,
  })

export function DiscountList({ filters }: { filters: DiscountFilters }) {
  const router = useRouter()
  const key = JSON.stringify(filters)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the filters' value identity
  const load = useCallback(() => fetchDiscounts(filters), [key])
  const { state, retry } = useLoad(load)
  const [q, setQ] = useState(filters.q ?? '')

  const go = (change: Partial<DiscountFilters>) => {
    const next = { ...filters, page: undefined, ...change }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(next))
      if (v !== undefined && v !== '' && !(k === 'page' && v === 1)) params.set(k, String(v))
    const query = params.toString()
    router.push(query ? `/admin/discounts?${query}` : '/admin/discounts')
  }
  const search = (e: FormEvent) => {
    e.preventDefault()
    go({ q: q.trim() || undefined })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Discount codes</h1>
        <Link
          href="/admin/discounts/new"
          className="inline-flex h-11 items-center rounded-control bg-brand px-5 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
        >
          New code
        </Link>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <form role="search" onSubmit={search} className="flex gap-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Search
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Code"
              className={`${select} w-48`}
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
            onChange={(e) =>
              go({ status: (e.target.value || undefined) as DiscountFilters['status'] })
            }
          >
            <option value="">Any status</option>
            {Object.entries(DISCOUNT_STATUS).map(([value, s]) => (
              <option key={value} value={value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Panel title="Codes" state={state} retry={retry}>
        {(data) =>
          data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No codes match these filters.</p>
          ) : (
            <>
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 font-medium">Code</th>
                      <th className="py-2 font-medium">Status</th>
                      <th className="py-2 text-right font-medium">Used</th>
                      <th className="py-2 text-right font-medium">Discount given</th>
                      <th className="py-2 text-right font-medium">Sales with it</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((d) => (
                      <tr key={d.id} className="border-b border-border align-top">
                        <td className="py-2.5">
                          <Link
                            href={`/admin/discounts/${d.id}`}
                            className="font-mono font-medium underline-offset-4 hover:underline"
                          >
                            {d.code}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {describeRow(d)}
                          </span>
                          {d.description && (
                            <span className="block text-xs text-muted-foreground">
                              {d.description}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <Badge variant={DISCOUNT_STATUS[d.status].variant}>
                            {DISCOUNT_STATUS[d.status].label}
                          </Badge>
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {d.usedCount}
                          {d.usageLimit !== null && ` / ${d.usageLimit}`}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {formatBdt(d.totalDiscounted)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">
                          {formatBdt(d.salesTotal)}
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
                  {data.total} code{data.total === 1 ? '' : 's'} · page {data.page} of{' '}
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
