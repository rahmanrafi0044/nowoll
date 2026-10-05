'use client'

import { Button, Input } from '@nowoll/ui'
import { bdPhoneSchema, emailSchema } from '@nowoll/validation'
import { type FormEvent, useState } from 'react'
import { useCheckoutStore } from '@/stores/checkout-store'

export function ContactStep() {
  const saved = useCheckoutStore((s) => s.contact)
  const setContact = useCheckoutStore((s) => s.setContact)
  const complete = useCheckoutStore((s) => s.complete)
  const [form, setForm] = useState({
    fullName: saved?.fullName ?? '',
    email: saved?.email ?? '',
    phone: saved?.phone ?? '',
  })
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({})

  function submit(event: FormEvent) {
    event.preventDefault()
    // The same rules the API uses (from @nowoll/validation).
    const email = emailSchema.safeParse(form.email)
    const phone = bdPhoneSchema.safeParse(form.phone)
    const next = {
      fullName: form.fullName.trim() ? undefined : 'Enter your full name',
      email: email.success ? undefined : 'Enter a valid email address',
      phone: phone.success
        ? undefined
        : 'Enter a valid Bangladeshi mobile number, e.g. 01712345678',
    }
    setErrors(next)
    if (next.fullName || !email.success || !phone.success) return
    setContact({ fullName: form.fullName.trim(), email: email.data, phone: phone.data })
    complete('contact')
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        No account needed — we&apos;ll email your order confirmation and tracking link.
      </p>
      <Input
        label="Full name"
        autoComplete="name"
        value={form.fullName}
        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        error={errors.fullName}
      />
      <Input
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        error={errors.email}
      />
      <Input
        label="Mobile number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        hint="The courier will call this number"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        error={errors.phone}
      />
      <Button type="submit" size="lg">
        Continue to address
      </Button>
    </form>
  )
}
