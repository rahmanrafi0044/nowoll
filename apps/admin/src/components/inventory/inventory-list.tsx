'use client'

import { Button } from '@nowoll/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { fetchInventory, type InventoryFilters } from '@/lib/inventory-api'
import { type CategoryNode, fetchCategories } from '@/lib/products-api'
import { StockTable } from './stock-table'

// Every variant's stock (step 33). Filters live in the page address.

const select = 'h-11 rounded-control border border-border-strong bg-surface px-3 text-sm'

export function InventoryList({ filters }: { filters: InventoryFilters }) {
  const router = useRouter()
  const key = JSON.stringify(filters)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the filters' value identity
  const load = useCallback(() => fetchInventory(filters), [key])
  const { state, retry, refresh } = useLoad(load)
  const categories = useLoad(fetchCategories)

  const go = (change: Partial<InventoryFilters>) => {
    const next = { ...filters, page: undefined, ...change }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(next))
      if (
        v !== undefined &&
        v !== '' &&
        !(k === 'page' && v === 1) &&
        !(k === 'sort' && v === 'stock_asc')
      )
        params.set(k, String(v))
    const query = params.toString()
    router.push(query ? `/admin/inventory?${query}` : '/admin/inventory')
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <Link
          href="/admin/inventory/low-stock"
          className="text-sm font-medium underline underline-offset-4"
        >
          Low stock →
        </Link>
      </div>
      <Filters
        key={filters.q ?? ''}
        filters={filters}
        categories={categories.state.status === 'ok' ? categories.state.data : []}
        onChange={go}
      />
      <Panel title="Stock" state={state} retry={retry}>
        {(data) =>
          data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing matches these filters.</p>
          ) : (
            <>
              <StockTable rows={data.items} onChanged={refresh} />
              <nav
                aria-label="Pages"
                className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <span className="text-muted-foreground">
                  {data.total} variant{data.total === 1 ? '' : 's'} · page {data.page} of{' '}
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
  categories,
  onChange,
}: {
  filters: InventoryFilters
  categories: CategoryNode[]
  onChange: (change: Partial<InventoryFilters>) => void
}) {
  const [q, setQ] = useState(filters.q ?? '')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onChange({ q: q.trim() || undefined })
  }
  // The inventory API filters by category SLUG (the label is "Men › Shirts").
  const options = categoryOptions(categories)
  return (
    <div className="flex flex-wrap items-end gap-3">
      <form role="search" onSubmit={submit} className="flex gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Search
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Product or SKU"
            className={`${select} w-56`}
          />
        </label>
        <Button type="submit" variant="secondary" className="self-end">
          Search
        </Button>
      </form>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Category
        <select
          className={select}
          value={filters.category ?? ''}
          onChange={(e) => onChange({ category: e.target.value || undefined })}
        >
          <option value="">All categories</option>
          {options.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Sort
        <select
          className={select}
          value={filters.sort ?? 'stock_asc'}
          onChange={(e) => onChange({ sort: e.target.value as InventoryFilters['sort'] })}
        >
          <option value="stock_asc">Least stock first</option>
          <option value="stock_desc">Most stock first</option>
          <option value="name">Product A–Z</option>
        </select>
      </label>
      <label className="flex h-11 items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4"
          checked={filters.stock === 'out'}
          onChange={(e) => onChange({ stock: e.target.checked ? 'out' : undefined })}
        />
        Sold out only
      </label>
    </div>
  )
}

/** The category tree as { slug, "Men › Shirts" } options. */
function categoryOptions(nodes: CategoryNode[], prefix = ''): { slug: string; label: string }[] {
  return nodes.flatMap((n) => [
    ...(n.slug ? [{ slug: n.slug, label: `${prefix}${n.name}` }] : []),
    ...categoryOptions(n.children ?? [], `${prefix}${n.name} › `),
  ])
}
