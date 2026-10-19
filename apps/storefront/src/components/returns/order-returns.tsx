'use client'

import type { MyReturnView, ReturnEligibilityView, ReturnReasonView } from '@nowoll/types'
import { Button } from '@nowoll/ui'
import { type FormEvent, useEffect, useState } from 'react'
import { FormProblem, problemText } from '@/components/account/auth-card'
import { formatBdt } from '@/lib/format'
import { fetchMyReturns, fetchReturnEligibility, requestReturn } from '@/lib/return-api'
import { useFocusFirstError } from '@/lib/use-focus-first-error'

export const REASON_LABEL: Record<ReturnReasonView, string> = {
  WRONG_SIZE: 'Wrong size',
  DAMAGED: 'Damaged or faulty',
  NOT_AS_DESCRIBED: 'Not as described',
  CHANGED_MIND: 'Changed my mind',
  OTHER: 'Other',
}

const STEPS = ['REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDED'] as const
const STEP_LABEL: Record<(typeof STEPS)[number], string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  RECEIVED: 'Received',
  REFUNDED: 'Refunded',
}

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Dhaka',
  })

/** On a delivered order's page: past returns with their progress, and "Return items" (step 25). */
export function OrderReturns({ orderNumber }: { orderNumber: string }) {
  const [returns, setReturns] = useState<MyReturnView[] | null>(null)
  const [eligibility, setEligibility] = useState<ReturnEligibilityView | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    void Promise.all([fetchMyReturns(), fetchReturnEligibility(orderNumber)]).then(
      ([mine, elig]) => {
        if (cancelled) return
        setReturns(mine.ok ? mine.data.filter((r) => r.orderNumber === orderNumber) : [])
        setEligibility(elig.ok ? elig.data : null)
      },
    )
    return () => {
      cancelled = true
    }
  }, [orderNumber])

  if (!returns || !eligibility) return null
  if (returns.length === 0 && !eligibility.canReturn && !eligibility.windowClosesAt) return null

  return (
    <section aria-labelledby="order-returns" className="flex flex-col gap-4">
      <h2 id="order-returns" className="text-xl font-semibold">
        Returns
      </h2>
      {returns.map((r) => (
        <ReturnProgress key={r.id} ret={r} />
      ))}

      {open ? (
        <ReturnForm
          orderNumber={orderNumber}
          eligibility={eligibility}
          onCancel={() => setOpen(false)}
          onSent={(r) => {
            setReturns([r, ...returns])
            setOpen(false)
            void fetchReturnEligibility(orderNumber).then((e) => e.ok && setEligibility(e.data))
          }}
        />
      ) : eligibility.canReturn ? (
        <div className="flex flex-col gap-1">
          <Button variant="secondary" className="self-start" onClick={() => setOpen(true)}>
            Return items
          </Button>
          {eligibility.windowClosesAt && (
            <p className="text-sm text-muted-foreground">
              You can ask for a return until {longDate(eligibility.windowClosesAt)}.
            </p>
          )}
        </div>
      ) : (
        eligibility.reason && <p className="text-sm text-muted-foreground">{eligibility.reason}</p>
      )}
    </section>
  )
}

function ReturnProgress({ ret }: { ret: MyReturnView }) {
  const items = ret.items
    .map((i) => `${i.quantity} × ${i.productName} (${i.variantLabel})`)
    .join(', ')
  return (
    <article
      aria-label={`Return of ${items}`}
      className="flex flex-col gap-2 rounded-control border border-border p-4 text-sm"
    >
      <p className="font-medium">{items}</p>
      <p className="text-muted-foreground">
        {REASON_LABEL[ret.reason]} · asked on {longDate(ret.createdAt)}
      </p>
      {ret.status === 'REJECTED' ? (
        <p role="status">
          <strong>Not accepted.</strong> {ret.rejectionReason}
        </p>
      ) : (
        <ol aria-label="Return progress" className="flex flex-wrap gap-x-4 gap-y-1">
          {STEPS.map((step, i) => {
            const done = i <= STEPS.indexOf(ret.status as (typeof STEPS)[number])
            return (
              <li key={step} className={done ? 'font-medium' : 'text-muted-foreground'}>
                {done ? '✓ ' : ''}
                {STEP_LABEL[step]}
                <span className="sr-only">{done ? ' (done)' : ' (not yet)'}</span>
              </li>
            )
          })}
        </ol>
      )}
      {ret.status === 'APPROVED' && ret.adminNote && (
        <p>
          <strong>What to do next:</strong> {ret.adminNote}
        </p>
      )}
      {ret.status === 'REFUNDED' && ret.refundAmount && (
        <p>Refunded {formatBdt(ret.refundAmount)}.</p>
      )}
    </article>
  )
}

