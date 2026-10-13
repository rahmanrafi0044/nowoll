'use client'

import { Button, Input } from '@nowoll/ui'
import { emailSchema } from '@nowoll/validation'
import { type FormEvent, useState } from 'react'
import { publicEnv } from '@/lib/env'

type State = { status: 'idle' | 'sending' } | { status: 'done' | 'error'; message: string }

// Newsletter sign-up (double opt-in, step 1 — see apps/api subscribers module).
// A Client Component: it needs state and runs in the browser.
export function NewsletterForm({
  source = 'homepage',
  label = 'Email address',
}: {
  source?: 'homepage' | 'footer'
  /** The field's label (the footer's differs, so a page with both stays clear). */
  label?: string
}) {
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<string>()
  const [state, setState] = useState<State>({ status: 'idle' })

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    // Same email rule as the API, from @nowoll/validation — instant feedback, no round trip.
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success) {
      setFieldError('Enter a valid email address')
      return
    }
    setFieldError(undefined)
    setState({ status: 'sending' })

    try {
      const res = await fetch(`${publicEnv.apiUrl}/api/v1/subscribers`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: parsed.data, source }),
      })
      const body = (await res.json()) as { success: boolean; data?: { message: string } }
      if (res.status === 429) {
        setState({ status: 'error', message: 'Too many attempts — please try again in a minute.' })
      } else if (!res.ok || !body.success || !body.data) {
        setState({ status: 'error', message: 'Something went wrong. Please try again.' })
      } else {
        setState({ status: 'done', message: body.data.message })
        setEmail('')
      }
    } catch {
      setState({
        status: 'error',
        message: 'Could not connect. Check your internet and try again.',
      })
    }
  }

  if (state.status === 'done') {
    return (
      <p role="status" className="text-base font-medium text-success">
        {state.message}
      </p>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="flex w-full max-w-md flex-col gap-3 sm:flex-row sm:items-start"
    >
      <div className="flex-1">
        <Input
          label={label}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldError}
        />
      </div>
      <Button type="submit" disabled={state.status === 'sending'} className="sm:mt-7">
        {state.status === 'sending' ? 'Signing up…' : 'Sign up'}
      </Button>
      {state.status === 'error' && (
        <p role="alert" className="text-sm text-danger sm:basis-full">
          {state.message}
        </p>
      )}
    </form>
  )
}
