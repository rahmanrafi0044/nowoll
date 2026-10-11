'use client'

import { Button, Input } from '@nowoll/ui'
import { type MenuItem, mainMenuSchema } from '@nowoll/validation'
import { useEffect, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { SelectField } from '@/components/form-fields'
import { flattenCategories } from '@/lib/categories'
import {
  type AdminContentBlock,
  clearContentBlock,
  fetchContentBlock,
  saveContentBlock,
} from '@/lib/content-api'
import { type CategoryNode, fetchShopCategories } from '@/lib/products-api'
import { LinkInput, SaveProblems } from './fields'
import { move } from './layout-editor'

// ============================================================================
// Admin → Content → Menu (step 38b): the header menu, desktop and phone.
// A FLAT, ordered list — no drop-downs (a new layout is developer-side).
// Categories are kept by id: renaming one keeps the menu right, and a hidden
// or archived one simply isn't shown. Nothing saved → "Shop all" + the
// top-level categories, which is where this editor starts.
// ============================================================================

const KIND_LABEL: Record<MenuItem['kind'], string> = {
  shop_all: 'Shop all',
  category: 'Category',
  link: 'Custom link',
}

const newId = () => `item-${Math.random().toString(36).slice(2, 8)}`

const newItem = (kind: MenuItem['kind']): MenuItem =>
  kind === 'link'
    ? { id: newId(), kind, label: '', href: '' }
    : kind === 'category'
      ? { id: newId(), kind, categoryId: '', label: null }
      : { id: newId(), kind, label: null }

/** Today's menu as items — the starting point when nothing is saved. */
const standardMenu = (categories: CategoryNode[]): MenuItem[] => [
  { id: 'shop-all', kind: 'shop_all', label: null },
  ...categories.map((c): MenuItem => ({
    id: `c-${c.id}`,
    kind: 'category',
    categoryId: c.id,
    label: null,
  })),
]

function findName(nodes: CategoryNode[], id: string): string | null {
  for (const n of nodes) {
    if (n.id === id) return n.name
    const found = findName(n.children ?? [], id)
    if (found) return found
  }
  return null
}

/** The saved menu and the visible categories, loaded together. */
async function loadMenu() {
  const [block, categories] = await Promise.all([
    fetchContentBlock('main_menu'),
    fetchShopCategories(),
  ])
  if (!block.ok) return block
  if (!categories.ok) return categories
  return { ok: true as const, data: { block: block.data, categories: categories.data } }
}

export function MenuEditor() {
  const { state, retry, refresh } = useLoad(loadMenu)
  return (
    <Panel title="Menu" state={state} retry={retry} className="border-0 bg-transparent p-0">
      {({ block, categories }) => (
        <MenuForm
          key={block.updatedAt ?? 'new'}
          block={block}
          tree={categories}
          onReset={refresh}
        />
      )}
    </Panel>
  )
}

export function MenuForm({
  block,
  tree,
  onReset,
}: {
  block: AdminContentBlock
  tree: CategoryNode[]
  onReset: () => void
}) {
  const saved = block.data ? mainMenuSchema.safeParse(block.data) : null
  const initial = saved?.success ? saved.data.items : standardMenu(tree)
  const [items, setItems] = useState<MenuItem[]>(initial)
  const [adding, setAdding] = useState<MenuItem['kind'] | ''>('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ message: string; details?: string[] } | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const dirty = JSON.stringify(items) !== JSON.stringify(initial)
  const options = flattenCategories(tree)

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const change = (next: MenuItem[]) => {
    setDone(null)
    setItems(next)
  }
  const update = (i: number, item: MenuItem) => change(items.map((x, j) => (j === i ? item : x)))
  const shown = (item: MenuItem) =>
    item.kind === 'shop_all'
      ? item.label || 'Shop all'
      : item.kind === 'category'
        ? item.label || findName(tree, item.categoryId)
        : item.label

  async function save() {
    const check = mainMenuSchema.safeParse({ items })
    if (!check.success)
      return setProblem({
        message: 'Some menu items need fixing:',
        details: check.error.issues.map((i) => {
          const n = typeof i.path[1] === 'number' ? `Item ${i.path[1] + 1}: ` : ''
          return `${n}${i.message}`
        }),
      })
    setBusy(true)
    setProblem(null)
    const r = await saveContentBlock('main_menu', check.data, true)
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setDone('Saved. The shop shows it within a minute.')
  }

  async function reset() {
    setConfirmReset(false)
    setBusy(true)
    const r = await clearContentBlock('main_menu')
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    onReset()
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">Menu</h1>
      <p className="text-sm text-muted-foreground">
        The links in the shop’s header (and the ☰ menu on phones), left to right. A hidden or
        archived category is skipped automatically.
      </p>

      <section aria-label="Menu preview" className="rounded-lg border border-border bg-surface p-4">
        <p className="mb-2 text-xs text-muted-foreground">Preview</p>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-medium">
          {items
            .filter((it) => shown(it))
            .map((it) => (
              <li key={it.id}>{shown(it)}</li>
            ))}
        </ul>
      </section>

      <ol className="flex flex-col gap-3">
        {items.map((it, i) => (
          <li key={it.id} className="rounded-lg border border-border p-4">
            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">{`${i + 1}. ${KIND_LABEL[it.kind]}`}</legend>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto font-medium">
                  {i + 1}. {KIND_LABEL[it.kind]}
                  {it.kind === 'category' && it.categoryId && !findName(tree, it.categoryId) && (
                    <span className="ml-2 text-xs text-warning">
                      (hidden or archived — not shown)
                    </span>
                  )}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={i === 0}
                  aria-label={`Move ${shown(it) || KIND_LABEL[it.kind]} up`}
                  onClick={() => change(move(items, i, -1))}
                >
                  ↑
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={i === items.length - 1}
                  aria-label={`Move ${shown(it) || KIND_LABEL[it.kind]} down`}
                  onClick={() => change(move(items, i, 1))}
                >
                  ↓
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${shown(it) || KIND_LABEL[it.kind]}`}
                  onClick={() => change(items.filter((_, j) => j !== i))}
                >
                  Remove
                </Button>
              </div>
              {it.kind === 'category' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label="Category"
                    value={it.categoryId}
                    onChange={(e) => update(i, { ...it, categoryId: e.target.value })}
                  >
                    <option value="">Choose…</option>
                    {options.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </SelectField>
                  <Input
                    label="Label (optional)"
                    value={it.label ?? ''}
                    maxLength={30}
                    placeholder={findName(tree, it.categoryId) ?? ''}
                    onChange={(e) => update(i, { ...it, label: e.target.value || null })}
                  />
                </div>
              )}
              {it.kind === 'shop_all' && (
                <Input
                  label="Label (optional)"
                  value={it.label ?? ''}
                  maxLength={30}
                  placeholder="Shop all"
                  onChange={(e) => update(i, { ...it, label: e.target.value || null })}
                />
              )}
              {it.kind === 'link' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Label"
                    value={it.label}
                    maxLength={30}
                    placeholder="Sale"
                    onChange={(e) => update(i, { ...it, label: e.target.value })}
                  />
                  <LinkInput
                    label="Link"
                    value={it.href}
                    onChange={(v) => update(i, { ...it, href: v })}
                  />
                </div>
              )}
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-end gap-2">
        <SelectField
          label="Add a menu item"
          value={adding}
          onChange={(e) => setAdding(e.target.value as MenuItem['kind'] | '')}
        >
          <option value="">Choose…</option>
          <option value="category">Category</option>
          <option value="link">Custom link</option>
          <option value="shop_all">Shop all</option>
        </SelectField>
        <Button
          variant="secondary"
          disabled={!adding || items.length >= 12}
          onClick={() => {
            if (!adding) return
            change([...items, newItem(adding)])
            setAdding('')
          }}
        >
          Add
        </Button>
        {items.length >= 12 && (
          <span className="text-sm text-muted-foreground">At most 12 items.</span>
        )}
      </div>

      <SaveProblems problem={problem} />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || (!dirty && Boolean(block.data))} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save menu'}
        </Button>
        {dirty && <span className="text-sm text-warning">Unsaved changes</span>}
        {done && (
          <span role="status" className="text-sm text-success">
            {done}
          </span>
        )}
        {Boolean(block.data) && !confirmReset && (
          <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
            Reset to the standard menu
          </Button>
        )}
      </div>
      {confirmReset && (
        <div
          role="group"
          aria-label="Confirm resetting the menu"
          className="flex flex-wrap items-center gap-3 rounded-control border border-border p-3 text-sm"
        >
          <span className="mr-auto">
            Go back to “Shop all” + every top-level category? Your menu items are removed.
          </span>
          <Button variant="secondary" size="sm" onClick={() => setConfirmReset(false)}>
            Keep my menu
          </Button>
          <Button size="sm" onClick={() => void reset()}>
            Yes, reset
          </Button>
        </div>
      )}
    </div>
  )
}
