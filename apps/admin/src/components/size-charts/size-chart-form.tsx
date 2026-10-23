'use client'

import type { AdminSizeChart } from '@nowoll/types'
import { Button, Input } from '@nowoll/ui'
import {
  SIZE_CHART_LIMITS,
  type SizeChartPiece,
  type SizeUnit,
  sizeChartInputSchema,
  sizeChartProblems,
} from '@nowoll/validation'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { type FormEvent, useCallback, useState } from 'react'
import { SaveProblems } from '@/components/content/fields'
import { Panel } from '@/components/dashboard/panel'
import { useLoad } from '@/components/dashboard/use-load'
import { SelectField } from '@/components/form-fields'
import { createSizeChart, fetchSizeChart, updateSizeChart } from '@/lib/size-charts-api'

// ============================================================================
// One size chart (38f): a name only you see, inches or cm, and 1–4 pieces —
// each a small table you fill in like a spreadsheet: measurements across the
// top, one row per size. Cells take numbers (38, 38.5 or 38-40); empty is fine.
// The same rules as the API (sizeChartInputSchema) run before saving, so
// problems are listed here first.
// ============================================================================

const SIZES = ['S', 'M', 'L', 'XL']
const blankRows = (columns: number) =>
  SIZES.map((size) => ({ size, values: Array(columns).fill('') }))

/** A ready-made start for Bangladeshi three-pieces (numbers left empty). */
const THREE_PIECE: SizeChartPiece[] = [
  { name: 'Kameez', columns: ['Chest', 'Length', 'Sleeve', 'Shoulder'], rows: blankRows(4) },
  { name: 'Salwar', columns: ['Waist', 'Hip', 'Length'], rows: blankRows(3) },
]
const ONE_PIECE: SizeChartPiece[] = [
  { name: 'Kurti', columns: ['Chest', 'Length'], rows: blankRows(2) },
]

export function NewSizeChart() {
  return <SizeChartForm chart={null} />
}

export function EditSizeChart({ id }: { id: string }) {
  const load = useCallback(() => fetchSizeChart(id), [id])
  const { state, retry } = useLoad(load)
  return (
    <Panel title="Size chart" state={state} retry={retry} className="border-0 bg-transparent p-0">
      {(chart) => <SizeChartForm key={chart.updatedAt} chart={chart} />}
    </Panel>
  )
}

export function SizeChartForm({ chart }: { chart: AdminSizeChart | null }) {
  const router = useRouter()
  const [name, setName] = useState(chart?.name ?? '')
  const [unit, setUnit] = useState<SizeUnit>(chart?.unit ?? 'INCH')
  const [note, setNote] = useState(chart?.note ?? '')
  const [isActive, setIsActive] = useState(chart?.isActive ?? true)
  const [pieces, setPieces] = useState<SizeChartPiece[]>(chart?.pieces ?? ONE_PIECE)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<{ message: string; details?: string[] } | null>(null)
  const [done, setDone] = useState(false)

  /** Changes one piece from its latest state (functional update — no lost typing). */
  const editPiece = (i: number, fn: (p: SizeChartPiece) => SizeChartPiece) => {
    setDone(false)
    setPieces((all) => all.map((p, j) => (j === i ? fn(p) : p)))
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setDone(false)
    const parsed = sizeChartInputSchema.safeParse({
      name,
      unit,
      note: note.trim() || null,
      isActive,
      pieces,
    })
    if (!parsed.success)
      return setProblem({
        message: 'Some of the chart needs fixing:',
        details: sizeChartProblems(parsed.error),
      })
    setBusy(true)
    setProblem(null)
    const r = chart
      ? await updateSizeChart(chart.id, parsed.data)
      : await createSizeChart(parsed.data)
    setBusy(false)
    if (!r.ok) return setProblem({ message: r.message, details: r.details })
    if (!chart) return router.push('/admin/size-charts')
    setDone(true)
  }

  const used =
    chart && chart.productCount + chart.categoryCount > 0
      ? `Used by ${chart.categoryCount} categor${chart.categoryCount === 1 ? 'y' : 'ies'} and ${chart.productCount} product${chart.productCount === 1 ? '' : 's'}.`
      : null

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{chart ? chart.name : 'New size chart'}</h1>
        <Link href="/admin/size-charts" className="text-sm underline underline-offset-4">
          All size charts
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Input
          label="Name (only you see it)"
          value={name}
          maxLength={60}
          placeholder="Three-piece — regular fit"
          onChange={(e) => setName(e.target.value)}
        />
        <SelectField
          label="Numbers are in"
          value={unit}
          onChange={(e) => setUnit(e.target.value as SizeUnit)}
        >
          <option value="INCH">Inches</option>
          <option value="CM">Centimetres</option>
        </SelectField>
      </div>
      <p className="-mt-3 text-sm text-muted-foreground">
        Customers can switch between inches and cm — the shop converts your numbers.
      </p>

      {!chart && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Start from:</span>
          <Button variant="secondary" size="sm" onClick={() => setPieces(THREE_PIECE)}>
            Three-piece (kameez + salwar)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setPieces(ONE_PIECE)}>
            One piece
          </Button>
        </div>
      )}

      {pieces.map((piece, i) => (
        <PieceEditor
          key={i}
          index={i}
          piece={piece}
          edit={(fn) => editPiece(i, fn)}
          onRemove={
            pieces.length > 1 ? () => setPieces((all) => all.filter((_, j) => j !== i)) : undefined
          }
        />
      ))}
      {pieces.length < SIZE_CHART_LIMITS.pieces && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          onClick={() =>
            setPieces((all) => [...all, { name: '', columns: ['Length'], rows: blankRows(1) }])
          }
        >
          Add a piece (e.g. Dupatta)
        </Button>
      )}

      <Input
        label="Note for customers (optional)"
        value={note}
        maxLength={300}
        placeholder="Measured flat across the garment, not the body."
        onChange={(e) => setNote(e.target.value)}
      />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          className="size-4"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Show this chart on the shop
      </label>
      {used && <p className="text-sm text-muted-foreground">{used}</p>}

      <SaveProblems problem={problem} />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : chart ? 'Save chart' : 'Create chart'}
        </Button>
        {done && (
          <span role="status" className="text-sm text-success">
            Saved. Product pages show it within a minute.
          </span>
        )}
      </div>
    </form>
  )
}

