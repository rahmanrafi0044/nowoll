'use client'

import { Button } from '@nowoll/ui'
import { type FormEvent, useId, useState } from 'react'
import { askBackInStock } from '@/lib/stock-alert-api'

type State = { kind: 'idle' | 'sending' | 'done' } | { kind: 'error'; message: string }

/**
 * "Notify me when it's back" (38f), shown instead of Add to bag when the chosen
 * size is sold out. Just an email — no account needed. We email once when the
 * shop restocks that size (the notification worker), then never again for it.
 * `key={variantId}` on the parent resets it when another size is chosen.
 */
export function NotifyMe({ variantId, label }: { variantId: string; label: string }) {
  const id = useId()
  const [email, setEmail] = useState('')
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!/^\S+@\S+\.\S+$/.test(email.trim()))
      return setState({ kind: 'error', message: 'Enter your email address, e.g. you@example.com' })
    setState({ kind: 'sending' })
    const r = await askBackInStock(variantId, email.trim())
    setState(r.ok ? { kind: 'done' } : { kind: 'error', message: r.message })
  }

  if (state.kind === 'done')
    return (
      <p role="status" className="border border-border bg-surface-muted p-4 text-sm">
        Done — we’ll email you once when <strong>{label}</strong> is back.
      </p>
    )

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3 border border-border p-4"
    >
      <p id={`${id}-title`} className="text-sm">
        <strong className="font-medium">{label} is sold out.</strong> Leave your email and we’ll
        tell you when it’s back.
      </p>
      <div className="flex flex-wrap gap-2">
        <label htmlFor={`${id}-email`} className="sr-only">
          Your email
        </label>
        <input
          id={`${id}-email`}
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-invalid={state.kind === 'error' || undefined}
          aria-describedby={state.kind === 'error' ? `${id}-error` : `${id}-note`}
          className="h-12 min-w-0 flex-1 rounded-control border border-border-strong bg-surface px-3 text-base"
        />
        <Button type="submit" size="lg" disabled={state.kind === 'sending'}>
          {state.kind === 'sending' ? 'Sending…' : 'Notify me'}
        </Button>
      </div>
      {state.kind === 'error' ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {state.message}
        </p>
      ) : (
        <p id={`${id}-note`} className="text-xs text-muted-foreground">
          One email, only about this size. No newsletter.
        </p>
      )}
    </form>
  )
}
