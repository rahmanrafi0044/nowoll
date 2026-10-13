'use client'

import type { AdminSubscriberRow, NewsletterSyncStatus, SubscriberStatusView } from '@nowoll/types'
import { Badge, Button, Input } from '@nowoll/ui'
import Link from 'next/link'
import { type FormEvent, useCallback, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { SelectField } from '@/components/form-fields'
import { formatInstantDate, formatInstantDateTime } from '@/lib/date'
import {
  eraseSubscriber,
  exportSubscribersCsv,
  fetchNewsletterSync,
  fetchSubscribers,
  type SubscriberFilters,
  syncEveryone,
  unsubscribeSubscriber,
} from '@/lib/newsletter-api'

// ============================================================================
// Admin → Newsletter (step 42). ADMIN only (the API enforces it). The list of
// people who signed up (double opt-in), and the copy in Resend, where
// newsletters are written and sent. Guide: docs/integrations/resend.md.
// ============================================================================

const STATUS: Record<
  SubscriberStatusView,
  { label: string; variant: 'success' | 'warning' | 'neutral' }
> = {
  SUBSCRIBED: { label: 'Confirmed', variant: 'success' },
  PENDING: { label: 'Waiting for confirmation', variant: 'warning' },
  UNSUBSCRIBED: { label: 'Unsubscribed', variant: 'neutral' },
}
const SOURCE: Record<string, string> = {
  homepage: 'Homepage',
  footer: 'Footer',
  checkout: 'Checkout',
}

export function NewsletterPage() {
  const [filters, setFilters] = useState<SubscriberFilters>({ page: 1 })
  const load = useCallback(() => fetchSubscribers(filters), [filters])
  const list = useLoad(load)
  const sync = useLoad(fetchNewsletterSync)
  const [search, setSearch] = useState('')
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  const refresh = () => {
    list.refresh()
    sync.refresh()
  }
  function onSearch(e: FormEvent) {
    e.preventDefault()
    setFilters((f) => ({ ...f, q: search.trim() || undefined, page: 1 }))
  }
  async function exportCsv() {
    const r = await exportSubscribersCsv()
    if (!r.ok) setNote({ ok: false, text: r.message })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Newsletter</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            People who signed up and confirmed by email. Write and send newsletters in Resend
            (Broadcasts) — the confirmed people are copied there. Sign-up places:{' '}
            <Link href="/admin/settings" className="underline underline-offset-4">
              Settings → Newsletter
            </Link>
            .
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void exportCsv()}>
          Download CSV (confirmed)
        </Button>
      </div>

      {list.state.status === 'ok' && (
        <ul aria-label="Subscribers" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(
            [
              ['Confirmed', list.state.data.counts.subscribed],
              ['Waiting for confirmation', list.state.data.counts.pending],
              ['Unsubscribed', list.state.data.counts.unsubscribed],
              ['New in the last 30 days', list.state.data.counts.newLast30Days],
            ] as const
          ).map(([label, n]) => (
            <li key={label} className="rounded-lg border border-border bg-surface p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{n}</p>
            </li>
          ))}
        </ul>
      )}

      <Panel title="Copy in Resend" state={sync.state} retry={sync.retry}>
        {(s) => <ResendBox s={s} onQueued={(text) => setNote({ ok: true, text })} />}
      </Panel>

      {note && (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={`text-sm ${note.ok ? 'text-success' : 'text-danger'}`}
        >
          {note.text}
        </p>
      )}

      <Panel title="People" state={list.state} retry={list.retry}>
        {(page) => (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <form onSubmit={onSearch} className="flex items-end gap-2" role="search">
                <div className="w-64">
                  <Input
                    label="Search by email"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Button type="submit" size="sm" variant="secondary">
                  Search
                </Button>
              </form>
              <div className="w-56">
                <SelectField
                  label="Show"
                  value={filters.status ?? ''}
                  onChange={(e) =>
                    setFilters((f) => ({
                      ...f,
                      status: (e.target.value || undefined) as SubscriberStatusView | undefined,
                      page: 1,
                    }))
                  }
                >
                  <option value="">Everyone</option>
                  <option value="SUBSCRIBED">Confirmed</option>
                  <option value="PENDING">Waiting for confirmation</option>
                  <option value="UNSUBSCRIBED">Unsubscribed</option>
                </SelectField>
              </div>
            </div>
            {page.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody here yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-1.5 font-medium">Email</th>
                    <th className="py-1.5 font-medium">Status</th>
                    <th className="py-1.5 font-medium">Signed up</th>
                    <th className="py-1.5 font-medium">In Resend</th>
                    <th className="py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((s) => (
                    <Row key={s.id} s={s} onChanged={refresh} onNote={setNote} />
                  ))}
                </tbody>
              </table>
            )}
            {page.total > page.pageSize && (
              <div className="flex items-center gap-3 text-sm">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={page.page <= 1}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
                >
                  ← Newer
                </Button>
                <span className="text-muted-foreground">
                  Page {page.page} of {Math.ceil(page.total / page.pageSize)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={page.page * page.pageSize >= page.total}
                  onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
                >
                  Older →
                </Button>
              </div>
            )}
          </div>
        )}
      </Panel>
    </div>
  )
}

