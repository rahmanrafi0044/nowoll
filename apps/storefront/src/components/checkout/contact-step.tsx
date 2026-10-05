'use client'

import { Button, Input } from '@nowoll/ui'
import { bdPhoneSchema, emailSchema } from '@nowoll/validation'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { useCheckoutStore } from '@/stores/checkout-store'
import { useSessionStore } from '@/stores/session-store'

export function ContactStep() {
  const saved = useCheckoutStore((s) => s.contact)
  const setContact = useCheckoutStore((s) => s.setContact)
  const complete = useCheckoutStore((s) => s.complete)
  // Signed in (step 22): start from the account's details; still editable —
  // e.g. ordering a gift with someone else's phone number.
  const account = useSessionStore((s) => (s.status === 'signed-in' ? s.user : null))
  const [form, setForm] = useState({
    fullName: saved?.fullName ?? account?.fullName ?? '',
    email: saved?.email ?? account?.email ?? '',
    phone: saved?.phone ?? account?.phone ?? '',
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
      {account ? (
        <p className="text-sm text-muted-foreground">
          Signed in as {account.email} — this order will be saved to your account.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          No account needed — we&apos;ll email your order confirmation and tracking link.{' '}
          <Link
            href="/login?next=/checkout"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>{' '}
          for faster checkout.
        </p>
      )}
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
