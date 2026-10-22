'use client'

import type { AdminSizeChart } from '@nowoll/types'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { SelectField } from '@/components/form-fields'
import { fetchSizeCharts } from '@/lib/size-charts-api'

/**
 * "Size chart" drop-down for the product and category forms (38f). '' = none
 * (for a product: use its category's chart). Charts that are switched off are
 * still listed, marked "(off)", so a saved choice never silently disappears.
 */
export function SizeChartPicker({
  value,
  onChange,
  noneLabel,
  hint,
  disabled,
}: {
  value: string
  onChange: (id: string) => void
  noneLabel: string
  hint: string
  disabled?: boolean
}) {
  const [charts, setCharts] = useState<AdminSizeChart[] | null>(null)
  useEffect(() => {
    let live = true
    void fetchSizeCharts().then((r) => live && setCharts(r.ok ? r.data : []))
    return () => {
      live = false
    }
  }, [])
  return (
    <div className="flex flex-col gap-1.5">
      <SelectField
        label="Size chart"
        value={value}
        disabled={disabled || charts === null}
        onChange={(e) => onChange(e.target.value)}
        hint={hint}
      >
        <option value="">{noneLabel}</option>
        {(charts ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.isActive ? '' : ' (off)'}
          </option>
        ))}
      </SelectField>
      <Link
        href="/admin/size-charts"
        className="self-start text-sm underline underline-offset-4"
        target="_blank"
      >
        Make or edit size charts (opens a new tab)
      </Link>
    </div>
  )
}