function ResendBox({ s, onQueued }: { s: NewsletterSyncStatus; onQueued: (text: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  async function syncAll() {
    setBusy(true)
    setProblem(null)
    const r = await syncEveryone()
    setBusy(false)
    if (!r.ok) return setProblem(r.message)
    onQueued('Started — everyone not yet in Resend is being copied. Refresh in a minute to see it.')
  }
  const ready = s.enabled && s.segmentSet
  return (
    <div className="flex flex-col gap-3 text-sm">
      <ul aria-label="Resend setup" className="flex flex-col gap-1.5">
        <Check
          done={s.enabled}
          text="Copying to Resend is switched on"
          fix="Settings → Newsletter"
        />
        <Check done={s.segmentSet} text="Resend segment id" fix="Settings → Newsletter" />
        <Check
          done={s.webhookSet}
          text="Unsubscribes in Resend come back here (webhook)"
          fix="A one-time server step: RESEND_WEBHOOK_SECRET (guide: docs/integrations/resend.md)"
        />
      </ul>
      <p>
        <strong>{s.synced}</strong> confirmed people are in Resend · <strong>{s.waiting}</strong>{' '}
        not yet
        {s.failed > 0 && (
          <>
            {' '}
            · <strong className="text-danger">{s.failed} failed</strong>
          </>
        )}
      </p>
      {s.lastError && <p className="text-danger">Last problem: {s.lastError}</p>}
      <div>
        <Button
          size="sm"
          variant="secondary"
          disabled={!ready || busy}
          onClick={() => void syncAll()}
        >
          {busy ? 'Starting…' : 'Sync everyone now'}
        </Button>
        {!ready && (
          <span className="ml-3 text-muted-foreground">
            Switch it on and add the segment id first.
          </span>
        )}
      </div>
      {problem && (
        <p role="alert" className="text-danger">
          {problem}
        </p>
      )}
    </div>
  )
}

function Check({ done, text, fix }: { done: boolean; text: string; fix: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-2">
      <Badge variant={done ? 'success' : 'warning'}>{done ? 'Done' : 'To do'}</Badge>
      <span className="font-medium">{text}</span>
      {!done && <span className="text-muted-foreground">— {fix}</span>}
    </li>
  )
}

function Row({
  s,
  onChanged,
  onNote,
}: {
  s: AdminSubscriberRow
  onChanged: () => void
  onNote: (n: { ok: boolean; text: string }) => void
}) {
  const [busy, setBusy] = useState(false)
  async function unsubscribe() {
    setBusy(true)
    const r = await unsubscribeSubscriber(s.id)
    setBusy(false)
    if (!r.ok) return onNote({ ok: false, text: r.message })
    onNote({ ok: true, text: `${s.email} is unsubscribed.` })
    onChanged()
  }
  async function erase() {
    if (
      !window.confirm(
        `Delete ${s.email} completely? Use this when they ask for their data to be deleted. It can't be undone.`,
      )
    )
      return
    setBusy(true)
    const r = await eraseSubscriber(s.id)
    setBusy(false)
    if (!r.ok) return onNote({ ok: false, text: r.message })
    onNote({ ok: true, text: `${s.email} is deleted (also from Resend).` })
    onChanged()
  }
  return (
    <tr className="border-b border-border align-top">
      <td className="py-1.5 pr-3 break-all">{s.email}</td>
      <td className="py-1.5 pr-3">
        <Badge variant={STATUS[s.status].variant}>{STATUS[s.status].label}</Badge>
      </td>
      <td className="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">
        {formatInstantDate(s.createdAt)}
        {s.source && <span className="block text-xs">{SOURCE[s.source] ?? s.source}</span>}
      </td>
      <td className="py-1.5 pr-3 text-xs">
        {s.resendError ? (
          <span className="text-danger">{s.resendError}</span>
        ) : s.resendSyncedAt ? (
          <span className="text-muted-foreground">
            Up to date · {formatInstantDateTime(s.resendSyncedAt)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="py-1.5 text-right whitespace-nowrap">
        {s.status !== 'UNSUBSCRIBED' && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void unsubscribe()}>
            Unsubscribe
          </Button>
        )}
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void erase()}>
          Delete
        </Button>
      </td>
    </tr>
  )
}
