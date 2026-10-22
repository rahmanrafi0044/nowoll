'use client'

import type { AdminProductDetail, AdminVariant } from '@nowoll/types'
import { Button, Input } from '@nowoll/ui'
import { type FormEvent, useState } from 'react'
import { FormProblem } from '@/components/form-fields'
import { formatBdt } from '@/lib/format'
import { parsePrice, priceText } from '@/lib/money-input'
import { createVariant, deleteVariant, updateVariant } from '@/lib/products-api'

// ============================================================================
// Sizes and colours ("variants"). Each row edits in place and has its own
// Save. Stock is shown but NOT editable here: after the starting stock, stock
// only changes on the Inventory page, so every change is logged with a reason.
// ============================================================================

export function VariantsSection({
  product,
  readOnly,
  onChanged,
}: {
  product: AdminProductDetail
  readOnly: boolean
  onChanged: () => void
}) {
  return (
    <div className="flex flex-col gap-6">
      {product.variants.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sizes yet. Add them below — a product needs at least one active size/colour to go live.
        </p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 font-medium">Size</th>
                <th className="py-2 font-medium">Colour</th>
                <th className="py-2 font-medium">Swatch</th>
                <th className="py-2 font-medium">SKU</th>
                <th className="py-2 font-medium">Own price (৳)</th>
                <th className="py-2 font-medium">Low-stock alert at</th>
                <th className="py-2 text-right font-medium">Stock</th>
                <th className="py-2 font-medium">Active</th>
                <th className="py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <VariantRow
                  // The key changes only when THIS variant's saved data changes (its own
                  // save) → the row starts again from it. Other changes keep what's typed.
                  key={`${v.id}:${JSON.stringify(v)}`}
                  variant={v}
                  basePrice={product.basePrice}
                  readOnly={readOnly}
                  onChanged={onChanged}
                />
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            Stock changes on the Inventory page, so each one is recorded. Leave “Own price” empty to
            sell at the product price ({formatBdt(product.basePrice)}).
          </p>
        </div>
      )}
      {!readOnly && <AddVariants product={product} onAdded={onChanged} />}
    </div>
  )
}

type RowForm = {
  size: string
  color: string
  colorHex: string
  sku: string
  price: string
  lowStockThreshold: string
  isActive: boolean
}

