'use client'

import type { AdminShippingZone } from '@nowoll/types'
import { Button, Input } from '@nowoll/ui'
import { DISTRICTS, DIVISION_DISTRICTS } from '@nowoll/validation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { createZone, fetchZones, updateZone, type ZoneFields } from '@/lib/shipping-api'

// ============================================================================
// One delivery zone (step 37). Districts are TICKED from the official list —
// never typed — so a spelling mistake can't give a customer the wrong fee.
// A district already in another zone shows where it is; saving it here asks
// "move it?" (the API refuses until asked — DISTRICT_IN_OTHER_ZONE).
// ============================================================================

type Problem = { message: string; details?: string[]; canMove?: boolean }

export function NewZone() {
  const { state, retry } = useLoad(fetchZones)
  return (
    <Panel title="New zone" state={state} retry={retry} className="border-0 bg-transparent p-0">
      {(zones) => <ZoneForm zones={zones} zone={null} />}
    </Panel>
  )
}

export function EditZone({ id }: { id: string }) {
  const { state, retry } = useLoad(fetchZones)
  return (
    <Panel title="Zone" state={state} retry={retry} className="border-0 bg-transparent p-0">
      {(zones) => {
        const zone = zones.find((z) => z.id === id)
        return zone ? (
          <ZoneForm key={zone.updatedAt} zones={zones} zone={zone} />
        ) : (
          <p className="text-sm text-muted-foreground">This zone doesn’t exist.</p>
        )
      }}
    </Panel>
  )
}

/** "" → null; "60" → 60. NaN stays NaN so the check below can name the field. */
const amountOrNull = (v: string) => (v.trim() === '' ? null : Number(v))

