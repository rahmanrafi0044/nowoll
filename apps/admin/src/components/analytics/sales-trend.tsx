'use client'

import type { RevenueSeries } from '@nowoll/types'
import { Button } from '@nowoll/ui'
import { type KeyboardEvent, type PointerEvent, useId, useRef, useState } from 'react'
import { niceTicks } from '@/components/dashboard/revenue-chart'
import { formatBdt, formatDayMonth } from '@/lib/format'

// ============================================================================
// Sales over the period, against the previous period (step 41). Plain SVG,
// like the dashboard's chart — no chart library, no inline styles (the admin's
// strict Content-Security-Policy blocks them). Design rules followed:
//   • 2 series → fixed slots 1 and 2 (validated together); "previous" is ALSO
//     dashed, so the two never differ by colour alone; a legend names both
//   • 2px lines, round joins; an end dot (r 4) with a 2px surface ring;
//     the legend carries each period's total (the only labels on the chart)
//   • hairline solid gridlines at clean values; text in text colours only
//   • a crosshair snaps to the nearest point; ONE tooltip lists both series;
//     the arrow keys move it too; every value is also in the table view
// ============================================================================

const W = 720
const H = 260
const M = { top: 20, right: 16, bottom: 28, left: 64 }
const PLOT_W = W - M.left - M.right
const PLOT_H = H - M.top - M.bottom
const MAX_X_LABELS = 7

type Point = RevenueSeries['points'][number]

/** "6 Oct", "6–12 Oct", or "Sep" for a whole month. */
export function pointLabel(p: Point, groupBy: RevenueSeries['groupBy']): string {
  if (groupBy === 'day' || p.start === p.end) return formatDayMonth(p.start)
  if (groupBy === 'month') return formatDayMonth(p.start).split(' ')[1]!
  return `${formatDayMonth(p.start)} – ${formatDayMonth(p.end)}`
}

