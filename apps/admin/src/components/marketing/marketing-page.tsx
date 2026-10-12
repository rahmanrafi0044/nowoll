'use client'

import type { CatalogFeedReportView, MarketingStatusView, MetaEventLogView } from '@nowoll/types'
import { Badge, Button, Input } from '@nowoll/ui'
import Link from 'next/link'
import { type FormEvent, type ReactNode, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { formatInstantDateTime } from '@/lib/date'
import {
  fetchCatalogFeed,
  fetchMarketingStatus,
  fetchMetaEvents,
  sendTestEvent,
} from '@/lib/marketing-api'
import { saveSettings } from '@/lib/settings-api'

// ============================================================================
// Admin → Marketing (step 39b). ADMIN only (the API enforces it).
// Meta's Conversions API: a setup checklist, a "send test event" button and
// the delivery log. The access token is a secret in the server's .env —
// this page only says whether it is set (CLAUDE.md Rule 9).
// Guide: docs/integrations/meta.md → "Getting the access token".
// ============================================================================

export function MarketingPage() {
  const status = useLoad(fetchMarketingStatus)
  const log = useLoad(fetchMetaEvents)
  const refreshAll = () => {
    status.refresh()
    log.refresh()
  }
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Marketing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Meta (Facebook, Instagram) learns which ads bring sales. Besides the Pixel in the
          customer’s browser, the server sends each <strong>sale</strong> and each{' '}
          <strong>delivered order</strong> to Meta — only for customers who allowed Marketing
          cookies, with their details scrambled (hashed) first.
        </p>
      </div>
      <Panel title="Setup checklist" state={status.state} retry={status.retry}>
        {(s) => <Checklist s={s} />}
      </Panel>
      <TestEvent onSent={refreshAll} />
      <CatalogFeed />
      <Panel
        title="Delivery log"
        subtitle="The newest 100 events. No customer details are kept here."
        state={log.state}
        retry={log.retry}
      >
        {(rows) => <Log rows={rows} />}
      </Panel>
    </div>
  )
}

