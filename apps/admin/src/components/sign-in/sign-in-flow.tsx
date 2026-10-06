'use client'

import { Button, Input } from '@nowoll/ui'
import Image from 'next/image'
import { type FormEvent, useEffect, useState } from 'react'
import type { ApiCallResult } from '@/lib/api'
import { fetchAdmin, signIn, startEnrolment, verifyCode } from '@/lib/admin-auth-api'

// ============================================================================
// Admin sign-in, in two steps (step 29a):
//   1. email + password
//   2. the 6-digit code from an authenticator app (Google Authenticator,
//      Microsoft Authenticator, 1Password, …). The very first time, the app is
//      set up by scanning a QR code — then the same code step follows.
// A STATE MACHINE: `step` is the one source of truth for which screen shows.
// ============================================================================

type Step =
  | { name: 'checking' }
  | { name: 'password' }
  | { name: 'enroll'; qrCode: string; secret: string }
  | { name: 'verify' }

export function SignInFlow({ next }: { next: string }) {
  const [step, setStep] = useState<Step>({ name: 'checking' })
  const [problem, setProblem] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // Already fully signed in (e.g. an old bookmark to this page) → straight on.
  useEffect(() => {
    let live = true
    void fetchAdmin().then((r) => {
      if (!live) return
      if (r.ok) window.location.replace(next)
      else setStep({ name: 'password' })
    })
    return () => {
      live = false
    }
  }, [next])

  /** Runs one API call with the shared "sending…" and error handling. */
  async function run<T>(
    request: Promise<ApiCallResult<T>>,
    onOk: (data: T) => void | Promise<void>,
  ) {
    setSending(true)
    setProblem(null)
    const result = await request
    if (result.ok) await onOk(result.data)
    else {
      setProblem(problemText(result))
      // The password step's session ran out or was refused → start again.
      if (result.status === 401 || result.status === 403) setStep({ name: 'password' })
    }
    setSending(false)
  }

  const passwordDone = async ({ next: then }: { next: 'enroll' | 'verify' }) => {
    if (then === 'verify') return setStep({ name: 'verify' })
    const qr = await startEnrolment()
    if (qr.ok) setStep({ name: 'enroll', ...qr.data })
    else setProblem(problemText(qr))
  }

  if (step.name === 'checking')
    return <p className="mt-6 text-sm text-muted-foreground">Loading…</p>

  return (
    <div className="mt-6 flex flex-col gap-4">
      {step.name === 'password' && (
        <PasswordForm
          sending={sending}
          onSubmit={(email, password) => run(signIn({ email, password }), passwordDone)}
          onProblem={setProblem}
        />
      )}
      {step.name === 'enroll' && <EnrolInstructions qrCode={step.qrCode} secret={step.secret} />}
      {(step.name === 'enroll' || step.name === 'verify') && (
        <CodeForm
          sending={sending}
          firstTime={step.name === 'enroll'}
          onSubmit={(code) => run(verifyCode(code), () => window.location.replace(next))}
          onProblem={setProblem}
        />
      )}
      {problem && (
        <p role="alert" className="rounded-control bg-danger-soft p-3 text-sm text-danger">
          {problem}
        </p>
      )}
    </div>
  )
}

function PasswordForm(props: {
  sending: boolean
  onSubmit: (email: string, password: string) => void
  onProblem: (message: string) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return props.onProblem('Enter your email and password.')
    props.onSubmit(email.trim(), password)
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Input
        label="Email"
        type="email"
        inputMode="email"
        autoComplete="username"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" size="lg" disabled={props.sending}>
        {props.sending ? 'Checking…' : 'Continue'}
      </Button>
    </form>
  )
}

function EnrolInstructions({ qrCode, secret }: { qrCode: string; secret: string }) {
  return (
    <section aria-labelledby="enrol-heading" className="flex flex-col gap-3">
      <h2 id="enrol-heading" className="font-semibold">
        Set up two-factor authentication
      </h2>
      <p className="text-sm text-muted-foreground">
        Admin accounts need a second step at every sign-in. Open an authenticator app on your phone
        (for example Google Authenticator), add an account, and scan this code:
      </p>
      {/* The QR code is an SVG made by Supabase, given as a data: URL — nothing to optimise. */}
      <Image
        src={qrCode}
        alt="QR code for your authenticator app"
        width={192}
        height={192}
        unoptimized
        className="self-center rounded-control bg-white p-2"
      />
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Can’t scan it?</summary>
        <p className="mt-2 text-muted-foreground">Type this key into the app instead:</p>
        <code className="mt-1 block break-all rounded-control bg-surface-muted p-2 font-mono">
          {secret}
        </code>
      </details>
    </section>
  )
}

function CodeForm(props: {
  sending: boolean
  firstTime: boolean
  onSubmit: (code: string) => void
  onProblem: (message: string) => void
}) {
  const [code, setCode] = useState('')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const digits = code.replace(/\s/g, '')
    if (!/^\d{6}$/.test(digits))
      return props.onProblem('Enter the 6-digit code from your authenticator app.')
    props.onSubmit(digits)
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Input
        label="6-digit code"
        hint={
          props.firstTime
            ? 'The code the app shows for Nowoll after scanning.'
            : 'Open your authenticator app and enter the code it shows for Nowoll.'
        }
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <Button type="submit" size="lg" disabled={props.sending}>
        {props.sending ? 'Checking…' : 'Sign in'}
      </Button>
    </form>
  )
}

/** A friendly message for any failed call (429 and offline included). */
function problemText(r: { status: number; message: string }): string {
  if (r.status === 429) return 'Too many tries — please wait a minute and try again.'
  return r.message
}
