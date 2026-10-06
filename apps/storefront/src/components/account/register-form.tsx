'use client'

import { Button, Input } from '@nowoll/ui'
import { bdPhoneSchema, emailSchema, passwordSchema } from '@nowoll/validation'
import Link from 'next/link'
import { type FormEvent, useEffect, useState } from 'react'
import { register, safeNext } from '@/lib/auth-api'
import { useSessionStore } from '@/stores/session-store'
import { FormProblem, problemText } from './auth-card'

type Field = 'fullName' | 'email' | 'phone' | 'password'

export function RegisterForm({ next }: { next: string | null }) {
  const target = safeNext(next)
  const status = useSessionStore((s) => s.status)
  const signedIn = useSessionStore((s) => s.signedIn)
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' })
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({})
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'signed-in') window.location.replace(target)
  }, [status, target])

  async function submit(e: FormEvent) {
    e.preventDefault()
    // The same rules as the API (@nowoll/validation).
    const email = emailSchema.safeParse(form.email)
    const phone = form.phone.trim() ? bdPhoneSchema.safeParse(form.phone) : null
    const password = passwordSchema.safeParse(form.password)
    const found = {
      ...(!form.fullName.trim() && { fullName: 'Enter your full name' }),
      ...(!email.success && { email: 'Enter a valid email address' }),
      ...(phone &&
        !phone.success && { phone: 'Enter a valid Bangladeshi mobile number, e.g. 01712345678' }),
      ...(!password.success && { password: password.error.issues[0]?.message }),
    }
    setErrors(found)
    if (Object.keys(found).length > 0 || !email.success) return

    setSending(true)
    setProblem(null)
    const result = await register({
      fullName: form.fullName.trim(),
      email: email.data,
      password: form.password,
      ...(phone?.success && { phone: phone.data }),
    })
    setSending(false)
    if (!result.ok) {
      if (result.error === 'EMAIL_TAKEN')
        return setProblem(
          'An account with this email already exists — sign in instead, or reset your password.',
        )
      return setProblem(problemText(result))
    }
    signedIn(result.data.user)
  }

  const set = (field: Field) => (e: { target: { value: string } }) =>
    setForm({ ...form, [field]: e.target.value })
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Input
        label="Full name"
        autoComplete="name"
        value={form.fullName}
        onChange={set('fullName')}
        error={errors.fullName}
      />
      <Input
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={form.email}
        onChange={set('email')}
        error={errors.email}
      />
      <Input
        label="Mobile number (optional)"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        hint="Saves typing it at checkout"
        value={form.phone}
        onChange={set('phone')}
        error={errors.phone}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters"
        value={form.password}
        onChange={set('password')}
        error={errors.password}
      />
      <FormProblem message={problem} />
      <Button type="submit" size="lg" disabled={sending}>
        {sending ? 'Creating your account…' : 'Create account'}
      </Button>
      <p className="text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href={next ? `/login?next=${encodeURIComponent(target)}` : '/login'}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    </form>
  )
}
