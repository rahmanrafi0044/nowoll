'use client'

import { Badge, Button } from '@nowoll/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { formatInstantDate } from '@/lib/date'
import { formatBdt } from '@/lib/format'
import { type CustomerFilters, fetchCustomers } from '@/lib/customers-api'

// Customer ACCOUNTS (step 32). Guest buyers have no account — find their
// orders on the Orders page by email or phone. Filters live in the address.

const select = 'h-11 rounded-control border border-border-strong bg-surface px-3 text-sm'

export function CustomerList({ filters }: { filters: CustomerFilters }) {
  const router = useRouter()
  const key = JSON.stringify(filters)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the filters' value identity
  const load = useCallback(() => fetchCustomers(filters), [key])
  const { state, retry } = useLoad(load)

  const go = (change: Partial<CustomerFilters>) => {
    const next = { ...filters, page: undefined, ...change }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(next))
      if (
        v !== undefined &&
        v !== '' &&
        !(k === 'page' && v === 1) &&
        !(k === 'sort' && v === 'newest')
      )
        params.set(k, String(v))
    const query = params.toString()
    router.push(query ? `/admin/customers?${query}` : '/admin/customers')
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">Customers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          People with a shop account. Guest orders: search the Orders page by email or phone.
        </p>
      </div>
      <Filters key={filters.q ?? ''} filters={filters} onChange={go} />
      <Panel title="All customers" state={state} retry={retry}>
        {(data) =>
          data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No customers match these filters.</p>
          ) : (
            <>
              <div className="-mx-5 overflow-x-auto px-5">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="py-2 font-medium">Customer</th>
                      <th className="py-2 font-medium">Joined</th>
                      <th className="py-2 text-right font-medium">Orders</th>
                      <th className="py-2 text-right font-medium">Spent</th>
                      <th className="py-2 font-medium">Last order</th>
                      <th className="py-2 font-medium">Account</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((c) => (
                      <tr key={c.id} className="border-b border-border align-top">
                        <td className="py-2.5">
                          <Link
                            href={`/admin/customers/${c.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {c.name ?? c.email}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            {c.email}
                            {c.phone && ` · ${c.phone}`}
                          </span>
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          {formatInstantDate(c.joinedAt)}
                        </td>
                        <td className="py-2.5 text-right tabular-nums">{c.orderCount}</td>
                        <td className="py-2.5 text-right tabular-nums">
                          {formatBdt(c.totalSpent)}
                        </td>
                        <td className="py-2.5 text-muted-foreground">
                          {c.lastOrderAt ? formatInstantDate(c.lastOrderAt) : '—'}
                        </td>
                        <td className="py-2.5">
                          <Badge variant={c.status === 'BANNED' ? 'danger' : 'success'}>
                            {c.status === 'BANNED' ? 'Banned' : 'Active'}
                          </Badge>
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
                  {data.total} customer{data.total === 1 ? '' : 's'} · page {data.page} of{' '}
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
  filters: CustomerFilters
  onChange: (change: Partial<CustomerFilters>) => void
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
            placeholder="Name, email or phone"
            className={`${select} w-64`}
          />
        </label>
        <Button type="submit" variant="secondary" className="self-end">
          Search
        </Button>
      </form>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Account
        <select
          className={select}
          value={filters.status ?? ''}
          onChange={(e) =>
            onChange({ status: (e.target.value || undefined) as CustomerFilters['status'] })
          }
        >
          <option value="">Active and banned</option>
          <option value="ACTIVE">Active</option>
          <option value="BANNED">Banned</option>
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Sort
        <select
          className={select}
          value={filters.sort ?? 'newest'}
          onChange={(e) => onChange({ sort: e.target.value as CustomerFilters['sort'] })}
        >
          <option value="newest">Newest first</option>
          <option value="spent">Most spent</option>
          <option value="orders">Most orders</option>
          <option value="name">Name A–Z</option>
        </select>
      </label>
    </div>
  )
}
