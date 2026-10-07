'use client'

import { Button, Input } from '@nowoll/ui'
import { useRouter } from 'next/navigation'
import { type FormEvent, useState } from 'react'
import { useLoad } from '@/components/dashboard/use-load'
import { FormProblem, SelectField } from '@/components/form-fields'
import { flattenCategories } from '@/lib/categories'
import { parsePrice } from '@/lib/money-input'
import { createProduct, fetchCategories } from '@/lib/products-api'

/**
 * Step 1 of a new product: just the basics. It's saved as a DRAFT (hidden from
 * the shop) and the edit page opens to add sizes, colours and photos — a
 * product can't go live without them anyway.
 */
export function NewProductForm() {
  const router = useRouter()
  const categories = useLoad(fetchCategories)
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [price, setPrice] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const basePrice = parsePrice(price)
    if (!name.trim()) return setProblem('Give the product a name.')
    if (!categoryId) return setProblem('Choose a category.')
    if (basePrice === null || basePrice === 'invalid' || basePrice <= 0)
      return setProblem('Enter the price in taka, e.g. 1490 or 1490.50.')
    setSaving(true)
    setProblem(null)
    const r = await createProduct({ name: name.trim(), categoryId, basePrice })
    if (!r.ok) {
      setSaving(false)
      return setProblem(r.message)
    }
    router.push(`/admin/products/${r.data.id}`)
  }

  const options = categories.state.status === 'ok' ? flattenCategories(categories.state.data) : []
  return (
    <form onSubmit={submit} noValidate className="flex max-w-lg flex-col gap-4">
      <Input
        label="Product name"
        value={name}
        maxLength={150}
        onChange={(e) => setName(e.target.value)}
        hint="As customers will see it, e.g. “Oxford Cotton Shirt”."
      />
      <SelectField
        label="Category"
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        disabled={categories.state.status !== 'ok'}
      >
        <option value="">
          {categories.state.status === 'loading' ? 'Loading…' : 'Choose a category'}
        </option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </SelectField>
      <Input
        label="Price (৳)"
        inputMode="decimal"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        hint="Sizes can have their own price later."
      />
      <FormProblem
        message={problem ?? (categories.state.status === 'error' ? categories.state.message : null)}
      />
      <Button type="submit" disabled={saving} className="self-start">
        {saving ? 'Creating…' : 'Create draft'}
      </Button>
      <p className="text-sm text-muted-foreground">
        It stays hidden from the shop until you add sizes and a photo and publish it.
      </p>
    </form>
  )
}
