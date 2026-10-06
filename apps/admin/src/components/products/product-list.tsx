'use client'

import type { AdminProductRow, BulkProductAction, BulkProductResult } from '@nowoll/types'
import { Badge, type BadgeVariant, Button } from '@nowoll/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { flattenCategories } from '@/lib/categories'
import { formatInstantDate } from '@/lib/date'
import { formatBdt } from '@/lib/format'
import {
  bulkProducts,
  type CategoryNode,
  exportProductsCsv,
  fetchCategories,
  fetchProducts,
  type ProductFilters,
} from '@/lib/products-api'
import { BulkBar } from './bulk-bar'
import { ProductThumb } from './product-thumb'

// ============================================================================
// The admin product list (step 30a). The filters live in the page address
// (?q=…&status=…), so Back works, a reload keeps them, and a filtered list
// can be bookmarked. Changing a filter = a new address = the page passes new
// `filters` down and the list reloads.
// ============================================================================

const STATUS_OPTIONS = [
  { value: '', label: 'Live and drafts' },
  { value: 'ACTIVE', label: 'Live' },
  { value: 'DRAFT', label: 'Drafts' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: 'all', label: 'Everything' },
] as const
const SORT_OPTIONS = [
  { value: 'updated', label: 'Recently changed' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
] as const
const STATUS_BADGE: Record<AdminProductRow['status'], { label: string; variant: BadgeVariant }> = {
  ACTIVE: { label: 'Live', variant: 'success' },
  DRAFT: { label: 'Draft', variant: 'neutral' },
  ARCHIVED: { label: 'Archived', variant: 'warning' },
}
const DONE: Record<BulkProductAction, string> = {
  publish: 'published',
  unpublish: 'moved to draft',
  feature: 'featured',
  unfeature: 'unfeatured',
  archive: 'archived',
}

export function ProductList({ filters }: { filters: ProductFilters }) {
  const router = useRouter()
  const key = JSON.stringify(filters)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the filters' value identity
  const load = useCallback(() => fetchProducts(filters), [key])
  const { state, retry } = useLoad(load)
  const categories = useLoad(fetchCategories)
  // The ticked products belong to ONE set of filters: change the filters and
  // nothing is ticked any more (no hidden products stay selected).
  const [selection, setSelection] = useState({ key, ids: new Set<string>() })
  const selected = selection.key === key ? selection.ids : new Set<string>()
  const setSelected = (update: Set<string> | ((s: Set<string>) => Set<string>)) =>
    setSelection((prev) => ({
      key,
      ids: typeof update === 'function' ? update(prev.key === key ? prev.ids : new Set()) : update,
    }))
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<BulkProductResult | { error: string } | null>(null)
  const [exportProblem, setExportProblem] = useState<string | null>(null)

  /** A new address with these filter changes; any change goes back to page 1. */
  const go = (change: Partial<ProductFilters>) => {
    const next = { ...filters, page: undefined, ...change }
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(next))
      if (v !== undefined && v !== '' && v !== false && !(k === 'page' && v === 1))
        params.set(k, String(v))
    const query = params.toString()
    router.push(query ? `/admin/products?${query}` : '/admin/products')
  }

  async function runBulk(action: BulkProductAction) {
    setBusy(true)
    setOutcome(null)
    const r = await bulkProducts(action, [...selected])
    setBusy(false)
    if (!r.ok) return setOutcome({ error: r.message })
    setOutcome(r.data)
    setSelected(new Set(r.data.failed.map((f) => f.id))) // keep the ones that didn't work ticked
    retry()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Products</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={async () => {
              setExportProblem(null)
              const r = await exportProductsCsv()
              if (!r.ok) setExportProblem(r.message)
            }}
          >
            Export CSV
          </Button>
          <Link
            href="/admin/products/new"
            className="inline-flex h-11 items-center rounded-control bg-brand px-5 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
          >
            New product
          </Link>
          <Link
            href="/admin/products/import"
            className="inline-flex h-11 items-center rounded-control border border-border-strong bg-surface px-5 text-sm font-medium hover:bg-surface-muted"
          >
            Import CSV
          </Link>
        </div>
      </div>
      {exportProblem && (
        <p role="alert" className="text-sm text-danger">
          Export failed: {exportProblem}
        </p>
      )}

      <Filters
        key={filters.q ?? ''} // a new search → the box shows it (e.g. after Back)
        filters={filters}
        categories={categories.state.status === 'ok' ? categories.state.data : []}
        onChange={go}
      />

      {selected.size > 0 && (
        <BulkBar
          count={selected.size}
          busy={busy}
          onAction={runBulk}
          onClear={() => setSelected(new Set())}
        />
      )}
      {outcome && <Outcome outcome={outcome} onClose={() => setOutcome(null)} />}

      <Panel title="All products" state={state} retry={retry}>
        {(data) =>
          data.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products match these filters.</p>
          ) : (
            <>
              <ProductTable
                rows={data.items}
                selected={selected}
                onToggle={(id) =>
                  setSelected((s) => {
                    const next = new Set(s)
                    if (next.has(id)) next.delete(id)
                    else next.add(id)
                    return next
                  })
                }
                onToggleAll={(all) =>
                  setSelected(all ? new Set(data.items.map((p) => p.id)) : new Set())
                }
              />
              <nav
                aria-label="Pages"
                className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <span className="text-muted-foreground">
                  {data.total} product{data.total === 1 ? '' : 's'} · page {data.page} of{' '}
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
  filters: ProductFilters
  categories: CategoryNode[]
  onChange: (change: Partial<ProductFilters>) => void
}) {
  const [q, setQ] = useState(filters.q ?? '')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    onChange({ q: q.trim() || undefined })
  }
  const select = 'h-11 rounded-control border border-border-strong bg-surface px-3 text-sm'
  return (
    <div className="flex flex-wrap items-end gap-3">
      <form role="search" onSubmit={submit} className="flex gap-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Search
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name or SKU"
            className={`${select} w-56`}
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
            onChange({ status: (e.target.value || undefined) as ProductFilters['status'] })
          }
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Category
        <select
          className={select}
          value={filters.categoryId ?? ''}
          onChange={(e) => onChange({ categoryId: e.target.value || undefined })}
        >
          <option value="">All categories</option>
          {flattenCategories(categories).map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Sort
        <select
          className={select}
          value={filters.sort ?? 'updated'}
          onChange={(e) =>
            onChange({
              sort:
                e.target.value === 'updated'
                  ? undefined
                  : (e.target.value as ProductFilters['sort']),
            })
          }
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex h-11 items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4"
          checked={filters.lowStock ?? false}
          onChange={(e) => onChange({ lowStock: e.target.checked || undefined })}
        />
        Low stock only
      </label>
    </div>
  )
}

function ProductTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
}: {
  rows: AdminProductRow[]
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (all: boolean) => void
}) {
  const allTicked = rows.every((r) => selected.has(r.id))
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="w-8 py-2">
              <input
                type="checkbox"
                className="size-4"
                aria-label="Select all products on this page"
                checked={allTicked}
                onChange={(e) => onToggleAll(e.target.checked)}
              />
            </th>
            <th className="py-2 font-medium" colSpan={2}>
              Product
            </th>
            <th className="py-2 font-medium">Status</th>
            <th className="py-2 font-medium">Category</th>
            <th className="py-2 text-right font-medium">Price</th>
            <th className="py-2 text-right font-medium">Stock</th>
            <th className="py-2 text-right font-medium">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-b border-border align-middle">
              <td className="py-2">
                <input
                  type="checkbox"
                  className="size-4"
                  aria-label={`Select ${p.name}`}
                  checked={selected.has(p.id)}
                  onChange={() => onToggle(p.id)}
                />
              </td>
              <td className="w-14 py-2">
                <ProductThumb image={p.image} />
              </td>
              <td className="py-2">
                <Link
                  href={`/admin/products/${p.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {p.name}
                </Link>
                {p.isFeatured && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    <span aria-hidden="true">★ </span>Featured
                  </span>
                )}
                <span className="block text-xs text-muted-foreground">{p.slug}</span>
                {p.status === 'DRAFT' && !p.publishable && (
                  <span className="block text-xs text-warning">{missing(p)}</span>
                )}
              </td>
              <td className="py-2">
                <Badge variant={STATUS_BADGE[p.status].variant}>
                  {STATUS_BADGE[p.status].label}
                </Badge>
              </td>
              <td className="py-2">{p.category.name}</td>
              <td className="py-2 text-right tabular-nums">
                {formatBdt(p.basePrice)}
                {p.compareAtPrice && (
                  <span className="block text-xs text-muted-foreground line-through">
                    {formatBdt(p.compareAtPrice)}
                  </span>
                )}
              </td>
              <td className="py-2 text-right tabular-nums">
                {p.variantCount === 0 ? (
                  <span className="text-muted-foreground">No variants</span>
                ) : (
                  <>
                    {p.totalStock}
                    {p.lowStockVariants > 0 && (
                      <span className="block text-xs text-danger">{p.lowStockVariants} low</span>
                    )}
                  </>
                )}
              </td>
              <td className="py-2 text-right text-muted-foreground">
                {formatInstantDate(p.updatedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Outcome({
  outcome,
  onClose,
}: {
  outcome: BulkProductResult | { error: string }
  onClose: () => void
}) {
  const failed = 'error' in outcome ? [] : outcome.failed
  return (
    <div
      role="status"
      className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm"
    >
      <div>
        {'error' in outcome ? (
          <p className="text-danger">{outcome.error}</p>
        ) : (
          <>
            {outcome.succeeded.length > 0 && (
              <p>
                {outcome.succeeded.length} product{outcome.succeeded.length === 1 ? '' : 's'}{' '}
                {DONE[outcome.action]}.
              </p>
            )}
            {failed.length > 0 && (
              <>
                <p className="text-danger">
                  {failed.length} couldn’t be {DONE[outcome.action]} (still selected):
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {failed.map((f) => (
                    <li key={f.id}>
                      <span className="font-medium">{f.name ?? 'Unknown product'}</span> —{' '}
                      {f.reason}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
      <Button variant="ghost" size="sm" onClick={onClose}>
        Dismiss
      </Button>
    </div>
  )
}

/** What a draft still needs before it can go live. */
function missing(p: AdminProductRow): string {
  const needs = [p.variantCount === 0 && 'a variant', p.imageCount === 0 && 'a photo'].filter(
    Boolean,
  )
  return `Needs ${needs.join(' and ')} before it can go live`
}
