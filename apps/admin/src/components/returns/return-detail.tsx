'use client'

import type { AdminRefundView, AdminReturnView } from '@nowoll/types'
import { Badge, Button, Input } from '@nowoll/ui'
import Link from 'next/link'
import { type FormEvent, type ReactNode, useCallback, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { FormProblem, TextArea } from '@/components/form-fields'
import { ProductThumb } from '@/components/products/product-thumb'
import { formatInstantDateTime } from '@/lib/date'
import { formatBdt } from '@/lib/format'
import { parsePrice } from '@/lib/money-input'
import { APPROVE_TEMPLATE, RETURN_REASON, RETURN_STATUS } from '@/lib/return-labels'
import {
  approveReturn,
  fetchReturn,
  receiveReturn,
  refundReturn,
  rejectReturn,
  resolveRefund,
} from '@/lib/returns-api'

// ============================================================================
// One return (step 35). The "Next step" box changes with the stage:
//   to decide → approve (instructions) or reject (reason)
//   waiting for parcel → parcel received (put each item back on sale or not)
//   to refund → refund (amount, SSLCommerz or by hand) — CONFIRMED before money moves
// A refund SSLCommerz is still processing, or never answered about, gets its
// own explanation and a "resolve" form for after checking their panel.
// ============================================================================

export function ReturnDetail({ id }: { id: string }) {
  const load = useCallback(() => fetchReturn(id), [id])
  const { state, retry, refresh } = useLoad(load)
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/returns"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Returns
      </Link>
      <Panel title="Return" state={state} retry={retry}>
        {(r) => (
          <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">Return of {r.orderNumber}</h1>
              <Badge variant={RETURN_STATUS[r.status].variant}>
                {RETURN_STATUS[r.status].label}
              </Badge>
              <Link
                href={`/admin/orders/${r.orderId}`}
                className="ml-auto text-sm font-medium underline underline-offset-4"
              >
                Open the order
              </Link>
            </header>
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="flex flex-col gap-6 lg:col-span-2">
                <Card title="Items">
                  <ul className="flex flex-col divide-y divide-border">
                    {r.items.map((i) => (
                      <li key={i.orderItemId} className="flex items-center gap-3 py-2.5 text-sm">
                        <ProductThumb
                          image={i.imageUrl ? { url: i.imageUrl, altText: i.productName } : null}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{i.productName}</span>
                          <span className="block text-xs text-muted-foreground">
                            {i.variantLabel}
                          </span>
                        </span>
                        <span className="tabular-nums">× {i.quantity}</span>
                        {r.receivedAt && (
                          <Badge variant={i.restock ? 'success' : 'neutral'}>
                            {i.restock ? 'Back on sale' : 'Not resold (damaged)'}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm">
                    <span className="font-medium">Reason:</span> {RETURN_REASON[r.reason]}
                  </p>
                  {r.customerNote && (
                    <p className="mt-2 rounded-control bg-surface-muted p-3 text-sm">
                      <span className="font-medium">Customer wrote:</span> {r.customerNote}
                    </p>
                  )}
                </Card>
                <Card title="Refunds">
                  <Refunds r={r} onChanged={refresh} />
                </Card>
                <Card title="History">
                  <Timeline r={r} />
                </Card>
              </div>
              <div className="flex flex-col gap-6">
                <Card title="Next step">
                  <NextStep key={r.status} r={r} onChanged={refresh} />
                </Card>
                <Card title="Customer">
                  <div className="flex flex-col gap-1 text-sm">
                    <Link
                      href={`/admin/customers/${r.customer.id}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {r.customer.name ?? r.customer.email}
                    </Link>
                    <a href={`tel:${r.customer.phone}`} className="underline underline-offset-4">
                      {r.customer.phone}
                    </a>
                    <span className="break-all text-muted-foreground">{r.customer.email}</span>
                    <span className="text-xs text-muted-foreground">
                      Paid {r.paymentMethod === 'COD' ? 'cash on delivery' : 'online (SSLCommerz)'}
                    </span>
                  </div>
                </Card>
              </div>
            </div>
          </div>
        )}
      </Panel>
    </div>
  )
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-border p-5">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Timeline({ r }: { r: AdminReturnView }) {
  const events = [
    { at: r.createdAt, text: 'Customer asked to return' },
    r.approvedAt && { at: r.approvedAt, text: 'Approved', note: r.adminNote },
    r.rejectedAt && { at: r.rejectedAt, text: 'Rejected', note: r.rejectionReason },
    r.receivedAt && { at: r.receivedAt, text: 'Parcel received' },
    ...r.refunds
      .filter((f) => f.status === 'PROCESSED')
      .map((f) => ({ at: f.processedAt ?? f.createdAt, text: `Refunded ${formatBdt(f.amount)}` })),
  ].filter((e): e is { at: string; text: string; note?: string | null } => !!e)
  return (
    <ol className="flex flex-col gap-3 text-sm">
      {events.reverse().map((e, i) => (
        <li key={`${e.at}-${i}`}>
          <span className="font-medium">{e.text}</span>
          <span className="text-muted-foreground"> · {formatInstantDateTime(e.at)}</span>
          {e.note && <span className="block">{e.note}</span>}
        </li>
      ))}
    </ol>
  )
}

function NextStep({ r, onChanged }: { r: AdminReturnView; onChanged: () => void }) {
  switch (r.status) {
    case 'REQUESTED':
      return <Decide r={r} onChanged={onChanged} />
    case 'APPROVED':
      return <Receive r={r} onChanged={onChanged} />
    case 'RECEIVED':
      return <Refund r={r} onChanged={onChanged} />
    case 'REFUNDED':
      return (
        <p className="text-sm text-muted-foreground">
          Refunded {r.refundAmount ? formatBdt(r.refundAmount) : ''} — nothing more to do.
        </p>
      )
    case 'REJECTED':
      return <p className="text-sm text-muted-foreground">Rejected: {r.rejectionReason}</p>
  }
}

/** Runs one API call with the shared busy / problem handling. */
function useAction(onChanged: () => void) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const run = async (request: Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true)
    setProblem(null)
    const result = await request
    setBusy(false)
    if (!result.ok) {
      setProblem(result.message ?? 'Something went wrong.')
      onChanged() // e.g. a refused refund is now on the page as FAILED
      return false
    }
    onChanged()
    return true
  }
  return { busy, problem, setProblem, run }
}

function Decide({ r, onChanged }: { r: AdminReturnView; onChanged: () => void }) {
  const [mode, setMode] = useState<'approve' | 'reject' | null>(null)
  const [text, setText] = useState('')
  const { busy, problem, setProblem, run } = useAction(onChanged)
  if (!mode)
    return (
      <div className="flex flex-col gap-2">
        <Button
          onClick={() => {
            setText(APPROVE_TEMPLATE)
            setMode('approve')
          }}
        >
          Approve…
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            setText('')
            setMode('reject')
          }}
        >
          Reject…
        </Button>
      </div>
    )
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim())
      return setProblem(
        mode === 'approve'
          ? 'Tell the customer how to send it back.'
          : 'Give a reason — the customer reads it.',
      )
    void run(
      mode === 'approve' ? approveReturn(r.id, text.trim()) : rejectReturn(r.id, text.trim()),
    )
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <TextArea
        label={
          mode === 'approve' ? 'Instructions for the customer' : 'Reason (the customer reads it)'
        }
        value={text}
        maxLength={mode === 'approve' ? 1000 : 300}
        rows={4}
        onChange={(e) => setText(e.target.value)}
        hint={
          mode === 'approve'
            ? 'Emailed to the customer with the approval.'
            : 'Emailed to the customer with the rejection.'
        }
      />
      <FormProblem message={problem} />
      <div className="flex gap-2">
        <Button type="submit" variant={mode === 'approve' ? 'primary' : 'danger'} disabled={busy}>
          {busy ? 'Saving…' : mode === 'approve' ? 'Approve return' : 'Reject return'}
        </Button>
        <Button variant="ghost" onClick={() => setMode(null)}>
          Back
        </Button>
      </div>
    </form>
  )
}

function Receive({ r, onChanged }: { r: AdminReturnView; onChanged: () => void }) {
  const [restock, setRestock] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(r.items.map((i) => [i.orderItemId, true])),
  )
  const { busy, problem, run } = useAction(onChanged)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(
      receiveReturn(
        r.id,
        r.items.map((i) => ({
          orderItemId: i.orderItemId,
          restock: restock[i.orderItemId] ?? true,
        })),
      ),
    )
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 text-sm">
      <p>When the parcel arrives, check each item:</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Put back on sale</legend>
        {r.items.map((i) => (
          <label key={i.orderItemId} className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 size-4"
              checked={restock[i.orderItemId] ?? true}
              onChange={(e) => setRestock((s) => ({ ...s, [i.orderItemId]: e.target.checked }))}
            />
            <span>
              Put back on sale: {i.quantity} × {i.productName} ({i.variantLabel})
              <span className="block text-xs text-muted-foreground">
                Untick if it came back damaged.
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <FormProblem message={problem} />
      <Button type="submit" disabled={busy} className="self-start">
        {busy ? 'Saving…' : 'Parcel received'}
      </Button>
    </form>
  )
}

function Refund({ r, onChanged }: { r: AdminReturnView; onChanged: () => void }) {
  const online = r.paymentMethod === 'SSLCOMMERZ'
  const [amount, setAmount] = useState(String(Number(r.suggestedRefund)))
  const [method, setMethod] = useState<'GATEWAY' | 'MANUAL'>(online ? 'GATEWAY' : 'MANUAL')
  const [reference, setReference] = useState('')
  const [confirming, setConfirming] = useState<string | null>(null)
  const { busy, problem, setProblem, run } = useAction(onChanged)
  const pending = r.refunds.some((f) => f.status === 'PENDING')

  if (pending)
    return <p className="text-sm text-muted-foreground">A refund is in progress — see Refunds.</p>

  const review = (e: FormEvent) => {
    e.preventDefault()
    const n = parsePrice(amount)
    if (n === null || n === 'invalid' || n <= 0)
      return setProblem('Enter the amount in taka, e.g. 1341.')
    if (n > Number(r.maxRefundable))
      return setProblem(`At most ${formatBdt(r.maxRefundable)} can still be refunded.`)
    if (method === 'MANUAL' && reference.trim().length < 2)
      return setProblem('Say how you paid it back, e.g. “bKash TrxID 8N7A6K…” or “cash”.')
    setProblem(null)
    setConfirming(String(n))
  }

  if (confirming)
    return (
      <div className="flex flex-col gap-3 text-sm" role="group" aria-label="Confirm the refund">
        <p className="font-medium">
          {method === 'GATEWAY'
            ? `Refund ${formatBdt(confirming)} to the customer through SSLCommerz? This sends real money back.`
            : `Record that you paid back ${formatBdt(confirming)} by hand (${reference.trim()})?`}
        </p>
        <FormProblem message={problem} />
        <div className="flex gap-2">
          <Button
            disabled={busy}
            onClick={async () => {
              const done = await run(
                refundReturn(r.id, {
                  amount: confirming,
                  method,
                  ...(method === 'MANUAL' && { reference: reference.trim() }),
                }),
              )
              if (!done) setConfirming(null)
            }}
          >
            {busy ? 'Refunding…' : `Yes, refund ${formatBdt(confirming)}`}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>
            Back
          </Button>
        </div>
      </div>
    )

  return (
    <form onSubmit={review} noValidate className="flex flex-col gap-3 text-sm">
      <Input
        label="Amount (৳)"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        hint={`Suggested ${formatBdt(r.suggestedRefund)} (the items’ share of what was paid). At most ${formatBdt(r.maxRefundable)}.`}
      />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 font-medium">How</legend>
        {online && (
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="method"
              className="size-4"
              checked={method === 'GATEWAY'}
              onChange={() => setMethod('GATEWAY')}
            />
            Back to their card / account through SSLCommerz
          </label>
        )}
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="method"
            className="size-4"
            checked={method === 'MANUAL'}
            onChange={() => setMethod('MANUAL')}
          />
          I paid it back by hand (bKash / cash)
        </label>
      </fieldset>
      {method === 'MANUAL' && (
        <Input
          label="How it was paid"
          value={reference}
          maxLength={100}
          onChange={(e) => setReference(e.target.value)}
          hint="e.g. “bKash TrxID 8N7A6K…” or “cash”. Never a bank account or card number."
        />
      )}
      <FormProblem message={problem} />
      <Button type="submit" className="self-start">
        Review refund…
      </Button>
    </form>
  )
}

function Refunds({ r, onChanged }: { r: AdminReturnView; onChanged: () => void }) {
  if (r.refunds.length === 0)
    return <p className="text-sm text-muted-foreground">No refunds yet.</p>
  return (
    <ul className="flex flex-col gap-3 text-sm">
      {r.refunds.map((f) => (
        <li key={f.id} className="rounded-control border border-border p-3">
          <RefundLine f={f} />
          {f.status === 'PENDING' && <Resolve r={r} f={f} onChanged={onChanged} />}
        </li>
      ))}
    </ul>
  )
}

function RefundLine({ f }: { f: AdminRefundView }) {
  const how =
    f.method === 'MANUAL' ? `By hand${f.reference ? ` — ${f.reference}` : ''}` : 'SSLCommerz'
  const status =
    f.status === 'PROCESSED' ? (
      <Badge variant="success">Refunded</Badge>
    ) : f.status === 'FAILED' ? (
      <Badge variant="danger">Failed</Badge>
    ) : f.stage === 'PROCESSING' ? (
      <Badge variant="info">SSLCommerz processing</Badge>
    ) : (
      <Badge variant="warning">No answer from SSLCommerz</Badge>
    )
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold tabular-nums">{formatBdt(f.amount)}</span>
        {status}
        <span className="text-muted-foreground">{how}</span>
      </div>
      <span className="text-xs text-muted-foreground">
        {formatInstantDateTime(f.createdAt)}
        {f.gatewayRefId && ` · SSLCommerz ref ${f.gatewayRefId}`}
      </span>
      {f.note && <span>{f.note}</span>}
      {f.stage === 'PROCESSING' && (
        <span className="text-muted-foreground">
          We ask SSLCommerz again every 15 minutes — usually nothing to do.
        </span>
      )}
      {f.stage === 'NO_ANSWER' && (
        <span className="text-warning">
          SSLCommerz didn’t answer, so we don’t know if the money went back. Check the refund in the
          SSLCommerz merchant panel, then record what happened below.
        </span>
      )}
    </div>
  )
}

function Resolve({
  r,
  f,
  onChanged,
}: {
  r: AdminReturnView
  f: AdminRefundView
  onChanged: () => void
}) {
  const [open, setOpen] = useState(f.stage === 'NO_ANSWER')
  const [outcome, setOutcome] = useState<'REFUNDED' | 'FAILED' | null>(null)
  const [note, setNote] = useState('')
  const { busy, problem, setProblem, run } = useAction(onChanged)
  if (!open)
    return (
      <Button variant="ghost" size="sm" className="mt-2" onClick={() => setOpen(true)}>
        Record the outcome by hand…
      </Button>
    )
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!outcome) return setProblem('Choose what the SSLCommerz panel shows.')
    if (!note.trim())
      return setProblem('Add a note, e.g. “Refunded per the SSLCommerz panel, 9 Oct”.')
    void run(resolveRefund(r.id, f.id, { outcome, note: note.trim() }))
  }
  return (
    <form onSubmit={submit} noValidate className="mt-3 flex flex-col gap-2">
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-medium">The SSLCommerz panel shows the money…</legend>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`outcome-${f.id}`}
            className="size-4"
            checked={outcome === 'REFUNDED'}
            onChange={() => setOutcome('REFUNDED')}
          />
          went back to the customer
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={`outcome-${f.id}`}
            className="size-4"
            checked={outcome === 'FAILED'}
            onChange={() => setOutcome('FAILED')}
          />
          did not go back (you can refund again)
        </label>
      </fieldset>
      <TextArea
        label="Note"
        value={note}
        maxLength={300}
        rows={2}
        onChange={(e) => setNote(e.target.value)}
      />
      <FormProblem message={problem} />
      <Button type="submit" size="sm" disabled={busy} className="self-start">
        {busy ? 'Saving…' : 'Save outcome'}
      </Button>
    </form>
  )
}
