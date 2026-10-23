'use client'

import { Button, Input } from '@nowoll/ui'
import {
  EMAIL_KIND_KEYS,
  EMAIL_KINDS,
  type EmailKind,
  type EmailWording,
  emailWordingSchema,
  EMPTY_EMAIL_WORDING,
  PLACEHOLDER_HELP,
} from '@nowoll/validation'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { TextArea } from '@/components/form-fields'
import {
  clearEmailWording,
  type EmailWordingBlock,
  fetchEmailWording,
  saveEmailWording,
  sendTestEmail,
} from '@/lib/email-wording-api'
import { SaveProblems } from './fields'

// ============================================================================
// Admin → Content → Emails (step 43b). ADMIN only (the API enforces it).
// Per customer email: subject, heading, opening paragraph — plain text with
// {placeholders}. Empty = the built-in wording. The facts (amounts, receipt,
// tracking, instructions, buttons) and the layout stay fixed, so emails are
// always complete and display well everywhere. "Send me a test" sends the
// example email with what's on screen to your own admin email.
// ============================================================================

type Problem = { message: string; details?: string[] }

/** Today's built-in wording, so the admin knows what an empty field means. */
const BUILT_IN: Record<EmailKind, { subject: string; heading: string }> = {
  welcome: { subject: 'Welcome to {store}', heading: 'Welcome, {name}!' },
  'order-confirmation': { subject: 'Order {order} — thank you!', heading: 'Thank you, {name}!' },
  'payment-confirmed': {
    subject: 'Payment received — order {order}',
    heading: 'Payment received ✓',
  },
  'order-shipped': { subject: 'Order {order} is on its way', heading: 'Your order is on its way' },
  'order-delivered': {
    subject: 'Order {order} has been delivered',
    heading: 'Delivered — we hope you love it',
  },
  'return-approved': {
    subject: 'Your return for order {order} is approved',
    heading: 'Return approved',
  },
  'return-rejected': {
    subject: 'About your return for order {order}',
    heading: 'We couldn’t accept this return',
  },
  'refund-processed': {
    subject: 'Refund of {amount} — order {order}',
    heading: 'Your refund is on its way',
  },
  'newsletter-confirm': {
    subject: 'Confirm your {store} newsletter subscription',
    heading: 'One click to confirm',
  },
  'back-in-stock': { subject: 'Back in stock: {product}', heading: 'It’s back' },
}

/** What stays fixed in each email (shown so nobody expects to edit it here). */
const FIXED: Record<EmailKind, string> = {
  welcome: 'the “Start shopping” button',
  'order-confirmation':
    'the order number and date, “please pay ৳… in cash when your parcel arrives”, the receipt, the address and the order button',
  'payment-confirmed':
    'the amount paid, the order number and date, the receipt and the order button',
  'order-shipped': 'the order number, courier and tracking number, and the tracking button',
  'order-delivered': 'the order number, the return window and the order button',
  'return-approved': 'the order number, the items, your return instructions and the button',
  'return-rejected': 'the order number, your reason and the button',
  'refund-processed': 'the amount refunded, how it comes back, and the button',
  'newsletter-confirm': 'the “Yes, subscribe me” button and the unsubscribe line',
  'back-in-stock':
    'the product, size and price, the “Shop it now” button, and the “we email you once” note',
}

export function EmailWordingEditor() {
  const { state, retry } = useLoad(fetchEmailWording)
  return (
    <Panel title="Emails" state={state} retry={retry} className="border-0 bg-transparent p-0">
      {(block) => <EmailWordingForm key={String(block.updatedAt)} block={block} />}
    </Panel>
  )
}

