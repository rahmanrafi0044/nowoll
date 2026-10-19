'use client'

import type { SavedAddressView } from '@nowoll/types'
import { Button, Input } from '@nowoll/ui'
import { bdPhoneSchema } from '@nowoll/validation'
import { type FormEvent, useState } from 'react'
import {
  AddressFields,
  type AddressFieldErrors,
  type AddressFieldValues,
  checkAddressFields,
  emptyAddressFields,
} from '@/components/address/address-fields'
import { FormProblem, problemText } from '@/components/account/auth-card'
import { addressSummary } from '@/components/checkout/address-step'
import { useAccountData } from '@/hooks/use-account-data'
import { createAddress, deleteAddress, fetchAddresses, updateAddress } from '@/lib/account-api'
import { useSessionStore } from '@/stores/session-store'
import { useFocusFirstError } from '@/lib/use-focus-first-error'

const MAX = 10 // same limit as the API

/** /account/addresses — saved delivery addresses; exactly one is the default. */
export function AddressBook() {
  const { data, error, reload } = useAccountData(fetchAddresses)
  const [editing, setEditing] = useState<SavedAddressView | 'new' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  if (error)
    return (
      <p role="alert" className="text-danger">
        {error.message}
      </p>
    )
  if (!data) return <p className="text-muted-foreground">Loading your addresses…</p>

  if (editing)
    return (
      <AddressForm
        address={editing === 'new' ? null : editing}
        first={data.length === 0}
        onDone={() => {
          setEditing(null)
          reload()
        }}
      />
    )

  async function act(call: Promise<{ ok: boolean; status?: number; message?: string }>) {
    setProblem(null)
    const r = await call
    if (!r.ok) setProblem(problemText({ status: r.status ?? 0, message: r.message ?? '' }))
    reload()
  }

  return (
    <div className="flex flex-col gap-4">
      {data.length === 0 && (
        <p>No saved addresses yet — save one here, or tick “Save to my addresses” at checkout.</p>
      )}
      <ul className="grid gap-4 sm:grid-cols-2">
        {data.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-2 rounded-control border border-border p-4 text-sm"
          >
            <p className="font-medium">
              {a.label ?? a.fullName}
              {a.isDefault && (
                <span className="ml-2 rounded-control bg-surface-muted px-2 py-0.5 text-xs">
                  Default
                </span>
              )}
            </p>
            <p className="text-muted-foreground">
              {a.fullName} · {a.phone}
              <br />
              {[addressSummary(a), a.division, a.postalCode].filter(Boolean).join(', ')}
            </p>
            <div className="mt-auto flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={() => setEditing(a)}
                aria-label={`Edit ${a.label ?? a.fullName}`}
              >
                Edit
              </button>
              {!a.isDefault && (
                <button
                  type="button"
                  className="underline underline-offset-4"
                  onClick={() => act(updateAddress(a.id, { isDefault: true }))}
                  aria-label={`Make ${a.label ?? a.fullName} the default`}
                >
                  Make default
                </button>
              )}
              <button
                type="button"
                className="text-danger underline underline-offset-4"
                aria-label={`Delete ${a.label ?? a.fullName}`}
                onClick={() => {
                  if (window.confirm(`Delete ${a.label ?? 'this address'}?`))
                    void act(deleteAddress(a.id))
                }}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
      <FormProblem message={problem} />
      {data.length < MAX ? (
        <Button variant="secondary" className="self-start" onClick={() => setEditing('new')}>
          Add an address
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">You can save up to {MAX} addresses.</p>
      )}
    </div>
  )
}

function AddressForm({
  address,
  first,
  onDone,
}: {
  address: SavedAddressView | null
  first: boolean
  onDone: () => void
}) {
  const account = useSessionStore((s) => s.user)
  const [details, setDetails] = useState({
    label: address?.label ?? '',
    fullName: address?.fullName ?? account?.fullName ?? '',
    phone: address?.phone ?? account?.phone ?? '',
  })
  const [fields, setFields] = useState<AddressFieldValues>(
    address
      ? {
          division: address.division,
          district: address.district,
          area: address.area ?? '',
          addressLine1: address.addressLine1,
          addressLine2: address.addressLine2 ?? '',
          postalCode: address.postalCode ?? '',
        }
      : emptyAddressFields,
  )
  const [isDefault, setIsDefault] = useState(address?.isDefault ?? first)
  const [errors, setErrors] = useState<AddressFieldErrors & { fullName?: string; phone?: string }>(
    {},
  )
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const { formRef, focusFirstError } = useFocusFirstError()

  async function submit(e: FormEvent) {
    e.preventDefault()
    const phone = bdPhoneSchema.safeParse(details.phone)
    const found = {
      ...checkAddressFields(fields, {
        fullName: details.fullName || 'x',
        phone: phone.success ? phone.data : '+8801700000000',
      }),
      ...(!details.fullName.trim() && { fullName: 'Enter the recipient’s name' }),
      ...(!phone.success && { phone: 'Enter a valid Bangladeshi mobile number, e.g. 01712345678' }),
    }
    setErrors(found)
    if (Object.keys(found).length > 0 || !phone.success) return focusFirstError()
    const body = {
      label: details.label.trim() || null,
      fullName: details.fullName.trim(),
      phone: phone.data,
      division: fields.division,
      district: fields.district,
      addressLine1: fields.addressLine1.trim(),
      area: fields.area.trim() || null,
      addressLine2: fields.addressLine2.trim() || null,
      postalCode: fields.postalCode.trim() || null,
      isDefault,
    }
    setSending(true)
    setProblem(null)
    const r = address ? await updateAddress(address.id, body) : await createAddress(body)
    setSending(false)
    if (!r.ok) return setProblem(problemText(r))
    onDone()
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex max-w-xl flex-col gap-4">
      <h2 className="text-xl font-semibold">{address ? 'Edit address' : 'New address'}</h2>
      <Input
        label="Label (optional)"
        hint="e.g. Home, Office"
        value={details.label}
        onChange={(e) => setDetails({ ...details, label: e.target.value })}
      />
      <Input
        label="Recipient’s name"
        autoComplete="name"
        value={details.fullName}
        onChange={(e) => setDetails({ ...details, fullName: e.target.value })}
        error={errors.fullName}
      />
      <Input
        label="Recipient’s mobile number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={details.phone}
        onChange={(e) => setDetails({ ...details, phone: e.target.value })}
        error={errors.phone}
      />
      <AddressFields form={fields} onChange={setFields} errors={errors} />
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isDefault}
          disabled={first}
          onChange={(e) => setIsDefault(e.target.checked)}
          className="size-4 accent-brand"
        />
        Use as my default address
      </label>
      <FormProblem message={problem} />
      <div className="flex gap-3">
        <Button type="submit" disabled={sending}>
          {sending ? 'Saving…' : 'Save address'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
