'use client'

import type { SavedAddressView } from '@nowoll/types'
import { Button } from '@nowoll/ui'
import { type FormEvent, useEffect, useState } from 'react'
import {
  AddressFields,
  type AddressFieldErrors,
  type AddressFieldValues,
  checkAddressFields,
  emptyAddressFields,
} from '@/components/address/address-fields'
import { fetchAddresses } from '@/lib/account-api'
import { useCheckoutStore } from '@/stores/checkout-store'
import { useSessionStore } from '@/stores/session-store'

const NEW = 'new'

/** One line per saved address in the picker. */
export const addressSummary = (a: Pick<SavedAddressView, 'addressLine1' | 'area' | 'district'>) =>
  [a.addressLine1, a.area, a.district].filter(Boolean).join(', ')

export function AddressStep() {
  const contact = useCheckoutStore((s) => s.contact)
  const saved = useCheckoutStore((s) => s.address)
  const savedSave = useCheckoutStore((s) => s.saveAddress)
  const setAddress = useCheckoutStore((s) => s.setAddress)
  const complete = useCheckoutStore((s) => s.complete)
  const signedIn = useSessionStore((s) => s.status === 'signed-in')
  const [form, setForm] = useState<AddressFieldValues>(
    saved ? { ...emptyAddressFields, ...saved } : emptyAddressFields,
  )
  const [errors, setErrors] = useState<AddressFieldErrors>({})

  // Signed in (step 23): saved addresses to pick from, the default pre-selected.
  const [book, setBook] = useState<SavedAddressView[]>([])
  const [choice, setChoice] = useState<string>(NEW)
  const [save, setSave] = useState(saved ? savedSave : true)
  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    void fetchAddresses().then((r) => {
      if (cancelled || !r.ok || r.data.length === 0) return
      setBook(r.data)
      // Coming back to this step with a typed address? Keep it; otherwise start from the default.
      if (!saved) setChoice(r.data.find((a) => a.isDefault)?.id ?? r.data[0]!.id)
    })
    return () => {
      cancelled = true
    }
  }, [signedIn, saved])

  function submit(event: FormEvent) {
    event.preventDefault()
    const picked = book.find((a) => a.id === choice)
    if (picked) {
      setAddress({
        division: picked.division,
        district: picked.district,
        area: picked.area ?? '',
        addressLine1: picked.addressLine1,
        addressLine2: picked.addressLine2 ?? '',
        postalCode: picked.postalCode ?? '',
      })
      return complete('address')
    }
    const found = checkAddressFields(form, {
      fullName: contact?.fullName ?? '',
      phone: contact?.phone ?? '',
    })
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setAddress(form, signedIn && save)
    complete('address')
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {book.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Deliver to</legend>
          {[
            ...book.map((a) => ({
              id: a.id,
              title: a.label ?? a.fullName,
              detail: addressSummary(a),
            })),
            { id: NEW, title: 'A new address', detail: '' },
          ].map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-start gap-3 rounded-control border border-border-strong p-3 has-[:checked]:border-brand"
            >
              <input
                type="radio"
                name="saved-address"
                value={o.id}
                checked={choice === o.id}
                onChange={() => setChoice(o.id)}
                className="mt-1 size-4 accent-brand"
              />
              <span>
                <span className="block font-medium">{o.title}</span>
                {o.detail && (
                  <span className="block text-sm text-muted-foreground">{o.detail}</span>
                )}
              </span>
            </label>
          ))}
        </fieldset>
      )}
      {choice === NEW && (
        <>
          <AddressFields form={form} onChange={setForm} errors={errors} />
          {signedIn && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={save}
                onChange={(e) => setSave(e.target.checked)}
                className="size-4 accent-brand"
              />
              Save to my addresses
            </label>
          )}
        </>
      )}
      <Button type="submit" size="lg">
        Continue to delivery
      </Button>
    </form>
  )
}