export function EmailWordingForm({ block }: { block: EmailWordingBlock }) {
  const parsed = emailWordingSchema.safeParse(block.data ?? {})
  const initial: EmailWording = parsed.success ? parsed.data : EMPTY_EMAIL_WORDING
  const [w, setW] = useState<EmailWording>(initial)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const dirty = JSON.stringify(w) !== JSON.stringify(initial)

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const setText = (kind: EmailKind, field: 'subject' | 'heading' | 'intro', value: string) => {
    setDone(null)
    setW((cur) => ({
      ...cur,
      emails: {
        ...cur.emails,
        [kind]: { subject: '', heading: '', intro: '', ...cur.emails[kind], [field]: value },
      },
    }))
  }

  /** Checked with the same rules as the API, before anything is sent. */
  function checked(): EmailWording | null {
    const r = emailWordingSchema.safeParse(w)
    if (r.success) return r.data
    setProblem({
      message: 'Some wording needs fixing:',
      details: r.error.issues.map((i) => {
        const kind = i.path[1] as EmailKind | undefined
        const where =
          kind && EMAIL_KINDS[kind]
            ? `${EMAIL_KINDS[kind].label} › ${String(i.path[2])}`
            : String(i.path[0])
        return `${where}: ${i.message}`
      }),
    })
    return null
  }

  async function save() {
    const data = checked()
    if (!data) return
    setBusy(true)
    setProblem(null)
    setDone(null)
    const r = await saveEmailWording(data)
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setDone('Saved — the next emails use it.')
  }

  async function test(kind: EmailKind) {
    const data = checked()
    if (!data) return
    setProblem(null)
    setDone(null)
    const r = await sendTestEmail(kind, data)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setDone(`Test sent to ${r.data.sentTo} — check your inbox (it says [Test] in the subject).`)
  }

  async function reset() {
    setConfirmReset(false)
    setBusy(true)
    const r = await clearEmailWording()
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    setW(EMPTY_EMAIL_WORDING)
    setDone('Back to the built-in wording.')
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Emails</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What your emails to customers say. Empty fields keep the built-in wording. Write plain
          text — placeholders in curly brackets fill in by themselves. The facts (amounts, receipts,
          tracking, buttons) and the layout stay fixed, so emails are always complete and look right
          in every email app.
        </p>
      </div>

      <section
        aria-label="Every email"
        className="grid gap-4 rounded-lg border border-border bg-surface p-5 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <TextArea
            label="Footer line"
            value={w.footer}
            maxLength={300}
            rows={2}
            placeholder="You're receiving this because you shopped at {store}. Reply to this email if you need help."
            onChange={(e) => setW({ ...w, footer: e.target.value })}
            hint="At the bottom of every email (the newsletter keeps its own unsubscribe line). Empty = the built-in line."
          />
        </div>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            checked={w.showLogo}
            onChange={(e) => setW({ ...w, showLogo: e.target.checked })}
          />
          <span>
            <span className="font-medium">Show the logo at the top</span>
            <span className="block text-muted-foreground">
              Uses your logo from{' '}
              <Link href="/admin/settings" className="underline underline-offset-4">
                Settings → Look
              </Link>{' '}
              (PNG or JPEG — many email apps can’t show WebP). Otherwise the store name.
            </span>
          </span>
        </label>
      </section>

      {EMAIL_KIND_KEYS.map((kind) => {
        const e = w.emails[kind] ?? { subject: '', heading: '', intro: '' }
        const placeholders = EMAIL_KINDS[kind].placeholders.map((p) => `{${p}}`).join(' ')
        const changed = !!(e.subject || e.heading || e.intro)
        return (
          <details
            key={kind}
            className="rounded-lg border border-border bg-surface p-5"
            open={changed}
          >
            <summary className="cursor-pointer font-semibold">
              {EMAIL_KINDS[kind].label}
              {changed && (
                <span className="ml-2 text-xs font-normal text-success">your wording</span>
              )}
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input
                label="Subject"
                value={e.subject}
                maxLength={120}
                placeholder={BUILT_IN[kind].subject}
                onChange={(x) => setText(kind, 'subject', x.target.value)}
              />
              <Input
                label="Heading"
                value={e.heading}
                maxLength={120}
                placeholder={BUILT_IN[kind].heading}
                onChange={(x) => setText(kind, 'heading', x.target.value)}
              />
              <div className="sm:col-span-2">
                <TextArea
                  label="Opening paragraph"
                  value={e.intro}
                  maxLength={600}
                  rows={3}
                  onChange={(x) => setText(kind, 'intro', x.target.value)}
                  hint="Replaces the friendly first words; empty = the built-in ones."
                />
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Placeholders: {placeholders} —{' '}
                {EMAIL_KINDS[kind].placeholders
                  .map((p) => `{${p}} = ${PLACEHOLDER_HELP[p]}`)
                  .join(', ')}
                .
                <br />
                Always included (not editable): {FIXED[kind]}.
              </p>
              <div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void test(kind)}
                >
                  Send me a test
                </Button>
              </div>
            </div>
          </details>
        )
      })}

      <SaveProblems problem={problem} />
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-surface py-3">
        <Button disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        {!confirmReset ? (
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmReset(true)}>
            Back to built-in wording
          </Button>
        ) : (
          <span
            role="group"
            aria-label="Confirm going back to the built-in wording"
            className="flex items-center gap-2 text-sm"
          >
            Remove all your wording?
            <Button size="sm" variant="secondary" onClick={() => setConfirmReset(false)}>
              Keep it
            </Button>
            <Button size="sm" onClick={() => void reset()}>
              Yes, remove
            </Button>
          </span>
        )}
        {dirty && <span className="text-sm text-warning">Unsaved changes</span>}
        {done && (
          <span role="status" className="text-sm text-success">
            {done}
          </span>
        )}
      </div>
    </div>
  )
}