export function ZoneForm({
  zones,
  zone,
}: {
  zones: AdminShippingZone[]
  zone: AdminShippingZone | null
}) {
  const router = useRouter()
  const [saved, setSaved] = useState(zone)
  const [name, setName] = useState(zone?.name ?? '')
  const [fee, setFee] = useState(zone ? String(Number(zone.fee)) : '')
  const [free, setFree] = useState(
    zone?.freeShippingThreshold ? String(Number(zone.freeShippingThreshold)) : '',
  )
  const [daysMin, setDaysMin] = useState(zone?.estimatedDaysMin?.toString() ?? '')
  const [daysMax, setDaysMax] = useState(zone?.estimatedDaysMax?.toString() ?? '')
  const [districts, setDistricts] = useState<string[]>(zone?.districts ?? [])
  const [isActive, setIsActive] = useState(zone?.isActive ?? true)
  const [isDefault, setIsDefault] = useState(zone?.isDefault ?? false)
  const [search, setSearch] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const fields = (): ZoneFields => ({
    name: name.trim(),
    fee: Number(fee),
    freeShippingThreshold: amountOrNull(free),
    estimatedDaysMin: amountOrNull(daysMin),
    estimatedDaysMax: amountOrNull(daysMax),
    districts,
    isActive,
    isDefault,
  })
  const base = saved && {
    name: saved.name,
    fee: Number(saved.fee),
    freeShippingThreshold: saved.freeShippingThreshold ? Number(saved.freeShippingThreshold) : null,
    estimatedDaysMin: saved.estimatedDaysMin,
    estimatedDaysMax: saved.estimatedDaysMax,
    districts: saved.districts,
    isActive: saved.isActive,
    isDefault: saved.isDefault,
  }
  const dirty =
    saved === null ? name.trim() !== '' : JSON.stringify(fields()) !== JSON.stringify(base)

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  /** Where each district is now (other zones only). */
  const owner = new Map<string, string>()
  for (const z of zones) if (z.id !== saved?.id) for (const d of z.districts) owner.set(d, z.name)
  const wasDefault = saved?.isDefault ?? false
  const currentDefault = zones.find((z) => z.isDefault && z.id !== saved?.id)

  function toggle(d: string) {
    setDone(null)
    // Kept in the official order (as the API stores them), so "unsaved changes" stays honest.
    setDistricts((all) => DISTRICTS.filter((x) => (x === d ? !all.includes(d) : all.includes(x))))
  }

  function check(f: ZoneFields): string[] {
    const p: string[] = []
    if (!f.name) p.push('Name: write a name, e.g. “Inside Dhaka”')
    if (fee.trim() === '' || !Number.isFinite(f.fee) || f.fee < 0 || f.fee > 10_000)
      p.push('Fee: an amount from ৳0 to ৳10,000')
    else if (Math.round(f.fee * 100) !== f.fee * 100) p.push('Fee: at most 2 decimals')
    if (f.freeShippingThreshold !== null && !(f.freeShippingThreshold >= 1))
      p.push('Free delivery from: an amount of ৳1 or more, or leave it empty')
    for (const [label, v] of [
      ['from', f.estimatedDaysMin],
      ['to', f.estimatedDaysMax],
    ] as const)
      if (v !== null && !(Number.isInteger(v) && v >= 0 && v <= 60))
        p.push(`Delivery time “${label}”: whole days, 0–60`)
    if (
      f.estimatedDaysMin !== null &&
      f.estimatedDaysMax !== null &&
      f.estimatedDaysMin > f.estimatedDaysMax
    )
      p.push('Delivery time: “from” can’t be more days than “to”')
    return p
  }

  async function save(moveDistricts = false) {
    const f = fields()
    const p = check(f)
    if (p.length) return setProblem({ message: 'Some fields need fixing:', details: p })
    setBusy(true)
    setProblem(null)
    setDone(null)
    const r = saved
      ? await updateZone(saved.id, { ...f, ...(moveDistricts && { moveDistricts }) })
      : await createZone({ ...f, ...(moveDistricts && { moveDistricts }) })
    setBusy(false)
    if (!r.ok)
      return setProblem({
        message: r.message,
        details: r.details,
        canMove: r.error === 'DISTRICT_IN_OTHER_ZONE',
      })
    if (!saved) return router.push('/admin/shipping')
    setSaved(r.data)
    setDistricts(r.data.districts)
    setDone('Saved. New checkouts use it straight away.')
  }

  const q = search.trim().toLowerCase()

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold">{saved ? saved.name : 'New delivery zone'}</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Name (shown at checkout)"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dhaka suburbs"
        />
        <Input
          label="Delivery fee (৳)"
          inputMode="decimal"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          hint="0 = always free in this zone."
        />
        <Input
          label="Free delivery from (৳)"
          inputMode="decimal"
          value={free}
          onChange={(e) => setFree(e.target.value)}
          hint="Orders this big or bigger (after any discount) deliver free. Empty = never free."
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Delivery time: from (days)"
            inputMode="numeric"
            value={daysMin}
            onChange={(e) => setDaysMin(e.target.value)}
          />
          <Input
            label="to (days)"
            inputMode="numeric"
            value={daysMax}
            onChange={(e) => setDaysMax(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="size-4"
            checked={isDefault}
            disabled={wasDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Default zone — for every district not listed in another zone
        </label>
        <p className="pl-6 text-muted-foreground">
          {wasDefault
            ? 'This is the default zone. To change that, make another zone the default.'
            : isDefault && currentDefault
              ? `Saving makes this the default instead of “${currentDefault.name}”.`
              : 'There is always exactly one default zone.'}
        </p>
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            className="size-4"
            checked={isActive}
            disabled={isDefault}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          On — offered at checkout
        </label>
        {isDefault && (
          <p className="pl-6 text-muted-foreground">
            The default zone is always on, so every district has a delivery fee.
          </p>
        )}
        {!isActive && (
          <p className="pl-6 text-muted-foreground">
            While it’s off, its districts use the default zone.
          </p>
        )}
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-semibold">
          Districts in this zone ({districts.length})
        </legend>
        {isDefault ? (
          <p className="text-sm text-muted-foreground">
            The default zone already covers every district not ticked in another zone — you don’t
            need to tick any here.
          </p>
        ) : (
          districts.length === 0 && (
            <p className="text-sm text-warning">
              No districts ticked — no customer will get this zone.
            </p>
          )
        )}
        <input
          type="search"
          aria-label="Find a district"
          placeholder="Find a district…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 max-w-xs rounded-control border border-border-strong bg-surface px-3 text-sm"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(DIVISION_DISTRICTS).map(([division, list]) => {
            const shown = list.filter((d) => !q || d.toLowerCase().includes(q))
            if (shown.length === 0) return null
            return (
              <div key={division} role="group" aria-label={`${division} division`}>
                <p className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {division}
                </p>
                <ul className="flex flex-col gap-1">
                  {shown.map((d) => (
                    <li key={d}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={districts.includes(d)}
                          onChange={() => toggle(d)}
                        />
                        {d}
                        {owner.has(d) && (
                          <span className="text-xs text-muted-foreground">(in {owner.get(d)})</span>
                        )}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </fieldset>

      {problem && (
        <div role="alert" className="rounded-control bg-danger-soft p-3 text-sm text-danger">
          <p className="font-medium">{problem.message}</p>
          {problem.details && problem.details.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {problem.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          {problem.canMove && (
            <Button size="sm" className="mt-2" disabled={busy} onClick={() => void save(true)}>
              Move them here and save
            </Button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={busy || (saved !== null && !dirty)} onClick={() => void save()}>
          {busy ? 'Saving…' : saved ? 'Save changes' : 'Create zone'}
        </Button>
        {dirty && <span className="text-sm text-warning">Unsaved changes</span>}
        {done && (
          <span role="status" className="text-sm text-success">
            {done}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Past orders keep the fee they paid. Zones can’t be deleted (orders point to them) — switch
        one off instead.
      </p>
      <Link
        href="/admin/shipping"
        className="text-sm text-muted-foreground underline underline-offset-4"
      >
        ← All zones
      </Link>
    </div>
  )
}
