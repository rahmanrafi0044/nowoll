'use client'

import { Button, Input } from '@nowoll/ui'
import { emailSchema } from '@nowoll/validation'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { forgotPassword } from '@/lib/auth-api'
import { FormProblem, problemText } from './auth-card'

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = emailSchema.safeParse(email)
    setError(parsed.success ? undefined : 'Enter a valid email address')
    if (!parsed.success) return
    setSending(true)
    setProblem(null)
    const result = await forgotPassword(parsed.data)
    setSending(false)
    if (!result.ok) return setProblem(problemText(result))
    setSent(true)
  }

  if (sent)
    return (
      <div role="status" className="flex flex-col gap-3">
        {/* The same words whether or not the email has an account (privacy). */}
        <p>
          If <strong>{email.trim().toLowerCase()}</strong> has a Nowoll account, we&apos;ve sent it
          a link to choose a new password. It may take a few minutes — check your spam folder too.
        </p>
        <Link href="/login" className="font-medium underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    )

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Input
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={error}
      />
      <FormProblem message={problem} />
      <Button type="submit" size="lg" disabled={sending}>
        {sending ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  )
}