function VariantRow({
  variant: v,
  basePrice,
  readOnly,
  onChanged,
}: {
  variant: AdminVariant
  basePrice: string
  readOnly: boolean
  onChanged: () => void
}) {
  const initial: RowForm = {
    size: v.size,
    color: v.color,
    colorHex: v.colorHex ?? '',
    sku: v.sku,
    price: priceText(v.price),
    lowStockThreshold: v.lowStockThreshold === null ? '' : String(v.lowStockThreshold),
    isActive: v.isActive,
  }
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const label = `${v.size} / ${v.color}`
  const set = (k: keyof RowForm) => (value: string | boolean) =>
    setForm((f) => ({ ...f, [k]: value }))

  async function save() {
    const price = parsePrice(form.price)
    if (price === 'invalid') return setProblem('Own price must be in taka, e.g. 1590 — or empty.')
    const limit = form.lowStockThreshold.trim()
    if (limit !== '' && !/^\d+$/.test(limit))
      return setProblem('Low-stock alert must be a whole number — or empty.')
    if (form.colorHex && !/^#[0-9A-Fa-f]{6}$/.test(form.colorHex))
      return setProblem('Swatch must look like #1E3A8A — or empty.')
    setBusy(true)
    setProblem(null)
    const r = await updateVariant(v.id, {
      size: form.size.trim(),
      color: form.color.trim(),
      colorHex: form.colorHex || null,
      sku: form.sku.trim(),
      price,
      lowStockThreshold: limit === '' ? null : Number(limit),
      isActive: form.isActive,
    })
    setBusy(false)
    if (!r.ok) return setProblem(r.message)
    onChanged()
  }

  async function remove() {
    setBusy(true)
    setProblem(null)
    const r = await deleteVariant(v.id)
    setBusy(false)
    if (!r.ok) {
      setConfirmRemove(false)
      return setProblem(r.message) // e.g. the last size of a live product
    }
    onChanged()
  }

  const cell = 'h-9 w-full rounded-control border border-border-strong bg-surface px-2 text-sm'
  return (
    <>
      <tr className="border-b border-border align-middle">
        <td className="py-2 pr-2">
          <input
            aria-label={`Size of ${label}`}
            className={cell}
            value={form.size}
            disabled={readOnly}
            onChange={(e) => set('size')(e.target.value)}
          />
        </td>
        <td className="py-2 pr-2">
          <input
            aria-label={`Colour of ${label}`}
            className={cell}
            value={form.color}
            disabled={readOnly}
            onChange={(e) => set('color')(e.target.value)}
          />
        </td>
        <td className="py-2 pr-2">
          <span className="flex items-center gap-1">
            <input
              type="color"
              aria-label={`Swatch colour of ${label}`}
              className="h-9 w-9 shrink-0 cursor-pointer rounded-control border border-border-strong"
              value={form.colorHex || '#ffffff'}
              disabled={readOnly}
              onChange={(e) => set('colorHex')(e.target.value)}
            />
            {form.colorHex && !readOnly && (
              <button
                type="button"
                className="text-xs text-muted-foreground underline"
                onClick={() => set('colorHex')('')}
              >
                none
              </button>
            )}
          </span>
        </td>
        <td className="py-2 pr-2">
          <input
            aria-label={`SKU of ${label}`}
            className={cell}
            value={form.sku}
            disabled={readOnly}
            onChange={(e) => set('sku')(e.target.value)}
          />
        </td>
        <td className="py-2 pr-2">
          <input
            aria-label={`Own price of ${label}`}
            inputMode="decimal"
            placeholder={priceText(basePrice)}
            className={cell}
            value={form.price}
            disabled={readOnly}
            onChange={(e) => set('price')(e.target.value)}
          />
        </td>
        <td className="py-2 pr-2">
          <input
            aria-label={`Low-stock alert for ${label}`}
            inputMode="numeric"
            placeholder="store setting"
            className={cell}
            value={form.lowStockThreshold}
            disabled={readOnly}
            onChange={(e) => set('lowStockThreshold')(e.target.value)}
          />
        </td>
        <td className="py-2 pr-2 text-right tabular-nums">
          {v.stock}
          {/* 38f: shoppers who asked "Notify me" — they get an email when you restock this size. */}
          {v.waiting > 0 && (
            <span className="block text-xs whitespace-nowrap text-warning">
              {v.waiting} waiting
            </span>
          )}
        </td>
        <td className="py-2 pr-2">
          <input
            type="checkbox"
            aria-label={`${label} is on sale`}
            className="size-4"
            checked={form.isActive}
            disabled={readOnly}
            onChange={(e) => set('isActive')(e.target.checked)}
          />
        </td>
        <td className="py-2 whitespace-nowrap">
          {!readOnly &&
            (dirty ? (
              <span className="flex gap-1">
                <Button size="sm" disabled={busy} onClick={save}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setForm(initial)
                    setProblem(null)
                  }}
                >
                  Undo
                </Button>
              </span>
            ) : confirmRemove ? (
              <span className="flex gap-1">
                <Button size="sm" variant="danger" disabled={busy} onClick={remove}>
                  Remove {label}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                  Keep
                </Button>
              </span>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
                Remove…
              </Button>
            ))}
        </td>
      </tr>
      {problem && (
        <tr>
          <td colSpan={9} className="pb-2">
            <FormProblem message={problem} />
          </td>
        </tr>
      )}
    </>
  )
}

