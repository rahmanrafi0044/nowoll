'use client'

import type { AdminDiscountDetail } from '@nowoll/types'
import { Badge, Button, Input } from '@nowoll/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { FormProblem } from '@/components/form-fields'
import { DISCOUNT_STATUS, describeDiscount, generateCode } from '@/lib/discount-labels'
import {
  archiveDiscount,
  createDiscount,
  type DiscountFields,
  fetchDiscount,
  updateDiscount,
} from '@/lib/discounts-api'
import { formatInstantDateTime } from '@/lib/date'
import { formatBdt } from '@/lib/format'
import { parsePrice, priceText } from '@/lib/money-input'
import { ORDER_STATUS } from '@/lib/order-labels'
import { expiresAtFor, firstDayOf, lastDayOf, startsAtFor } from '@/lib/store-days'

// ============================================================================
// Create or edit a discount code (step 34). Dates are whole days in
// Bangladesh time: the code works from 00:00 on the first day until the end
// of the last day. A live sentence says what the code does as you type.
// Once a code has been used, its code and type are locked (API rule) so the
// usage numbers keep meaning what they say.
// ============================================================================

export type Form = {
  code: string
  description: string
  type: 'PERCENTAGE' | 'FIXED_AMOUNT'
  value: string
  minOrderAmount: string
  maxDiscountAmount: string
  usageLimit: string
  usageLimitPerCustomer: string
  firstDay: string
  lastDay: string
  isActive: boolean
}

const EMPTY: Form = {
  code: '',
  description: '',
  type: 'PERCENTAGE',
  value: '',
  minOrderAmount: '',
  maxDiscountAmount: '',
  usageLimit: '',
  usageLimitPerCustomer: '',
  firstDay: '',
  lastDay: '',
  isActive: true,
}

const toForm = (d: AdminDiscountDetail): Form => ({
  code: d.code,
  description: d.description ?? '',
  type: d.type,
  value: priceText(d.value),
  minOrderAmount: priceText(d.minOrderAmount),
  maxDiscountAmount: priceText(d.maxDiscountAmount),
  usageLimit: d.usageLimit === null ? '' : String(d.usageLimit),
  usageLimitPerCustomer: d.usageLimitPerCustomer === null ? '' : String(d.usageLimitPerCustomer),
  firstDay: d.startsAt ? firstDayOf(d.startsAt) : '',
  lastDay: d.expiresAt ? lastDayOf(d.expiresAt) : '',
  isActive: d.isActive,
})

const wholeOrNull = (s: string): number | null | 'invalid' =>
  s.trim() === '' ? null : /^\d+$/.test(s.trim()) && Number(s) >= 1 ? Number(s) : 'invalid'

/** The form → the API's fields, or the first problem to fix. */
export function toFields(f: Form): { fields: DiscountFields } | { problem: string } {
  const code = f.code.trim().toUpperCase()
  if (!/^[A-Z0-9_-]{3,30}$/.test(code))
    return { problem: 'The code needs 3–30 letters, numbers, - or _.' }
  const value = parsePrice(f.value)
  if (value === null || value === 'invalid' || value <= 0)
    return {
      problem:
        f.type === 'PERCENTAGE'
          ? 'Enter how many percent off, e.g. 10.'
          : 'Enter how many taka off, e.g. 200.',
    }
  if (f.type === 'PERCENTAGE' && value > 100) return { problem: 'A percentage can be at most 100.' }
  const min = parsePrice(f.minOrderAmount)
  if (min === 'invalid')
    return { problem: 'The minimum order must be in taka, e.g. 2000 — or empty.' }
  const max = f.type === 'PERCENTAGE' ? parsePrice(f.maxDiscountAmount) : null
  if (max === 'invalid') return { problem: '“At most” must be in taka, e.g. 500 — or empty.' }
  const usageLimit = wholeOrNull(f.usageLimit)
  const perCustomer = wholeOrNull(f.usageLimitPerCustomer)
  if (usageLimit === 'invalid' || perCustomer === 'invalid')
    return { problem: 'Use limits are whole numbers (1 or more) — or empty.' }
  if (f.firstDay && f.lastDay && f.lastDay < f.firstDay)
    return { problem: 'The last day can’t be before the first day.' }
  return {
    fields: {
      code,
      description: f.description.trim() || null,
      type: f.type,
      value,
      minOrderAmount: min,
      maxDiscountAmount: max, // always null for ৳-off codes (the API refuses a cap there)
      usageLimit,
      usageLimitPerCustomer: perCustomer,
      startsAt: f.firstDay ? startsAtFor(f.firstDay) : null,
      expiresAt: f.lastDay ? expiresAtFor(f.lastDay) : null,
      isActive: f.isActive,
    },
  }
}

