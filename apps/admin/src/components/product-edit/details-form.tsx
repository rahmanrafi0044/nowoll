'use client'

import type { AdminProductDetail } from '@nowoll/types'
import { Button, Input } from '@nowoll/ui'
import { type FormEvent, useEffect, useState } from 'react'
import { FormProblem, SelectField, TextArea } from '@/components/form-fields'
import { flattenCategories } from '@/lib/categories'
import { parsePrice, priceText } from '@/lib/money-input'
import { type CategoryNode, type ProductFields, updateProduct } from '@/lib/products-api'

// The product's own fields. Only CHANGED fields are sent, so saving never
// overwrites something nobody touched. Leaving the page with unsaved changes
// (reload, closing the tab) asks first.

type Form = {
  name: string
  slug: string
  categoryId: string
  basePrice: string
  compareAtPrice: string
  shortDescription: string
  description: string
  tags: string
  isFeatured: boolean
  seoTitle: string
  seoDescription: string
}

const toForm = (p: AdminProductDetail): Form => ({
  name: p.name,
  slug: p.slug,
  categoryId: p.category.id,
  basePrice: priceText(p.basePrice),
  compareAtPrice: priceText(p.compareAtPrice),
  shortDescription: p.shortDescription ?? '',
  description: p.description ?? '',
  tags: p.tags.join(', '),
  isFeatured: p.isFeatured,
  seoTitle: p.seoTitle ?? '',
  seoDescription: p.seoDescription ?? '',
})

const orNull = (s: string) => (s.trim() === '' ? null : s.trim())

/** The changes to send, or a problem to show. Unchanged fields are left out. */
export function changesOf(
  before: Form,
  after: Form,
): { changes: Partial<ProductFields> } | { problem: string } {
  const changes: Partial<ProductFields> = {}
  if (after.name.trim() !== before.name) {
    if (!after.name.trim()) return { problem: 'The name can’t be empty.' }
    changes.name = after.name.trim()
  }
  if (after.slug.trim() !== before.slug) changes.slug = after.slug.trim()
  if (after.categoryId !== before.categoryId) changes.categoryId = after.categoryId
  if (after.basePrice !== before.basePrice) {
    const n = parsePrice(after.basePrice)
    if (n === null || n === 'invalid' || n <= 0)
      return { problem: 'Enter the price in taka, e.g. 1490 or 1490.50.' }
    changes.basePrice = n
  }
  if (after.compareAtPrice !== before.compareAtPrice) {
    const n = parsePrice(after.compareAtPrice)
    if (n === 'invalid') return { problem: 'The “was” price must be in taka, e.g. 1990.' }
    changes.compareAtPrice = n
  }
  // Compared AFTER trimming: typing spaces into an empty box changes nothing.
  for (const k of ['shortDescription', 'description', 'seoTitle', 'seoDescription'] as const)
    if (orNull(after[k]) !== orNull(before[k])) changes[k] = orNull(after[k])
  if (after.tags !== before.tags)
    changes.tags = [
      ...new Set(
        after.tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ]
  if (after.isFeatured !== before.isFeatured) changes.isFeatured = after.isFeatured
  return { changes }
}

export function DetailsForm({
  product,
  categories,
  readOnly,
  onSaved,
}: {
  product: AdminProductDetail
  categories: CategoryNode[]
  readOnly: boolean
  onSaved: () => void
}) {
  const initial = toForm(product)
  const [form, setForm] = useState(initial)
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  // After OUR save, start again from what the API stored (it tidies values,
  // e.g. "1,490.50" → 1490.5) — but only once that fresh copy has arrived.
  // Other changes (publishing, a new photo) never touch what is being typed.
  const [awaitingSaved, setAwaitingSaved] = useState<string | null>(null)
  if (awaitingSaved !== null && product.updatedAt !== awaitingSaved) {
    setAwaitingSaved(null)
    setForm(initial)
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)

  // The browser's own "Leave site? Changes you made may not be saved."
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const set =
    <K extends keyof Form>(key: K) =>
    (value: Form[K]) => {
      setSaved(false)
      setForm((f) => ({ ...f, [key]: value }))
    }

  async function save(e: FormEvent) {
    e.preventDefault()
    const result = changesOf(initial, form)
    if ('problem' in result) return setProblem(result.problem)
    setSaving(true)
    setProblem(null)
    const r = await updateProduct(product.id, result.changes)
    setSaving(false)
    if (!r.ok) return setProblem(r.message)
    setSaved(true)
    setAwaitingSaved(product.updatedAt) // the version from before this save
    onSaved()
  }

  // Categories this product can move to (its current one always listed).
  const options = flattenCategories(categories)
  if (!options.some((c) => c.id === product.category.id))
    options.unshift({ id: product.category.id, label: product.category.name })

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-4">
      <fieldset disabled={readOnly || saving} className="flex flex-col gap-4">
        <Input
          label="Name"
          value={form.name}
          maxLength={150}
          onChange={(e) => set('name')(e.target.value)}
        />
        <Input
          label="Web address (slug)"
          value={form.slug}
          maxLength={120}
          onChange={(e) => set('slug')(e.target.value)}
          hint={`nowoll.com/products/${form.slug || '…'} — changing it breaks links already shared.`}
        />
        <SelectField
          label="Category"
          value={form.categoryId}
          onChange={(e) => set('categoryId')(e.target.value)}
        >
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </SelectField>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Price (৳)"
            inputMode="decimal"
            value={form.basePrice}
            onChange={(e) => set('basePrice')(e.target.value)}
          />
          <Input
            label="“Was” price (৳)"
            inputMode="decimal"
            value={form.compareAtPrice}
            onChange={(e) => set('compareAtPrice')(e.target.value)}
            hint="Shown crossed out. Leave empty for no sale."
          />
        </div>
        <TextArea
          label="Short description"
          value={form.shortDescription}
          maxLength={300}
          rows={2}
          onChange={(e) => set('shortDescription')(e.target.value)}
          hint="One or two lines, shown on product cards."
        />
        <TextArea
          label="Description"
          value={form.description}
          maxLength={10000}
          rows={8}
          onChange={(e) => set('description')(e.target.value)}
          hint="Plain text — line breaks are kept on the product page."
        />
        <Input
          label="Tags"
          value={form.tags}
          onChange={(e) => set('tags')(e.target.value)}
          hint="Separated by commas, e.g. cotton, eid, office. Used by search."
        />
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            className="size-4"
            checked={form.isFeatured}
            onChange={(e) => set('isFeatured')(e.target.checked)}
          />
          Featured on the homepage
        </label>
        <Input
          label="Google title"
          value={form.seoTitle}
          maxLength={70}
          onChange={(e) => set('seoTitle')(e.target.value)}
          hint={`${form.seoTitle.length} / 70 — leave empty to use the name.`}
        />
        <TextArea
          label="Google description"
          value={form.seoDescription}
          maxLength={160}
          rows={2}
          onChange={(e) => set('seoDescription')(e.target.value)}
          hint="Leave empty to use the start of the description."
        />
      </fieldset>
      <FormProblem message={problem} />
      {!readOnly && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!dirty || saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          {dirty ? (
            <>
              <span className="text-sm text-warning">Unsaved changes</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setForm(initial)
                  setProblem(null)
                }}
              >
                Undo changes
              </Button>
            </>
          ) : (
            saved && (
              <span role="status" className="text-sm text-success">
                Saved.
              </span>
            )
          )}
        </div>
      )}
    </form>
  )
}