function Checklist({ s }: { s: MarketingStatusView }) {
  const items: { done: boolean; text: string; fix: ReactNode }[] = [
    {
      done: s.pixelIdSet,
      text: 'Meta Pixel ID',
      fix: <Link href="/admin/settings">Add it in Settings → Marketing and tracking</Link>,
    },
    {
      done: s.domainVerificationSet,
      text: 'Domain verified with Meta',
      fix: (
        <Link href="/admin/settings">
          Paste Meta’s code in Settings (or use Meta’s DNS method — then ignore this)
        </Link>
      ),
    },
    {
      done: s.tokenSet,
      text: 'Access token on the server',
      fix: 'A one-time server step: META_CAPI_ACCESS_TOKEN in the server’s .env (secret — never entered here). Guide: docs/integrations/meta.md',
    },
    {
      done: s.serverEventsOn,
      text: 'Send events from the server — switched on',
      fix: <Link href="/admin/settings">Switch it on in Settings → Marketing and tracking</Link>,
    },
  ]
  return (
    <div className="flex flex-col gap-4">
      <ul aria-label="Checklist" className="flex flex-col gap-2 text-sm">
        {items.map((i) => (
          <li key={i.text} className="flex flex-wrap items-baseline gap-2">
            <Badge variant={i.done ? 'success' : 'warning'}>{i.done ? 'Done' : 'To do'}</Badge>
            <span className="font-medium">{i.text}</span>
            {!i.done && (
              <span className="text-muted-foreground [&_a]:underline [&_a]:underline-offset-4">
                — {i.fix}
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        Last event Meta accepted:{' '}
        <strong className="text-foreground">
          {s.lastSentAt ? formatInstantDateTime(s.lastSentAt) : 'none yet'}
        </strong>
        {s.lastFailure && (
          <>
            {' '}
            · Last problem ({formatInstantDateTime(s.lastFailure.at)}):{' '}
            <span className="text-danger">{s.lastFailure.message}</span>
          </>
        )}
      </p>
    </div>
  )
}

function TestEvent({ onSent }: { onSent: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setResult(null)
    const r = await sendTestEvent(code.trim())
    setBusy(false)
    if (!r.ok) return setResult({ ok: false, text: r.message })
    const d = r.data
    setResult(
      d.ok
        ? {
            ok: true,
            text: `Meta received it (${d.eventsReceived} event). Look in Events Manager → Test events — it can take a few minutes.${d.messages.length ? ` Meta notes: ${d.messages.join(' · ')}` : ''}`,
          }
        : {
            ok: false,
            text: d.tokenProblem
              ? `${d.message} — the access token needs replacing (a server step, see the guide).`
              : d.message,
          },
    )
    onSent()
  }

  return (
    <section
      aria-label="Send a test event"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 className="font-semibold">Send a test event</h2>
      <p className="mt-0.5 mb-4 text-sm text-muted-foreground">
        In Meta Events Manager → your dataset → <strong>Test events</strong>, copy the code (it
        starts with TEST). We send one test sale with <em>your</em> admin email — never a
        customer’s. Use this while setting up only: Meta still counts test events.
      </p>
      <form onSubmit={(e) => void submit(e)} className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Input
            label="Test event code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="TEST12345"
          />
        </div>
        <Button type="submit" disabled={busy || !code.trim()}>
          {busy ? 'Sending…' : 'Send test event'}
        </Button>
      </form>
      {result && (
        <p
          role={result.ok ? 'status' : 'alert'}
          className={`mt-3 text-sm ${result.ok ? 'text-success' : 'text-danger'}`}
        >
          {result.text}
        </p>
      )}
    </section>
  )
}

const STATUS: Record<
  MetaEventLogView['status'],
  { label: string; variant: 'success' | 'danger' | 'neutral' }
> = {
  SENT: { label: 'Sent', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'danger' },
  SKIPPED: { label: 'Skipped', variant: 'neutral' },
}

function Log({ rows }: { rows: MetaEventLogView[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-2 pr-4 font-medium">When</th>
            <th className="py-2 pr-4 font-medium">Event</th>
            <th className="py-2 pr-4 font-medium">Order</th>
            <th className="py-2 pr-4 font-medium">Result</th>
            <th className="py-2 font-medium">Meta’s answer</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border align-top">
              <td className="py-2 pr-4 whitespace-nowrap">{formatInstantDateTime(r.createdAt)}</td>
              <td className="py-2 pr-4">
                {r.eventName}
                {r.test && (
                  <Badge variant="info" className="ml-2">
                    Test
                  </Badge>
                )}
              </td>
              <td className="py-2 pr-4 whitespace-nowrap">
                {r.orderNumber ? `NW-${r.orderNumber}` : '—'}
              </td>
              <td className="py-2 pr-4">
                <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
              </td>
              <td className="py-2 text-muted-foreground">
                {r.message ?? (r.status === 'SENT' ? `Received ${r.eventsReceived ?? 0}` : '')}
                {r.fbtraceId && <span className="block text-xs">Trace: {r.fbtraceId}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Catalog feed (step 39c) ────────────────────────────────────────────────

function CatalogFeed() {
  const { state, retry, refresh } = useLoad(fetchCatalogFeed)
  return (
    <Panel
      title="Catalog feed"
      subtitle="Your products for Meta’s catalogue (dynamic ads, Instagram/Facebook Shops). Meta fetches this address on a schedule — each size/colour is one item, with the same codes as the Pixel."
      state={state}
      retry={retry}
    >
      {(feed) => <FeedDetails feed={feed} onChanged={refresh} />}
    </Panel>
  )
}

function FeedDetails({ feed, onChanged }: { feed: CatalogFeedReportView; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  async function toggle() {
    setBusy(true)
    setNote(null)
    const r = await saveSettings({ meta_catalog_enabled: !feed.enabled })
    setBusy(false)
    if (!r.ok) return setNote({ ok: false, text: r.message })
    onChanged()
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(feed.url)
      setNote({
        ok: true,
        text: 'Copied. Paste it in Meta Commerce Manager → Data sources → Data feed.',
      })
    } catch {
      setNote({ ok: false, text: 'Couldn’t copy — select the address and copy it by hand.' })
    }
  }

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={feed.enabled ? 'success' : 'neutral'}>{feed.enabled ? 'On' : 'Off'}</Badge>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => void toggle()}>
          {busy ? 'Saving…' : feed.enabled ? 'Switch off' : 'Switch on'}
        </Button>
        <span className="text-muted-foreground">
          {feed.items} item{feed.items === 1 ? '' : 's'} (sizes/colours)
        </span>
      </div>
      {feed.enabled ? (
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-control bg-surface-muted px-2 py-1 break-all">{feed.url}</code>
          <Button size="sm" variant="ghost" onClick={() => void copy()}>
            Copy
          </Button>
          <a
            href={feed.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            Open
          </a>
        </div>
      ) : (
        <p className="text-muted-foreground">
          Off: the address answers “not found”. Switch it on when you’re ready to connect Meta.
        </p>
      )}
      {note && (
        <p role={note.ok ? 'status' : 'alert'} className={note.ok ? 'text-success' : 'text-danger'}>
          {note.text}
        </p>
      )}
      {feed.skipped.length > 0 && (
        <div>
          <p className="font-medium">Left out of the feed ({feed.skipped.length})</p>
          <ul aria-label="Left out of the feed" className="mt-1 flex flex-col gap-1">
            {feed.skipped.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/products/${p.id}`} className="underline underline-offset-4">
                  {p.name}
                </Link>{' '}
                — <span className="text-muted-foreground">{p.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
