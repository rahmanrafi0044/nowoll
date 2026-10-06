'use client'

import type { RevenueSeries } from '@nowoll/types'
import { Button } from '@nowoll/ui'
import { useId, useState } from 'react'
import { formatBdt, formatLongDay, formatShortDay } from '@/lib/format'

// ============================================================================
// Sales per day — a column chart drawn as plain SVG (no chart library; the
// analytics page in step 41 brings Recharts). Design rules followed:
//   • one series → one colour (chart-1), no legend box — the title names it
//   • thin columns (≤ 24px) with a 4px rounded top, square at the baseline
//   • hairline gridlines at clean values (৳0 / ৳1,000 / ৳2,000…)
//   • only the best day carries a value label; every value is in the
//     tooltip (hover OR keyboard focus) AND in the table view
// Everything is SVG attributes — no inline styles, which the admin's strict
// Content-Security-Policy would block.
// ============================================================================

const W = 640
const H = 240
const M = { top: 24, right: 8, bottom: 28, left: 64 } // room for the y labels and the x labels
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom
const BAR_MAX = 24
const RADIUS = 4

export function RevenueChart({ series }: { series: RevenueSeries }) {
  const [active, setActive] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const titleId = useId()
  const days = series.days
  const values = days.map((d) => Number(d.revenue))
  const max = Math.max(...values)

  if (max === 0)
    return (
      <p className="text-sm text-muted-foreground">No sales in these {days.length} days yet.</p>
    )

  const ticks = niceTicks(max)
  const top = ticks.at(-1)!
  const y = (v: number) => M.top + PLOT_H - (v / top) * PLOT_H
  const band = PLOT_W / days.length
  const barW = Math.min(BAR_MAX, band * 0.6)
  const best = values.indexOf(max)

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full overflow-visible"
        role="group"
        aria-labelledby={titleId}
        onPointerLeave={() => setActive(null)}
      >
        <title id={titleId}>
          Sales per day, {formatLongDay(days[0]!.date)} to {formatLongDay(days.at(-1)!.date)}
        </title>

        {/* Gridlines + y labels (recessive: hairline, light grey, solid) */}
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              x2={W - M.right}
              y1={y(t)}
              y2={y(t)}
              className="stroke-chart-grid"
              strokeWidth={1}
            />
            <text
              x={M.left - 8}
              y={y(t)}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {formatBdt(t)}
            </text>
          </g>
        ))}

        {days.map((d, i) => {
          const v = values[i]!
          const cx = M.left + band * i + band / 2
          const h = y(0) - y(v)
          const label = `${formatLongDay(d.date)}: ${formatBdt(d.revenue)} from ${d.orders} order${d.orders === 1 ? '' : 's'}`
          return (
            <g key={d.date}>
              {v > 0 && (
                <path
                  d={columnPath(cx - barW / 2, y(v), barW, h)}
                  className={active === i ? 'fill-chart-1 opacity-80' : 'fill-chart-1'}
                />
              )}
              {i === best && active !== i && (
                <text
                  x={cx}
                  y={y(v) - 6}
                  textAnchor="middle"
                  className="fill-foreground text-[11px] font-semibold"
                >
                  {formatBdt(d.revenue)}
                </text>
              )}
              <text
                x={cx}
                y={H - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {formatShortDay(d.date)}
              </text>
              {/* The hit target: the whole day's column of space, not just the painted bar. */}
              <rect
                x={M.left + band * i}
                y={M.top}
                width={band}
                height={PLOT_H}
                fill="transparent"
                tabIndex={0}
                aria-label={label}
                className="cursor-default outline-none focus-visible:stroke-brand"
                onPointerEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            </g>
          )
        })}

        {active !== null && <Tooltip day={days[active]!} cx={M.left + band * active + band / 2} />}
      </svg>

      <Button
        variant="ghost"
        size="sm"
        className="mt-2"
        aria-expanded={showTable}
        onClick={() => setShowTable((s) => !s)}
      >
        {showTable ? 'Hide table' : 'Show as table'}
      </Button>
      {showTable && (
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">Sales per day</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1.5 font-medium">Day</th>
              <th className="py-1.5 text-right font-medium">Orders</th>
              <th className="py-1.5 text-right font-medium">Sales</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date} className="border-b border-border">
                <td className="py-1.5">{formatLongDay(d.date)}</td>
                <td className="py-1.5 text-right tabular-nums">{d.orders}</td>
                <td className="py-1.5 text-right tabular-nums">{formatBdt(d.revenue)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="py-1.5">Total</td>
              <td className="py-1.5 text-right tabular-nums">
                {days.reduce((n, d) => n + d.orders, 0)}
              </td>
              <td className="py-1.5 text-right tabular-nums">{formatBdt(series.total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

/** Value first (strong), the day second — the reader already knows which bar. */
function Tooltip({ day, cx }: { day: RevenueSeries['days'][number]; cx: number }) {
  const value = formatBdt(day.revenue)
  const detail = `${formatShortDay(day.date)} · ${day.orders} order${day.orders === 1 ? '' : 's'}`
  const width = Math.max(value.length, detail.length) * 7 + 20 // a generous estimate of text width
  const x = Math.min(Math.max(cx - width / 2, 0), W - width)
  return (
    <g pointerEvents="none" aria-hidden="true">
      <rect
        x={x}
        y={2}
        width={width}
        height={40}
        rx={6}
        className="fill-surface stroke-border-strong"
        strokeWidth={1}
      />
      <text x={x + 10} y={19} className="fill-foreground text-[13px] font-semibold">
        {value}
      </text>
      <text x={x + 10} y={35} className="fill-muted-foreground text-[11px]">
        {detail}
      </text>
    </g>
  )
}

/** A column with a rounded top (4px) and a square foot on the baseline. */
export function columnPath(x: number, top: number, w: number, h: number): string {
  const r = Math.min(RADIUS, w / 2, h)
  const bottom = top + h
  return [
    `M${x},${bottom}`,
    `V${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `H${x + w - r}`,
    `Q${x + w},${top} ${x + w},${top + r}`,
    `V${bottom}`,
    'Z',
  ].join(' ')
}

/**
 * Gridline values at "clean" steps (1, 2 or 5 × a power of ten), from 0 up to
 * the first step at or above the highest value: max 3,400 → 0 / 1,000 / 2,000 / 3,000 / 4,000.
 */
export function niceTicks(max: number, target = 4): number[] {
  const rough = max / target
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough)!
  const count = Math.ceil(max / step)
  return Array.from({ length: count + 1 }, (_, i) => i * step)
}
