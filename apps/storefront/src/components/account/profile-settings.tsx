'use client'

import { Button, Input } from '@nowoll/ui'
import { bdPhoneSchema, passwordSchema } from '@nowoll/validation'
import { type FormEvent, useEffect, useState } from 'react'
import { FormProblem, problemText } from '@/components/account/auth-card'
import { changePassword, updateProfile } from '@/lib/account-api'
import { useSessionStore } from '@/stores/session-store'
import { useFocusFirstError } from '@/lib/use-focus-first-error'

/** /account/profile — name and mobile; password change. (Email change: step 26.) */
export function ProfileSettings() {
  const user = useSessionStore((s) => s.user)
  const status = useSessionStore((s) => s.status)
  const load = useSessionStore((s) => s.load)
  useEffect(() => void load(), [load])
  useEffect(() => {
    if (status === 'signed-out') window.location.replace('/login?next=/account/profile')
  }, [status])

  if (!user) return <p className="text-muted-foreground">Loading your profile…</p>
  return (
    <div className="flex max-w-md flex-col gap-12">
      <DetailsForm
        key={user.id}
        fullName={user.fullName ?? ''}
        phone={user.phone ?? ''}
        email={user.email}
      />
      <PasswordForm />
    </div>
  )
}

function DetailsForm({
  fullName,
  phone,
  email,
}: {
  fullName: string
  phone: string
  email: string
}) {
  const signedIn = useSessionStore((s) => s.signedIn)
  const [form, setForm] = useState({ fullName, phone })
  const [errors, setErrors] = useState<{ fullName?: string; phone?: string }>({})
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [problem, setProblem] = useState<string | null>(null)

  const { formRef, focusFirstError } = useFocusFirstError()

  async function submit(e: FormEvent) {
    e.preventDefault()
    const phone = form.phone.trim() ? bdPhoneSchema.safeParse(form.phone) : null
    const found = {
      ...(!form.fullName.trim() && { fullName: 'Enter your name' }),
      ...(phone &&
        !phone.success && { phone: 'Enter a valid Bangladeshi mobile number, e.g. 01712345678' }),
    }
    setErrors(found)
    if (Object.keys(found).length > 0) return focusFirstError()
    setState('saving')
    setProblem(null)
    const r = await updateProfile({
      fullName: form.fullName.trim(),
      phone: phone?.success ? phone.data : null,
    })
    if (!r.ok) {
      setState('idle')
      return setProblem(problemText(r))
    }
    signedIn(r.data.user)
    setState('saved')
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Your details</h2>
      <Input
        label="Full name"
        autoComplete="name"
        value={form.fullName}
        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        error={errors.fullName}
      />
      <Input
        label="Mobile number (optional)"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        error={errors.phone}
      />
      <Input
        label="Email"
        value={email}
        disabled
        hint="Changing your email will be possible soon."
      />
      <FormProblem message={problem} />
      {state === 'saved' && (
        <p role="status" className="text-sm text-success">
          Saved.
        </p>
      )}
      <Button type="submit" className="self-start" disabled={state === 'saving'}>
        {state === 'saving' ? 'Saving…' : 'Save details'}
      </Button>
    </form>
  )
}

function PasswordForm() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' })
  const [error, setError] = useState<string | undefined>()
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [problem, setProblem] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = passwordSchema.safeParse(form.newPassword)
    setError(parsed.success ? undefined : parsed.error.issues[0]?.message)
    if (!parsed.success || !form.currentPassword) return
    setState('saving')
    setProblem(null)
    const r = await changePassword(form)
    if (!r.ok) {
      setState('idle')
      return setProblem(problemText(r))
    }
    setForm({ currentPassword: '', newPassword: '' })
    setState('saved')
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold">Change password</h2>
      <Input
        label="Current password"
        type="password"
        autoComplete="current-password"
        value={form.currentPassword}
        onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
      />
      <Input
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters"
        value={form.newPassword}
        onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
        error={error}
      />
      <FormProblem message={problem} />
      {state === 'saved' && (
        <p role="status" className="text-sm text-success">
          Password changed.
        </p>
      )}
      <Button type="submit" className="self-start" disabled={state === 'saving'}>
        {state === 'saving' ? 'Changing…' : 'Change password'}
      </Button>
    </form>
  )
}
