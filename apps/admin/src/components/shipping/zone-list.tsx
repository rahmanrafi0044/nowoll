'use client'

import type { AdminShippingZone } from '@nowoll/types'
import { Badge } from '@nowoll/ui'
import { DIVISION_DISTRICTS } from '@nowoll/validation'
import Link from 'next/link'
import { useState } from 'react'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { formatBdt } from '@/lib/format'
import { fetchZones, zoneForDistrict } from '@/lib/shipping-api'

// ============================================================================
// Admin → Shipping (step 37): the delivery zones and their fees.
// A customer pays the fee of the zone that LISTS their district; districts
// listed nowhere use the DEFAULT zone. Past orders keep the fee they paid.
// ============================================================================

export const days = (z: Pick<AdminShippingZone, 'estimatedDaysMin' | 'estimatedDaysMax'>) =>
  z.estimatedDaysMin !== null && z.estimatedDaysMax !== null
    ? z.estimatedDaysMin === z.estimatedDaysMax
      ? `${z.estimatedDaysMin} day${z.estimatedDaysMin === 1 ? '' : 's'}`
      : `${z.estimatedDaysMin}–${z.estimatedDaysMax} days`
    : '—'

export function ZoneList() {
  const { state, retry } = useLoad(fetchZones)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Shipping</h1>
        <Link
          href="/admin/shipping/new"
          className="inline-flex h-11 items-center rounded-control bg-brand px-5 text-sm font-medium text-brand-foreground hover:bg-brand-hover"
        >
          New zone
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        A customer pays the fee of the zone that lists their district. Districts not listed in any
        zone use the <strong>default</strong> zone. Changes apply to new checkouts — past orders
        keep the fee they paid.
      </p>
      <Panel title="Delivery zones" state={state} retry={retry}>
        {(zones) => (
          <div className="flex flex-col gap-6">
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 font-medium">Zone</th>
                    <th className="py-2 text-right font-medium">Fee</th>
                    <th className="py-2 text-right font-medium">Free from</th>
                    <th className="py-2 font-medium">Delivery time</th>
                    <th className="py-2 font-medium">Districts</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((z) => (
                    <tr key={z.id} className="border-b border-border align-top">
                      <td className="py-2.5">
                        <Link
                          href={`/admin/shipping/${z.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {z.name}
                        </Link>
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {Number(z.fee) === 0 ? 'Free' : formatBdt(z.fee)}
                      </td>
                      <td className="py-2.5 text-right tabular-nums">
                        {z.freeShippingThreshold ? formatBdt(z.freeShippingThreshold) : '—'}
                      </td>
                      <td className="py-2.5">{days(z)}</td>
                      <td className="py-2.5 text-muted-foreground">
                        {z.isDefault
                          ? z.districts.length > 0
                            ? `${z.districts.join(', ')} + all others`
                            : 'All other districts'
                          : z.districts.length > 0
                            ? z.districts.join(', ')
                            : 'None — no customer gets this zone'}
                      </td>
                      <td className="py-2.5">
                        <span className="flex flex-wrap gap-1">
                          {z.isDefault && <Badge variant="info">Default</Badge>}
                          {z.isActive ? <Badge variant="success">On</Badge> : <Badge>Off</Badge>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Checker zones={zones} />
          </div>
        )}
      </Panel>
    </div>
  )
}

/** "Which zone delivers to…?" — the same rule checkout uses. */
function Checker({ zones }: { zones: AdminShippingZone[] }) {
  const [district, setDistrict] = useState('')
  const zone = district ? zoneForDistrict(zones, district) : undefined
  return (
    <section aria-label="Check a district" className="rounded-control border border-border p-4">
      <label className="flex flex-wrap items-center gap-2 text-sm font-medium">
        Which zone delivers to
        <select
          className="h-10 rounded-control border border-border-strong bg-surface px-2 text-sm"
          value={district}
          onChange={(e) => setDistrict(e.target.value)}
        >
          <option value="">choose a district…</option>
          {Object.entries(DIVISION_DISTRICTS).map(([division, list]) => (
            <optgroup key={division} label={division}>
              {list.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        ?
      </label>
      {district && (
        <p role="status" className="mt-2 text-sm">
          {zone ? (
            <>
              <strong>{zone.name}</strong> —{' '}
              {Number(zone.fee) === 0 ? 'free delivery' : formatBdt(zone.fee)}
              {zone.freeShippingThreshold &&
                ` (free on orders of ${formatBdt(zone.freeShippingThreshold)} or more)`}
              , {days(zone)}.
            </>
          ) : (
            <span className="text-danger">No zone — checkout would refuse this district.</span>
          )}
        </p>
      )}
    </section>
  )
}
