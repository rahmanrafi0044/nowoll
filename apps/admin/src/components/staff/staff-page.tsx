'use client'

import type { AdminStaffMember, StaffChangeView, StaffRoleView } from '@nowoll/types'
import { Badge, Button, Input } from '@nowoll/ui'
import { type FormEvent, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { SelectField } from '@/components/form-fields'
import { formatInstantDate, formatInstantDateTime } from '@/lib/date'
import {
  addStaff,
  changeStaffRole,
  fetchStaff,
  removeStaff,
  resetStaffTwoFactor,
} from '@/lib/staff-api'

// ============================================================================
// Admin → Staff (step 38e). ADMIN only (the API enforces it). Who can open
// the admin panel, with which role, and a log of every change.
// Staff = day-to-day work (orders, products, returns without refunds…);
// Admin = also refunds, discounts, settings, shipping and staff.
// 2FA can never be switched off — a reset just makes them set it up again.
// ============================================================================

const ROLE_LABEL: Record<StaffRoleView, string> = { ADMIN: 'Admin', STAFF: 'Staff' }

export function StaffPage() {
  const { state, retry, refresh } = useLoad(fetchStaff)
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Staff</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          <strong>Staff</strong> handle orders, products, categories, stock, customers, returns (not
          refunds), content and pages. <strong>Admins</strong> can also refund, manage discount
          codes, settings, shipping and staff. Everyone signs in with an authenticator app — always.
        </p>
      </div>
      <AddStaff onAdded={refresh} />
      <Panel title="People with admin access" state={state} retry={retry}>
        {(page) => (
          <div className="flex flex-col gap-8">
            <ul aria-label="Staff members" className="flex flex-col">
              {page.members.map((m) => (
                <Member key={m.id} m={m} onChanged={refresh} />
              ))}
            </ul>
            <ChangeLog changes={page.changes} />
          </div>
        )}
      </Panel>
    </div>
  )
}

function AddStaff({ onAdded }: { onAdded: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StaffRoleView>('STAFF')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!email.trim()) return setNote({ ok: false, text: 'Enter the email of their shop account.' })
    setBusy(true)
    setNote(null)
    const r = await addStaff(email.trim(), role)
    setBusy(false)
    if (!r.ok) return setNote({ ok: false, text: r.message })
    setNote({
      ok: true,
      text: `${email.trim()} can now sign in to the admin panel as ${ROLE_LABEL[role]}. At their first sign-in they set up an authenticator app.`,
    })
    setEmail('')
    onAdded()
  }

  return (
    <section aria-label="Add staff" className="rounded-lg border border-border bg-surface p-5">
      <h2 className="text-lg font-semibold">Add staff</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        They sign up on the shop first (choosing their own password), then you add their email here.
        You never handle anyone’s password.
      </p>
      <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-3">
        <div className="min-w-64 flex-1">
          <Input
            label="Email of their shop account"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <SelectField
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as StaffRoleView)}
        >
          <option value="STAFF">Staff</option>
          <option value="ADMIN">Admin</option>
        </SelectField>
        <Button type="submit" disabled={busy}>
          {busy ? 'Adding…' : 'Add'}
        </Button>
      </form>
      {note && (
        <p
          role={note.ok ? 'status' : 'alert'}
          className={`mt-3 text-sm ${note.ok ? 'text-success' : 'text-danger'}`}
        >
          {note.text}
        </p>
      )}
    </section>
  )
}

type Confirming = 'remove' | 'reset' | null

function Member({ m, onChanged }: { m: AdminStaffMember; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<Confirming>(null)
  const name = m.fullName ?? m.email

  async function run(action: () => ReturnType<typeof removeStaff>) {
    setConfirming(null)
    setBusy(true)
    setProblem(null)
    const r = await action()
    setBusy(false)
    if (!r.ok) return setProblem(r.message)
    onChanged()
  }

  return (
    <li className="flex flex-col gap-2 border-b border-border py-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="mr-auto min-w-0">
          <span className="font-medium">{name}</span>
          {m.isYou && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
          <span className="block text-xs text-muted-foreground">
            {m.email} · account since {formatInstantDate(m.accountCreatedAt)}
          </span>
        </span>
        {m.twoFactor === true ? (
          <Badge variant="success">Authenticator set up</Badge>
        ) : m.twoFactor === false ? (
          <Badge variant="warning">Sets up the authenticator at first sign-in</Badge>
        ) : (
          <Badge>Authenticator: unknown</Badge>
        )}
        {m.isYou ? (
          <Badge variant="info">{ROLE_LABEL[m.role]}</Badge>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <span className="sr-only">Role for {name}</span>
            <select
              aria-label={`Role for ${name}`}
              className="h-9 rounded-control border border-border-strong bg-surface px-2 text-sm"
              value={m.role}
              disabled={busy}
              onChange={(e) =>
                void run(() => changeStaffRole(m.id, e.target.value as StaffRoleView))
              }
            >
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
        )}
        {!m.isYou && confirming === null && (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirming('reset')}
            >
              Reset authenticator
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirming('remove')}
            >
              Remove access
            </Button>
          </>
        )}
      </div>
      {confirming && (
        <div
          role="group"
          aria-label={
            confirming === 'remove'
              ? `Confirm removing ${name}`
              : `Confirm resetting ${name}’s authenticator`
          }
          className="flex flex-wrap items-center gap-3 rounded-control border border-border p-3 text-sm"
        >
          <span className="mr-auto">
            {confirming === 'remove'
              ? `Remove ${name}’s admin access? They become a normal customer again — their account and orders stay.`
              : `Reset ${name}’s authenticator app? They’re signed out everywhere and set up a new one at their next sign-in (e.g. after losing their phone).`}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() =>
              void run(() =>
                confirming === 'remove' ? removeStaff(m.id) : resetStaffTwoFactor(m.id),
              )
            }
          >
            {confirming === 'remove' ? 'Yes, remove access' : 'Yes, reset'}
          </Button>
        </div>
      )}
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {problem}
        </p>
      )}
    </li>
  )
}

const ACTION: Record<StaffChangeView['action'], (c: StaffChangeView) => string> = {
  GRANTED: (c) => `given admin access as ${c.toRole === 'ADMIN' ? 'Admin' : 'Staff'}`,
  ROLE_CHANGED: (c) =>
    `changed from ${c.fromRole === 'ADMIN' ? 'Admin' : 'Staff'} to ${c.toRole === 'ADMIN' ? 'Admin' : 'Staff'}`,
  REVOKED: () => 'admin access removed',
  TWO_FACTOR_RESET: () => 'authenticator app reset',
}

function ChangeLog({ changes }: { changes: StaffChangeView[] }) {
  return (
    <section aria-label="Change log">
      <h3 className="mb-2 font-semibold">Change log</h3>
      {changes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No changes yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {changes.map((c) => (
            <li key={c.id}>
              <span className="text-muted-foreground">{formatInstantDateTime(c.createdAt)} · </span>
              <span className="font-medium">{c.target.fullName ?? c.target.email}</span> —{' '}
              {ACTION[c.action](c)}
              <span className="text-muted-foreground">
                {' '}
                by {c.actor ? (c.actor.fullName ?? c.actor.email) : 'a server command'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