/** "NOWOLL-OXFORD" + "M" + "Light Blue" → "NOWOLL-OXFORD-M-LIGHT-BLUE" (letters, digits, - only). */
export function suggestSku(prefix: string, size: string, color: string): string {
  return [prefix, size, color]
    .map((p) =>
      p
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, ''),
    )
    .filter(Boolean)
    .join('-')
}

/** A short SKU start from the product's slug: "oxford-cotton-shirt" → "OXFORD-COTTON". */
export const skuPrefix = (slug: string) => slug.split('-').slice(0, 2).join('-').toUpperCase()

/**
 * Clothes come in runs of sizes: one colour + "S, M, L, XL" → four variants,
 * each with the same starting stock. One size works too.
 */
function AddVariants({ product, onAdded }: { product: AdminProductDetail; onAdded: () => void }) {
  const [color, setColor] = useState('')
  const [colorHex, setColorHex] = useState('')
  const [sizes, setSizes] = useState('')
  const [stock, setStock] = useState('0')
  const [prefix, setPrefix] = useState(skuPrefix(product.slug))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const sizeList = [
    ...new Set(
      sizes
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ]
  const preview = sizeList.map((s) => ({ size: s, sku: suggestSku(prefix, s, color) }))

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!color.trim()) return setProblem('Enter the colour, e.g. Navy.')
    if (sizeList.length === 0) return setProblem('Enter at least one size, e.g. S, M, L, XL.')
    if (!/^\d+$/.test(stock.trim()))
      return setProblem('Starting stock must be a whole number (0 or more).')
    setBusy(true)
    setProblem(null)
    setDone(null)
    const failed: string[] = []
    // One at a time: a size that fails (e.g. it already exists) doesn't stop the others.
    for (const p of preview) {
      const r = await createVariant(product.id, {
        size: p.size,
        color: color.trim(),
        colorHex: colorHex || null,
        sku: p.sku,
        stock: Number(stock),
      })
      if (!r.ok) failed.push(`${p.size}: ${r.message}`)
    }
    setBusy(false)
    const added = preview.length - failed.length
    if (added > 0) {
      setDone(`${added} added.`)
      setSizes('')
      onAdded()
    }
    if (failed.length > 0) setProblem(`Not added — ${failed.join(' · ')}`)
  }

  return (
    <form
      onSubmit={add}
      noValidate
      className="flex flex-col gap-3 rounded-lg border border-border p-4"
    >
      <h3 className="font-medium">Add sizes</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          label="Colour"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          hint="e.g. Navy"
        />
        <Input
          label="Sizes"
          value={sizes}
          onChange={(e) => setSizes(e.target.value)}
          hint="Comma-separated: S, M, L, XL"
        />
        <Input
          label="Starting stock (each)"
          inputMode="numeric"
          value={stock}
          onChange={(e) => setStock(e.target.value)}
        />
        <Input label="SKU starts with" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
      </div>
      <label className="flex items-center gap-2 text-sm font-medium">
        Swatch colour
        <input
          type="color"
          className="h-9 w-9 cursor-pointer rounded-control border border-border-strong"
          value={colorHex || '#ffffff'}
          onChange={(e) => setColorHex(e.target.value)}
        />
        <span className="text-xs font-normal text-muted-foreground">
          {colorHex || 'none — the colour name is shown'}
        </span>
      </label>
      {preview.length > 0 && color.trim() && (
        <p className="text-sm text-muted-foreground">
          Will add: {preview.map((p) => `${p.size} (${p.sku})`).join(', ')}
        </p>
      )}
      <FormProblem message={problem} />
      {done && (
        <p role="status" className="text-sm text-success">
          {done}
        </p>
      )}
      <Button type="submit" variant="secondary" disabled={busy} className="self-start">
        {busy ? 'Adding…' : sizeList.length > 1 ? `Add ${sizeList.length} sizes` : 'Add size'}
      </Button>
    </form>
  )
}