function ReturnForm({
  orderNumber,
  eligibility,
  onSent,
  onCancel,
}: {
  orderNumber: string
  eligibility: ReturnEligibilityView
  onSent: (r: MyReturnView) => void
  onCancel: () => void
}) {
  const returnable = eligibility.items.filter((i) => i.returnable > 0)
  const [chosen, setChosen] = useState<Record<string, number>>({}) // orderItemId → quantity (0 = not chosen)
  const [reason, setReason] = useState<ReturnReasonView | ''>('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ items?: string; reason?: string }>({})
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const { formRef, focusFirstError } = useFocusFirstError()

  async function submit(e: FormEvent) {
    e.preventDefault()
    const items = Object.entries(chosen)
      .filter(([, q]) => q > 0)
      .map(([orderItemId, quantity]) => ({ orderItemId, quantity }))
    const found = {
      ...(items.length === 0 && { items: 'Choose at least one item to return' }),
      ...(!reason && { reason: 'Choose a reason' }),
    }
    setErrors(found)
    if (Object.keys(found).length > 0 || !reason) return focusFirstError()
    setSending(true)
    setProblem(null)
    const r = await requestReturn({ orderNumber, items, reason, note: note.trim() || null })
    setSending(false)
    if (!r.ok) return setProblem(problemText(r))
    onSent(r.data)
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4 rounded-control border border-border p-4"
    >
      <fieldset aria-describedby={errors.items ? 'return-items-error' : undefined}>
        <legend className="text-sm font-medium">What would you like to return?</legend>
        <ul className="mt-2 flex flex-col gap-2">
          {returnable.map((item) => {
            const qty = chosen[item.orderItemId] ?? 0
            const label = `${item.productName} (${item.variantLabel})`
            return (
              <li key={item.orderItemId} className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={qty > 0}
                    onChange={(e) =>
                      setChosen({ ...chosen, [item.orderItemId]: e.target.checked ? 1 : 0 })
                    }
                    className="size-4 accent-brand"
                  />
                  {label}
                </label>
                {qty > 0 && item.returnable > 1 && (
                  <select
                    aria-label={`How many of ${label}`}
                    value={qty}
                    onChange={(e) =>
                      setChosen({ ...chosen, [item.orderItemId]: Number(e.target.value) })
                    }
                    className="h-9 rounded-control border border-border-strong bg-surface px-2"
                  >
                    {Array.from({ length: item.returnable }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                )}
              </li>
            )
          })}
        </ul>
        {errors.items && (
          <p id="return-items-error" className="mt-1 text-sm text-danger">
            {errors.items}
          </p>
        )}
      </fieldset>
      <div className="flex flex-col gap-1.5 text-sm">
        <label htmlFor="return-reason" className="font-medium">
          Why are you returning it?
        </label>
        <select
          id="return-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value as ReturnReasonView)}
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={errors.reason ? 'return-reason-error' : undefined}
          className={`h-11 rounded-control border bg-surface px-3 text-base ${errors.reason ? 'border-danger' : 'border-border-strong'}`}
        >
          <option value="">Choose…</option>
          {Object.entries(REASON_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        {errors.reason && (
          <span id="return-reason-error" className="text-danger">
            {errors.reason}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <label htmlFor="return-note" className="font-medium">
          Anything else? (optional)
        </label>
        <textarea
          id="return-note"
          value={note}
          maxLength={1000}
          rows={3}
          onChange={(e) => setNote(e.target.value)}
          className="rounded-control border border-border-strong bg-surface p-3 text-base"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        We&apos;ll check your request and tell you how to send the items back. Your refund follows
        once they arrive.
      </p>
      <FormProblem message={problem} />
      <div className="flex gap-3">
        <Button type="submit" disabled={sending}>
          {sending ? 'Sending…' : 'Ask for a return'}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
