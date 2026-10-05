'use client'

import { Button, Input } from '@nowoll/ui'
import { passwordSchema } from '@nowoll/validation'
import Link from 'next/link'
import { type FormEvent, useState } from 'react'
import { resetPassword } from '@/lib/auth-api'
import { useSessionStore } from '@/stores/session-store'
import { FormProblem, problemText } from './auth-card'

/** From the emailed link: /reset-password?token_hash=…&type=recovery */
export function ResetPasswordForm({ tokenHash }: { tokenHash: string | null }) {
  const signedIn = useSessionStore((s) => s.signedIn)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<{ message: string; expired: boolean } | null>(null)

  if (!tokenHash)
    return (
      <div className="flex flex-col gap-3">
        <p>This page needs the link from your password-reset email.</p>
        <Link href="/forgot-password" className="font-medium underline underline-offset-4">
          Get a new link
        </Link>
      </div>
    )

  async function submit(e: FormEvent) {
    e.preventDefault()
    const parsed = passwordSchema.safeParse(password)
    setError(parsed.success ? undefined : parsed.error.issues[0]?.message)
    if (!parsed.success || !tokenHash) return
    setSending(true)
    setProblem(null)
    const result = await resetPassword({ tokenHash, password })
    setSending(false)
    if (!result.ok)
      return setProblem({
        message: problemText(result),
        expired: result.error === 'RESET_LINK_INVALID',
      })
    signedIn(result.data.user)
    window.location.replace('/account')
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Input
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={error}
      />
      <FormProblem message={problem?.message ?? null} />
      {problem?.expired && (
        <Link href="/forgot-password" className="font-medium underline underline-offset-4">
          Get a new link
        </Link>
      )}
      <Button type="submit" size="lg" disabled={sending}>
        {sending ? 'Saving…' : 'Save new password'}
      </Button>
    </form>
  )
}
