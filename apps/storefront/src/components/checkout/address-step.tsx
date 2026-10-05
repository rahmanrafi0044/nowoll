'use client'

import { Button, Input } from '@nowoll/ui'
import { addressSchema, DIVISION_DISTRICTS, DIVISIONS } from '@nowoll/validation'
import { type FormEvent, useState } from 'react'
import { useCheckoutStore } from '@/stores/checkout-store'

type Field = 'division' | 'district' | 'area' | 'addressLine1' | 'addressLine2' | 'postalCode'

const selectClass = 'h-11 rounded-control border border-border-strong bg-surface px-3 text-base'

export function AddressStep() {
  const contact = useCheckoutStore((s) => s.contact)
  const saved = useCheckoutStore((s) => s.address)
  const setAddress = useCheckoutStore((s) => s.setAddress)
  const complete = useCheckoutStore((s) => s.complete)
  const [form, setForm] = useState<Record<Field, string>>({
    division: saved?.division ?? '',
    district: saved?.district ?? '',
    area: saved?.area ?? '',
    addressLine1: saved?.addressLine1 ?? '',
    addressLine2: saved?.addressLine2 ?? '',
    postalCode: saved?.postalCode ?? '',
  })
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const districts = form.division
    ? DIVISION_DISTRICTS[form.division as keyof typeof DIVISION_DISTRICTS]
    : []

  function submit(event: FormEvent) {
    event.preventDefault()
    // Shared rule set from @nowoll/validation: valid district, inside the chosen division, 4-digit postcode…
    const parsed = addressSchema.safeParse({
      ...form,
      fullName: contact?.fullName ?? '',
      phone: contact?.phone ?? '',
    })
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as Field
        if (field in form && !next[field]) next[field] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    setAddress(form)
    complete('address')
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Division
          <select
            className={selectClass}
            value={form.division}
            // Changing the division clears the district, which must belong to it.
            onChange={(e) => setForm({ ...form, division: e.target.value, district: '' })}
            aria-invalid={errors.division ? true : undefined}
            autoComplete="address-level1"
          >
            <option value="">Choose…</option>
            {DIVISIONS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          {errors.division && (
            <span className="text-sm font-normal text-danger">{errors.division}</span>
          )}
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          District
          <select
            className={selectClass}
            value={form.district}
            onChange={(e) => setForm({ ...form, district: e.target.value })}
            disabled={!form.division}
            aria-invalid={errors.district ? true : undefined}
            autoComplete="address-level2"
          >
            <option value="">{form.division ? 'Choose…' : 'Choose a division first'}</option>
            {districts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          {errors.district && (
            <span className="text-sm font-normal text-danger">{errors.district}</span>
          )}
        </label>
      </div>
      <Input
        label="Area / thana"
        hint="e.g. Dhanmondi"
        value={form.area}
        onChange={(e) => setForm({ ...form, area: e.target.value })}
        error={errors.area}
      />
      <Input
        label="Address"
        autoComplete="address-line1"
        hint="House, road, block"
        value={form.addressLine1}
        onChange={(e) => setForm({ ...form, addressLine1: e.target.value })}
        error={errors.addressLine1}
      />
      <Input
        label="Address line 2 (optional)"
        autoComplete="address-line2"
        value={form.addressLine2}
        onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
        error={errors.addressLine2}
      />
      <Input
        label="Postcode (optional)"
        inputMode="numeric"
        autoComplete="postal-code"
        value={form.postalCode}
        onChange={(e) => setForm({ ...form, postalCode: e.target.value })}
        error={errors.postalCode}
      />
      <Button type="submit" size="lg">
        Continue to delivery
      </Button>
    </form>
  )
}