/** Only what changed — so an edit never touches a field nobody changed. */
export function changedFields(
  before: DiscountFields,
  after: DiscountFields,
): Partial<DiscountFields> {
  const out: Partial<DiscountFields> = {}
  for (const k of Object.keys(after) as (keyof DiscountFields)[])
    if (after[k] !== before[k]) (out as Record<string, unknown>)[k] = after[k]
  return out
}

export function NewDiscount() {
  return <DiscountForm initial={EMPTY} existing={null} />
}

export function EditDiscount({ id }: { id: string }) {
  const load = useCallback(() => fetchDiscount(id), [id])
  const { state, retry, refresh } = useLoad(load)
  return (
    <Panel
      title="Discount code"
      state={state}
      retry={retry}
      className="border-0 bg-transparent p-0"
    >
      {(d) => (
        <div className="flex flex-col gap-6">
          <header className="flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl font-semibold">{d.code}</h1>
            <Badge variant={DISCOUNT_STATUS[d.status].variant}>
              {DISCOUNT_STATUS[d.status].label}
            </Badge>
            <span className="text-sm text-muted-foreground">
              Used {d.usedCount}
              {d.usageLimit !== null && ` of ${d.usageLimit}`} · {formatBdt(d.totalDiscounted)}{' '}
              given · {formatBdt(d.salesTotal)} in sales
            </span>
          </header>
          <DiscountForm
            key={d.id + d.isActive + d.code}
            initial={toForm(d)}
            existing={d}
            onSaved={refresh}
          />
          <Usages d={d} />
        </div>
      )}
    </Panel>
  )
}