export function SalesTrend({
  current,
  previous,
}: {
  current: RevenueSeries
  /** The previous period, grouped the same way (null while loading or if it failed). */
  previous: RevenueSeries | null
}) {
  const [active, setActive] = useState<number | null>(null)
  const [showTable, setShowTable] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const titleId = useId()
  const points = current.points
  const before = previous?.points ?? []
  const values = points.map((p) => Number(p.revenue))
  const beforeValues = before.map((p) => Number(p.revenue))
  const max = Math.max(0, ...values, ...beforeValues)

  if (max === 0) return <p className="text-sm text-muted-foreground">No sales in this period.</p>

  const ticks = niceTicks(max)
  const top = ticks.at(-1)!
  const n = points.length
  const x = (i: number) => M.left + (n === 1 ? PLOT_W / 2 : (i / (n - 1)) * PLOT_W)
  const y = (v: number) => M.top + PLOT_H - (v / top) * PLOT_H
  const path = (vs: number[]) => vs.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ')
  const every = Math.ceil(n / MAX_X_LABELS)
  const last = n - 1

  function fromPointer(e: PointerEvent<SVGSVGElement>) {
    const box = svgRef.current?.getBoundingClientRect()
    if (!box || box.width === 0) return
    const svgX = ((e.clientX - box.left) / box.width) * W
    const i = n === 1 ? 0 : Math.round(((svgX - M.left) / PLOT_W) * (n - 1))
    setActive(Math.min(Math.max(i, 0), last))
  }
  function onKey(e: KeyboardEvent<SVGSVGElement>) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      const step = e.key === 'ArrowRight' ? 1 : -1
      setActive((a) => Math.min(Math.max((a ?? (step > 0 ? -1 : n)) + step, 0), last))
    } else if (e.key === 'Escape') setActive(null)
  }

  return (
    <div>
      <ul aria-label="Legend" className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <svg width="20" height="8" aria-hidden="true">
            <line x1="0" x2="20" y1="4" y2="4" className="stroke-chart-1" strokeWidth={2} />
          </svg>
          This period <strong className="text-foreground">{formatBdt(current.total)}</strong>
        </li>
        {previous && (
          <li className="flex items-center gap-1.5">
            <svg width="20" height="8" aria-hidden="true">
              <line
                x1="0"
                x2="20"
                y1="4"
                y2="4"
                className="stroke-chart-2"
                strokeWidth={2}
                strokeDasharray="4 3"
              />
            </svg>
            Previous period <strong className="text-foreground">{formatBdt(previous.total)}</strong>
          </li>
        )}
      </ul>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none overflow-visible outline-none focus-visible:ring-2 focus-visible:ring-brand"
        role="group"
        tabIndex={0}
        aria-labelledby={titleId}
        aria-describedby={`${titleId}-hint`}
        onPointerMove={fromPointer}
        onPointerDown={fromPointer}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        <title id={titleId}>
          Sales per {current.groupBy} in this period, with the previous period
        </title>
        <desc id={`${titleId}-hint`}>Use the left and right arrow keys to read each point.</desc>

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

        {points.map((p, i) =>
          i % every === 0 || i === last ? (
            <text
              key={p.start}
              x={x(i)}
              y={H - 8}
              textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'}
              className="fill-muted-foreground text-[11px]"
            >
              {pointLabel(p, current.groupBy)}
            </text>
          ) : null,
        )}

        {/* The previous period first, so this period is drawn on top. */}
        {beforeValues.length > 0 && (
          <path
            d={path(beforeValues.slice(0, n))}
            fill="none"
            className="stroke-chart-2"
            strokeWidth={2}
            strokeDasharray="4 3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        <path
          d={`${path(values)} L${x(last)},${y(0)} L${x(0)},${y(0)} Z`}
          className="fill-chart-1 opacity-10"
        />
        <path
          d={path(values)}
          fill="none"
          className="stroke-chart-1"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* The end dot: the latest point, ringed in the card colour. */}
        <circle
          cx={x(last)}
          cy={y(values[last]!)}
          r={4}
          className="fill-chart-1 stroke-surface"
          strokeWidth={2}
        />

        {active !== null && (
          <g aria-hidden="true" pointerEvents="none">
            <line
              x1={x(active)}
              x2={x(active)}
              y1={M.top}
              y2={M.top + PLOT_H}
              className="stroke-border-strong"
              strokeWidth={1}
            />
            <circle
              cx={x(active)}
              cy={y(values[active]!)}
              r={4}
              className="fill-chart-1 stroke-surface"
              strokeWidth={2}
            />
            {beforeValues[active] !== undefined && (
              <circle
                cx={x(active)}
                cy={y(beforeValues[active]!)}
                r={4}
                className="fill-chart-2 stroke-surface"
                strokeWidth={2}
              />
            )}
            <Tooltip
              cx={x(active)}
              title={pointLabel(points[active]!, current.groupBy)}
              now={points[active]!}
              before={before[active] ?? null}
              beforeTitle={before[active] ? pointLabel(before[active]!, current.groupBy) : null}
            />
          </g>
        )}
      </svg>
      {/* For screen readers: what the arrow keys point at. */}
      <p aria-live="polite" className="sr-only">
        {active !== null &&
          `${pointLabel(points[active]!, current.groupBy)}: ${formatBdt(points[active]!.revenue)}, ${points[active]!.orders} order${points[active]!.orders === 1 ? '' : 's'}`}
      </p>

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
          <caption className="sr-only">Sales per {current.groupBy}</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-1.5 font-medium">When</th>
              <th className="py-1.5 text-right font-medium">Orders</th>
              <th className="py-1.5 text-right font-medium">Sales</th>
              {previous && <th className="py-1.5 text-right font-medium">Previous period</th>}
            </tr>
          </thead>
          <tbody>
            {points.map((p, i) => (
              <tr key={p.start} className="border-b border-border">
                <td className="py-1.5">{pointLabel(p, current.groupBy)}</td>
                <td className="py-1.5 text-right tabular-nums">{p.orders}</td>
                <td className="py-1.5 text-right tabular-nums">{formatBdt(p.revenue)}</td>
                {previous && (
                  <td className="py-1.5 text-right text-muted-foreground tabular-nums">
                    {before[i] ? formatBdt(before[i]!.revenue) : '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="py-1.5">Total</td>
              <td className="py-1.5 text-right tabular-nums">{current.orders}</td>
              <td className="py-1.5 text-right tabular-nums">{formatBdt(current.total)}</td>
              {previous && (
                <td className="py-1.5 text-right tabular-nums">{formatBdt(previous.total)}</td>
              )}
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}

/** One readout for both lines: this period's value first (strong), then the previous one. */
function Tooltip({
  cx,
  title,
  now,
  before,
  beforeTitle,
}: {
  cx: number
  title: string
  now: Point
  before: Point | null
  beforeTitle: string | null
}) {
  const lines = [
    `${formatBdt(now.revenue)} · ${now.orders} order${now.orders === 1 ? '' : 's'}`,
    ...(before && beforeTitle ? [`Previous (${beforeTitle}): ${formatBdt(before.revenue)}`] : []),
  ]
  const width = Math.max(title.length, ...lines.map((l) => l.length)) * 6.6 + 24
  const height = 22 + lines.length * 17
  // Keep the box inside the chart; put it beside the crosshair, not on it.
  const left = cx + 12 + width > W ? cx - 12 - width : cx + 12
  return (
    <g>
      <rect
        x={Math.max(left, 0)}
        y={M.top}
        width={width}
        height={height}
        rx={6}
        className="fill-surface stroke-border-strong"
        strokeWidth={1}
      />
      <text x={Math.max(left, 0) + 12} y={M.top + 17} className="fill-muted-foreground text-[11px]">
        {title}
      </text>
      {lines.map((l, i) => (
        <text
          key={l}
          x={Math.max(left, 0) + 12}
          y={M.top + 34 + i * 17}
          className={
            i === 0
              ? 'fill-foreground text-[13px] font-semibold'
              : 'fill-muted-foreground text-[12px]'
          }
        >
          {l}
        </text>
      ))}
    </g>
  )
}
