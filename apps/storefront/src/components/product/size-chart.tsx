'use client'

import type { SizeChartView } from '@nowoll/types'
import { convertCell } from '@nowoll/validation'
import { useState } from 'react'

const UNIT_LABEL = { INCH: 'Inches', CM: 'cm' } as const

/**
 * The size chart inside the product page's "Size guide" fold (38f): one real
 * table per piece (Kameez, Salwar, Dupatta), with an inches / cm switch.
 * Real <table>s with header cells, so screen readers say "Chest, M, 38".
 * Wide tables scroll sideways inside their own box (never the whole page);
 * that box can take keyboard focus so it can be scrolled without a mouse.
 */
export function SizeChart({ chart }: { chart: SizeChartView }) {
  const [unit, setUnit] = useState(chart.unit)
  return (
    <div className="flex flex-col gap-5 text-foreground">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground">Measurements in {UNIT_LABEL[unit].toLowerCase()}</p>
        <div role="group" aria-label="Units" className="flex border border-border-strong">
          {(['INCH', 'CM'] as const).map((u) => (
            <button
              key={u}
              type="button"
              aria-pressed={unit === u}
              onClick={() => setUnit(u)}
              className={`h-9 px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                unit === u ? 'bg-foreground text-surface' : 'hover:bg-surface-muted'
              }`}
            >
              {UNIT_LABEL[u]}
            </button>
          ))}
        </div>
      </div>
      {chart.pieces.map((piece, i) => (
        <div
          key={`${piece.name}-${i}`}
          role="region"
          aria-label={`${piece.name} sizes`}
          tabIndex={0}
          className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-brand"
        >
          <table className="w-full min-w-max border-collapse text-sm tabular-nums">
            <caption className="pb-2 text-left font-display text-base">{piece.name}</caption>
            <thead>
              <tr className="border-b border-border-strong">
                <th scope="col" className="py-2 pr-4 text-left font-medium">
                  Size
                </th>
                {piece.columns.map((c) => (
                  <th key={c} scope="col" className="px-3 py-2 text-right font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {piece.rows.map((row) => (
                <tr key={row.size} className="border-b border-border">
                  <th scope="row" className="py-2 pr-4 text-left font-medium">
                    {row.size}
                  </th>
                  {row.values.map((v, j) => (
                    <td key={j} className="px-3 py-2 text-right text-muted-foreground">
                      {v ? convertCell(v, chart.unit, unit) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {chart.note && <p className="text-muted-foreground">{chart.note}</p>}
    </div>
  )
}
