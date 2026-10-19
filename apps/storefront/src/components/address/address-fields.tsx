'use client'

import { Input } from '@nowoll/ui'
import { useId } from 'react'
import { addressSchema, DIVISION_DISTRICTS, DIVISIONS } from '@nowoll/validation'

// The Bangladesh address fields — shared by checkout and the address book
// (step 23), so both look the same and follow the same rules.
export type AddressField =
  'division' | 'district' | 'area' | 'addressLine1' | 'addressLine2' | 'postalCode'
export type AddressFieldValues = Record<AddressField, string>
export type AddressFieldErrors = Partial<Record<AddressField, string>>

export const emptyAddressFields: AddressFieldValues = {
  division: '',
  district: '',
  area: '',
  addressLine1: '',
  addressLine2: '',
  postalCode: '',
}

/** Checks with the shared rules (@nowoll/validation): district inside the division, 4-digit postcode… */
export function checkAddressFields(
  form: AddressFieldValues,
  recipient: { fullName: string; phone: string },
): AddressFieldErrors {
  const parsed = addressSchema.safeParse({ ...form, ...recipient })
  const errors: AddressFieldErrors = {}
  if (!parsed.success)
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as AddressField
      if (field in form && !errors[field]) errors[field] = issue.message
    }
  return errors
}

const selectClass = (invalid: boolean) =>
  `h-11 rounded-control border bg-surface px-3 text-base ${invalid ? 'border-danger' : 'border-border-strong'}`

export function AddressFields({
  form,
  onChange,
  errors,
}: {
  form: AddressFieldValues
  onChange: (next: AddressFieldValues) => void
  errors: AddressFieldErrors
}) {
  // The label is ONLY the field's name; the error is a linked description (like
  // <Input>), so a screen reader says "Division, invalid entry, Choose a division"
  // — not "Division Choose a division" as one name (step 52).
  const id = useId()
  const divisionError = `${id}-division-error`
  const districtError = `${id}-district-error`
  const districts = form.division
    ? DIVISION_DISTRICTS[form.division as keyof typeof DIVISION_DISTRICTS]
    : []
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-division`} className="text-sm font-medium">
            Division
          </label>
          <select
            id={`${id}-division`}
            className={selectClass(!!errors.division)}
            value={form.division}
            // Changing the division clears the district, which must belong to it.
            onChange={(e) => onChange({ ...form, division: e.target.value, district: '' })}
            aria-invalid={errors.division ? true : undefined}
            aria-describedby={errors.division ? divisionError : undefined}
            autoComplete="address-level1"
          >
            <option value="">Choose…</option>
            {DIVISIONS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          {errors.division && (
            <p id={divisionError} className="text-sm text-danger">
              {errors.division}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-district`} className="text-sm font-medium">
            District
          </label>
          <select
            id={`${id}-district`}
            className={selectClass(!!errors.district)}
            value={form.district}
            onChange={(e) => onChange({ ...form, district: e.target.value })}
            disabled={!form.division}
            aria-invalid={errors.district ? true : undefined}
            aria-describedby={errors.district ? districtError : undefined}
            autoComplete="address-level2"
          >
            <option value="">{form.division ? 'Choose…' : 'Choose a division first'}</option>
            {districts.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          {errors.district && (
            <p id={districtError} className="text-sm text-danger">
              {errors.district}
            </p>
          )}
        </div>
      </div>
      <Input
        label="Area / thana"
        hint="e.g. Dhanmondi"
        value={form.area}
        onChange={(e) => onChange({ ...form, area: e.target.value })}
        error={errors.area}
      />
      <Input
        label="Address"
        autoComplete="address-line1"
        hint="House, road, block"
        value={form.addressLine1}
        onChange={(e) => onChange({ ...form, addressLine1: e.target.value })}
        error={errors.addressLine1}
      />
      <Input
        label="Address line 2 (optional)"
        autoComplete="address-line2"
        value={form.addressLine2}
        onChange={(e) => onChange({ ...form, addressLine2: e.target.value })}
        error={errors.addressLine2}
      />
      <Input
        label="Postcode (optional)"
        inputMode="numeric"
        autoComplete="postal-code"
        value={form.postalCode}
        onChange={(e) => onChange({ ...form, postalCode: e.target.value })}
        error={errors.postalCode}
      />
    </>
  )
}