function DiscountForm({
  initial,
  existing,
  onSaved,
}: {
  initial: Form
  existing: AdminDiscountDetail | null
  onSaved?: () => void
}) {
  const router = useRouter()
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const locked = (existing?.usedCount ?? 0) > 0
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setSaved(false)
    setForm((f) => ({ ...f, [k]: v }))
  }
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/,/g, '')))
  const summary = describeDiscount({
    type: form.type,
    value: num(form.value),
    minOrderAmount: num(form.minOrderAmount),
    maxDiscountAmount: form.type === 'PERCENTAGE' ? num(form.maxDiscountAmount) : null,
    usageLimit: num(form.usageLimit),
    usageLimitPerCustomer: num(form.usageLimitPerCustomer),
    firstDay: form.firstDay || null,
    lastDay: form.lastDay || null,
  })

  async function submit(e: FormEvent) {
    e.preventDefault()
    const result = toFields(form)
    if ('problem' in result) return setProblem(result.problem)
    setBusy(true)
    setProblem(null)
    if (!existing) {
      const r = await createDiscount(result.fields)
      setBusy(false)
      if (!r.ok) return setProblem(r.message)
      return router.push(`/admin/discounts/${r.data.id}`)
    }
    const before = toFields(initial)
    const changes = 'fields' in before ? changedFields(before.fields, result.fields) : result.fields
    const r = await updateDiscount(existing.id, changes)
    setBusy(false)
    if (!r.ok) return setProblem(r.message)
    setSaved(true)
    onSaved?.()
  }

  async function archive() {
    if (!existing) return
    setBusy(true)
    const r = await archiveDiscount(existing.id)
    setBusy(false)
    if (!r.ok) return setProblem(r.message)
    router.push('/admin/discounts')
  }

  return (
    <form onSubmit={submit} noValidate className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label="Code"
            value={form.code}
            maxLength={30}
            disabled={locked}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
            hint={
              locked
                ? 'Locked — this code has been used. Archive it and make a new one to change it.'
                : 'What customers type at checkout. Letters, numbers, - or _.'
            }
            className="font-mono"
          />
        </div>
        {!locked && (
          <Button variant="secondary" className="mb-6" onClick={() => set('code', generateCode())}>
            Generate
          </Button>
        )}
      </div>
      <fieldset className="flex flex-col gap-2" disabled={locked}>
        <legend className="mb-1 text-sm font-medium">Discount</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="type"
            className="size-4"
            checked={form.type === 'PERCENTAGE'}
            onChange={() => set('type', 'PERCENTAGE')}
          />
          Percent off (%)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="type"
            className="size-4"
            checked={form.type === 'FIXED_AMOUNT'}
            onChange={() => set('type', 'FIXED_AMOUNT')}
          />
          Taka off (৳)
        </label>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={form.type === 'PERCENTAGE' ? 'Percent off' : 'Taka off (৳)'}
          inputMode="decimal"
          value={form.value}
          onChange={(e) => set('value', e.target.value)}
        />
        {form.type === 'PERCENTAGE' && (
          <Input
            label="At most (৳)"
            inputMode="decimal"
            value={form.maxDiscountAmount}
            onChange={(e) => set('maxDiscountAmount', e.target.value)}
            hint="Optional cap, e.g. 20% off but at most ৳500."
          />
        )}
        <Input
          label="Minimum order (৳)"
          inputMode="decimal"
          value={form.minOrderAmount}
          onChange={(e) => set('minOrderAmount', e.target.value)}
          hint="Products total before delivery. Empty = any order."
        />
        <Input
          label="Total uses"
          inputMode="numeric"
          value={form.usageLimit}
          onChange={(e) => set('usageLimit', e.target.value)}
          hint="Empty = unlimited."
        />
        <Input
          label="Uses per customer"
          inputMode="numeric"
          value={form.usageLimitPerCustomer}
          onChange={(e) => set('usageLimitPerCustomer', e.target.value)}
          hint="Matched by email. 1 = once each. Empty = unlimited."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="First day"
          type="date"
          value={form.firstDay}
          onChange={(e) => set('firstDay', e.target.value)}
          hint="From 00:00, Bangladesh time. Empty = straight away."
        />
        <Input
          label="Last day"
          type="date"
          value={form.lastDay}
          onChange={(e) => set('lastDay', e.target.value)}
          hint="Until the end of the day, Bangladesh time. Empty = no end."
        />
      </div>
      <Input
        label="Internal note"
        value={form.description}
        maxLength={200}
        onChange={(e) => set('description', e.target.value)}
        hint="Staff only, e.g. “Eid 2026 campaign”."
      />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4"
          checked={form.isActive}
          onChange={(e) => set('isActive', e.target.checked)}
        />
        On (customers can use it)
      </label>
      {summary && (
        <p aria-live="polite" className="rounded-control bg-surface-muted p-3 text-sm">
          <span className="font-medium">{form.code.trim().toUpperCase() || 'This code'}:</span>{' '}
          {summary}
        </p>
      )}
      <FormProblem message={problem} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Create code'}
        </Button>
        {saved && (
          <span role="status" className="text-sm text-success">
            Saved.
          </span>
        )}
        {existing &&
          (confirmArchive ? (
            <span className="flex items-center gap-2 text-sm">
              Archive {existing.code}? It stops working at once.
              <Button variant="danger" size="sm" disabled={busy} onClick={archive}>
                Archive code
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmArchive(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirmArchive(true)}>
              Archive…
            </Button>
          ))}
      </div>
    </form>
  )
}

function Usages({ d }: { d: AdminDiscountDetail }) {
  return (
    <section aria-label="Orders that used it" className="rounded-lg border border-border p-5">
      <h2 className="mb-3 font-semibold">Orders that used it</h2>
      {d.usages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not used yet.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 font-medium">Order</th>
                <th className="py-2 font-medium">Customer</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 text-right font-medium">Discount</th>
                <th className="py-2 text-right font-medium">Order total</th>
              </tr>
            </thead>
            <tbody>
              {d.usages.map((u) => (
                <tr key={u.orderId} className="border-b border-border">
                  <td className="py-2">
                    <Link
                      href={`/admin/orders/${u.orderId}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {u.orderNumber}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {formatInstantDateTime(u.createdAt)}
                    </span>
                  </td>
                  <td className="py-2">
                    {u.customerName}
                    <span className="block text-xs text-muted-foreground">{u.email}</span>
                  </td>
                  <td className="py-2">
                    {ORDER_STATUS[u.orderStatus as keyof typeof ORDER_STATUS]?.label ??
                      u.orderStatus}
                  </td>
                  <td className="py-2 text-right tabular-nums">−{formatBdt(u.amount)}</td>
                  <td className="py-2 text-right tabular-nums">{formatBdt(u.orderTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
