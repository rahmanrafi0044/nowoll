'use client'

import { Button, Input } from '@nowoll/ui'
import Link from 'next/link'
import { type FormEvent, useEffect, useState } from 'react'
import { login, safeNext } from '@/lib/auth-api'
import { useSessionStore } from '@/stores/session-store'
import { FormProblem, problemText } from './auth-card'

export function LoginForm({ next }: { next: string | null }) {
  const target = safeNext(next)
  const status = useSessionStore((s) => s.status)
  const load = useSessionStore((s) => s.load)
  const signedIn = useSessionStore((s) => s.signedIn)
  const [form, setForm] = useState({ email: '', password: '' })
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  // Already signed in (e.g. arrived from a link) → straight on.
  useEffect(() => void load(), [load])
  useEffect(() => {
    if (status === 'signed-in') window.location.replace(target)
  }, [status, target])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!form.email.trim() || !form.password) return setProblem('Enter your email and password.')
    setSending(true)
    setProblem(null)
    const result = await login({ email: form.email.trim(), password: form.password })
    setSending(false)
    if (!result.ok) return setProblem(problemText(result))
    signedIn(result.data.user)
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Input
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />
      <Link href="/forgot-password" className="self-end text-sm underline underline-offset-4">
        Forgot your password?
      </Link>
      <FormProblem message={problem} />
      <Button type="submit" size="lg" disabled={sending}>
        {sending ? 'Signing in…' : 'Sign in'}
      </Button>
      <p className="text-sm text-muted-foreground">
        New here?{' '}
        <Link
          href={next ? `/register?next=${encodeURIComponent(target)}` : '/register'}
          className="font-medium text-foreground underline underline-offset-4"
        >
          Create an account
        </Link>{' '}
        — or simply check out as a guest.
      </p>
    </form>
  )
}
