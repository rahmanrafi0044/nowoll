'use client'

import type { AdminCustomerDetail, AdminOrderRow } from '@nowoll/types'
import { Badge, Button } from '@nowoll/ui'
import Link from 'next/link'
import { type FormEvent, type ReactNode, useCallback, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { FormProblem, TextArea } from '@/components/form-fields'
import { banCustomer, fetchCustomer, unbanCustomer } from '@/lib/customers-api'
import { formatInstantDate, formatInstantDateTime } from '@/lib/date'
import { formatBdt } from '@/lib/format'
import { ORDER_STATUS, PAYMENT_STATUS } from '@/lib/order-labels'

// ============================================================================
// One customer account (step 32): contact, stats, addresses, their orders,
// guest orders with the same email/phone (staff only), and ban / unban.
// ============================================================================

export function CustomerDetail({ id }: { id: string }) {
  const load = useCallback(() => fetchCustomer(id), [id])
  const { state, retry, refresh } = useLoad(load)
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/customers"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← Customers
      </Link>
      <Panel title="Customer" state={state} retry={retry}>
        {(c) => (
          <div className="flex flex-col gap-6">
            <header className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold">{c.name ?? c.email}</h1>
              <Badge variant={c.status === 'BANNED' ? 'danger' : 'success'}>
                {c.status === 'BANNED' ? 'Banned' : 'Active'}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Joined {formatInstantDate(c.joinedAt)}
              </span>
            </header>
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="flex flex-col gap-6 lg:col-span-2">
                <Card title="Orders">
                  <Stats c={c} />
                  <OrderRows orders={c.orders} empty="No orders from this account yet." />
                </Card>
                <Card title="Guest orders with the same email or phone">
                  <p className="mb-3 text-xs text-muted-foreground">
                    Placed without signing in. Staff only — the customer doesn’t see these as
                    theirs.
                  </p>
                  <OrderRows orders={c.guestOrders} empty="None." />
                </Card>
              </div>
              <div className="flex flex-col gap-6">
                <Card title="Contact">
                  <div className="flex flex-col gap-1 text-sm">
                    <a
                      href={`mailto:${c.email}`}
                      className="break-all underline underline-offset-4"
                    >
                      {c.email}
                    </a>
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className="underline underline-offset-4">
                        {c.phone}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">No phone saved</span>
                    )}
                  </div>
                </Card>
                <Card title="Account">
                  <BanControl c={c} onChanged={refresh} />
                </Card>
                <Card title="Saved addresses">
                  {c.addresses.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None saved.</p>
                  ) : (
                    <ul className="flex flex-col gap-3 text-sm">
                      {c.addresses.map((a) => (
                        <li key={a.id}>
                          <span className="font-medium">
                            {a.label ?? a.fullName}
                            {a.isDefault && (
                              <span className="ml-2 text-xs text-muted-foreground">(default)</span>
                            )}
                          </span>
                          <address className="not-italic text-muted-foreground">
                            {a.line1}
                            {a.line2 && `, ${a.line2}`}
                            <br />
                            {[a.area, a.district, a.division].filter(Boolean).join(', ')} ·{' '}
                            {a.phone}
                          </address>
                        </li>
                      ))}
                    </ul>
                  )}
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

function Stats({ c }: { c: AdminCustomerDetail }) {
  const s = c.stats
  const items = [
    ['Orders', String(s.orderCount)],
    ['Spent', formatBdt(s.totalSpent)],
    ['Average order', formatBdt(s.averageOrder)],
    ['Reviews', String(s.reviewCount)],
    ['Returns', String(s.returnCount)],
  ]
  return (
    <dl className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="font-semibold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function OrderRows({ orders, empty }: { orders: AdminOrderRow[]; empty: string }) {
  if (orders.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full min-w-[520px] text-sm">
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} className="border-t border-border">
              <td className="py-2">
                <Link
                  href={`/admin/orders/${o.id}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {o.number}
                </Link>
              </td>
              <td className="py-2 text-muted-foreground">{formatInstantDateTime(o.createdAt)}</td>
              <td className="py-2">
                <Badge variant={ORDER_STATUS[o.status].variant}>
                  {ORDER_STATUS[o.status].label}
                </Badge>
              </td>
              <td className="py-2">
                <Badge variant={PAYMENT_STATUS[o.paymentStatus].variant}>
                  {PAYMENT_STATUS[o.paymentStatus].label}
                </Badge>
              </td>
              <td className="py-2 text-right tabular-nums">{formatBdt(o.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Ban (with a staff-only reason) or unban. */
function BanControl({ c, onChanged }: { c: AdminCustomerDetail; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function run(request: Promise<{ ok: boolean; message?: string }>) {
    setBusy(true)
    setProblem(null)
    const r = await request
    setBusy(false)
    if (!r.ok) return setProblem(r.message ?? 'Something went wrong.')
    setOpen(false)
    setReason('')
    onChanged()
  }

  if (c.ban)
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p>
          <span className="font-medium text-danger">Banned</span>
          {c.ban.at && ` ${formatInstantDate(c.ban.at)}`}
          {c.ban.by && ` by ${c.ban.by}`}
        </p>
        <p className="rounded-control bg-surface-muted p-2">{c.ban.reason}</p>
        <p className="text-xs text-muted-foreground">
          They can’t sign in, and orders with this email or phone are refused at checkout.
        </p>
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          disabled={busy}
          onClick={() => run(unbanCustomer(c.id))}
        >
          {busy ? 'Saving…' : 'Unban'}
        </Button>
        <FormProblem message={problem} />
      </div>
    )

  if (!open)
    return (
      <div className="flex flex-col gap-2 text-sm">
        <p className="text-muted-foreground">Active — can sign in and order.</p>
        <Button variant="ghost" size="sm" className="self-start" onClick={() => setOpen(true)}>
          Ban this customer…
        </Button>
      </div>
    )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) return setProblem('Give a reason — other staff will see it.')
    void run(banCustomer(c.id, reason.trim()))
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3 text-sm">
      <p>
        A ban stops them signing in (from their next click) and refuses checkout with this email or
        phone, even without an account. Open orders stay as they are.
      </p>
      <TextArea
        label="Reason"
        value={reason}
        maxLength={500}
        rows={2}
        onChange={(e) => setReason(e.target.value)}
        hint="Staff only — the customer just sees that the account is disabled."
      />
      <FormProblem message={problem} />
      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={busy}>
          {busy ? 'Saving…' : 'Ban customer'}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