/** One piece: its name and a spreadsheet-like table of inputs. */
function PieceEditor({
  index,
  piece,
  edit,
  onRemove,
}: {
  index: number
  piece: SizeChartPiece
  edit: (fn: (p: SizeChartPiece) => SizeChartPiece) => void
  onRemove?: () => void
}) {
  const label = piece.name.trim() || `Piece ${index + 1}`
  const cellClass =
    'h-10 rounded-control border border-border-strong bg-surface px-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-brand'
  return (
    <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <legend className="sr-only">{label}</legend>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full max-w-xs">
          <Input
            label={`Piece ${index + 1} name`}
            value={piece.name}
            maxLength={30}
            placeholder="Kameez"
            onChange={(e) => {
              const v = e.target.value
              edit((p) => ({ ...p, name: v }))
            }}
          />
        </div>
        {onRemove && (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            Remove {label}
          </Button>
        )}
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <table className="text-sm">
          <thead>
            <tr>
              <th scope="col" className="pr-2 pb-2 text-left font-medium">
                Size
              </th>
              {piece.columns.map((c, k) => (
                <th key={k} scope="col" className="px-1 pb-2 align-bottom font-normal">
                  <input
                    aria-label={`${label} measurement ${k + 1}`}
                    value={c}
                    maxLength={20}
                    placeholder="Chest"
                    onChange={(e) => {
                      const v = e.target.value
                      edit((p) => ({ ...p, columns: p.columns.map((x, j) => (j === k ? v : x)) }))
                    }}
                    className={`${cellClass} w-24 font-medium`}
                  />
                  {piece.columns.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove ${c || `measurement ${k + 1}`}`}
                      className="mt-1 block text-xs text-muted-foreground underline underline-offset-2"
                      onClick={() =>
                        edit((p) => ({
                          ...p,
                          columns: p.columns.filter((_, j) => j !== k),
                          rows: p.rows.map((r) => ({
                            ...r,
                            values: r.values.filter((_, j) => j !== k),
                          })),
                        }))
                      }
                    >
                      Remove
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {piece.rows.map((row, r) => (
              <tr key={r}>
                <th scope="row" className="py-1 pr-2">
                  <input
                    aria-label={`${label} size ${r + 1}`}
                    value={row.size}
                    maxLength={20}
                    onChange={(e) => {
                      const v = e.target.value
                      edit((p) => ({
                        ...p,
                        rows: p.rows.map((x, j) => (j === r ? { ...x, size: v } : x)),
                      }))
                    }}
                    className={`${cellClass} w-16 font-medium`}
                  />
                </th>
                {piece.columns.map((c, k) => (
                  <td key={k} className="px-1 py-1">
                    <input
                      aria-label={`${label}, ${row.size || `size ${r + 1}`}, ${c || `measurement ${k + 1}`}`}
                      value={row.values[k] ?? ''}
                      inputMode="decimal"
                      maxLength={15}
                      onChange={(e) => {
                        const v = e.target.value
                        edit((p) => ({
                          ...p,
                          rows: p.rows.map((x, j) =>
                            j === r
                              ? {
                                  ...x,
                                  values: p.columns.map((_, n) =>
                                    n === k ? v : (x.values[n] ?? ''),
                                  ),
                                }
                              : x,
                          ),
                        }))
                      }}
                      className={`${cellClass} w-24 text-right`}
                    />
                  </td>
                ))}
                <td className="pl-2">
                  {piece.rows.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove size ${row.size || r + 1}`}
                      className="text-xs text-muted-foreground underline underline-offset-2"
                      onClick={() =>
                        edit((p) => ({ ...p, rows: p.rows.filter((_, j) => j !== r) }))
                      }
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        {piece.rows.length < SIZE_CHART_LIMITS.rows && (
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Add a size to ${label}`}
            onClick={() =>
              edit((p) => ({
                ...p,
                rows: [...p.rows, { size: '', values: p.columns.map(() => '') }],
              }))
            }
          >
            Add a size
          </Button>
        )}
        {piece.columns.length < SIZE_CHART_LIMITS.columns && (
          <Button
            variant="secondary"
            size="sm"
            aria-label={`Add a measurement to ${label}`}
            onClick={() =>
              edit((p) => ({
                ...p,
                columns: [...p.columns, ''],
                rows: p.rows.map((r) => ({ ...r, values: [...r.values, ''] })),
              }))
            }
          >
            Add a measurement
          </Button>
        )}
      </div>
    </fieldset>
  )
}
