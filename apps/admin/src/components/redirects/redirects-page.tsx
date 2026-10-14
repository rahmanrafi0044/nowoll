'use client'

import { Badge, Button, Input } from '@nowoll/ui'
import { redirectInputSchema } from '@nowoll/validation'
import { type FormEvent, useCallback, useState } from 'react'
import { SaveProblems } from '@/components/content/fields'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { formatInstantDate } from '@/lib/date'
import {
  type AdminRedirect,
  createRedirect,
  deleteRedirect,
  fetchRedirects,
  type RedirectFields,
  updateRedirect,
} from '@/lib/redirects-api'

// ============================================================================
// Admin → Content → Redirects (step 43c). An old web address on the shop →
// its new one, so old links (Facebook posts, Google, bookmarks) keep working.
// Changing a product's, category's or page's address adds one by itself
// ("Automatic"). Only addresses on this shop; checkout, cart, account and the
// home page can't be redirected. Chains are shortened, loops refused (API).
// ============================================================================

type Problem = { message: string; details?: string[] }

export function RedirectsPage() {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const load = useCallback(() => fetchRedirects(search || undefined), [search])
  const { state, retry, refresh } = useLoad(load)

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Redirects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Send visitors from an old web address on your shop to the new one — e.g. after renaming a
          sale page, or links from an old shop. Changing a product’s, category’s or page’s address
          adds one by itself. Works within a minute.
        </p>
      </div>
      <RedirectForm initial={null} onSaved={refresh} />
      <form
        role="search"
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setSearch(q.trim())
        }}
      >
        <div className="w-72">
          <Input label="Search addresses" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button type="submit" size="sm" variant="secondary">
          Search
        </Button>
      </form>
      <Panel title="Redirects" state={state} retry={retry}>
        {(rows) =>
          rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No redirects{search && ' found'}.</p>
          ) : (
            <ul aria-label="Redirects" className="flex flex-col divide-y divide-border">
              {rows.map((r) => (
                <Row key={r.id} r={r} onChanged={refresh} />
              ))}
            </ul>
          )
        }
      </Panel>
    </div>
  )
}

function Row({ r, onChanged }: { r: AdminRedirect; onChanged: () => void }) {
  const [editing, setEditing] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  async function remove() {
    const res = await deleteRedirect(r.id)
    if (!res.ok) return setProblem(res.message)
    onChanged()
  }

  if (editing)
    return (
      <li className="py-3">
        <RedirectForm
          initial={r}
          onSaved={() => {
            setEditing(false)
            onChanged()
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  return (
    <li className="flex flex-wrap items-center gap-3 py-3 text-sm">
      <span className="font-mono break-all">{r.fromPath}</span>
      <span aria-hidden="true">→</span>
      <span className="mr-auto font-mono break-all">{r.toPath}</span>
      <Badge variant={r.isActive ? 'success' : 'neutral'}>{r.isActive ? 'On' : 'Off'}</Badge>
      <Badge variant="neutral">{r.permanent ? 'Permanent (301)' : 'Temporary (302)'}</Badge>
      {r.source === 'AUTO' && <Badge variant="info">Automatic</Badge>}
      <span className="text-xs text-muted-foreground">{formatInstantDate(r.updatedAt)}</span>
      <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
        Edit
      </Button>
      {confirm ? (
        <span
          role="group"
          aria-label={`Confirm removing ${r.fromPath}`}
          className="flex items-center gap-2"
        >
          Remove? Old links to {r.fromPath} will show “Page not found”.
          <Button size="sm" variant="secondary" onClick={() => setConfirm(false)}>
            Keep it
          </Button>
          <Button size="sm" onClick={() => void remove()}>
            Yes, remove
          </Button>
        </span>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
          Remove
        </Button>
      )}
      {problem && (
        <p role="alert" className="w-full text-danger">
          {problem}
        </p>
      )}
    </li>
  )
}

function RedirectForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: AdminRedirect | null
  onSaved: () => void
  onCancel?: () => void
}) {
  const [f, setF] = useState<RedirectFields>({
    fromPath: initial?.fromPath ?? '',
    toPath: initial?.toPath ?? '',
    permanent: initial?.permanent ?? true,
    isActive: initial?.isActive ?? true,
  })
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [done, setDone] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setDone(null)
    // The same rules as the API — problems show before anything is sent.
    const check = redirectInputSchema.safeParse(f)
    if (!check.success)
      return setProblem({
        message: 'This redirect isn’t allowed:',
        details: check.error.issues.map((i) => i.message),
      })
    setBusy(true)
    setProblem(null)
    const r = initial ? await updateRedirect(initial.id, f) : await createRedirect(f)
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    if (!initial) {
      setF({ fromPath: '', toPath: '', permanent: true, isActive: true })
      setDone(
        r.data.toPath !== f.toPath.trim()
          ? `Added — it goes straight to ${r.data.toPath} (that address had moved too).`
          : 'Added — it works within a minute.',
      )
    }
    onSaved()
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      aria-label={initial ? `Edit ${initial.fromPath}` : 'Add a redirect'}
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4"
    >
      {!initial && <h2 className="font-semibold">Add a redirect</h2>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Old address"
          value={f.fromPath}
          placeholder="/eid-sale-2025"
          onChange={(e) => setF({ ...f, fromPath: e.target.value })}
          hint="The part after nowoll.com — starts with /"
        />
        <Input
          label="New address"
          value={f.toPath}
          placeholder="/shop/eid"
          onChange={(e) => setF({ ...f, toPath: e.target.value })}
          hint="An address on this shop (other websites aren’t allowed)"
        />
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4"
            checked={f.permanent}
            onChange={(e) => setF({ ...f, permanent: e.target.checked })}
          />
          Permanent (Google updates its results) — untick for a short campaign
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-4"
            checked={f.isActive}
            onChange={(e) => setF({ ...f, isActive: e.target.checked })}
          />
          On
        </label>
      </div>
      <SaveProblems problem={problem} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          {initial ? 'Save' : 'Add redirect'}
        </Button>
        {onCancel && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        {done && (
          <span role="status" className="text-sm text-success">
            {done}
          </span>
        )}
      </div>
    </form>
  )
}
