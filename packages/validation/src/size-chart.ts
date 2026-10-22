import './jitless.js' // first: Zod's no-eval switch (see jitless.ts)
import * as z from 'zod'

// ============================================================================
// Size charts (38f). One chart = 1–4 pieces ("Kameez", "Salwar", "Dupatta"),
// each a small table: measurements across the top, one row per size.
//
//            Chest   Length   Sleeve      ← columns
//   S        36      40       22          ← a row: size + one value per column
//   M        38      41       22.5
//
// The admin editor and the API use the SAME rules, so a chart that passes in
// the browser is never refused by the server. Cells take numbers only (38,
// 38.5 or a range 38-40) — that keeps every chart convertible inch ↔ cm.
// ============================================================================

export const SIZE_UNITS = ['INCH', 'CM'] as const
export type SizeUnit = (typeof SIZE_UNITS)[number]

/** Limits shown in the admin ("up to 8 measurements"). */
export const SIZE_CHART_LIMITS = { pieces: 4, columns: 8, rows: 15 } as const

const NUMBER = String.raw`\d{1,3}(?:\.\d{1,2})?`
/** Empty, "38", "38.5", or a range "38-40" / "38 – 40". */
const CELL = new RegExp(`^(?:${NUMBER}(?:\\s*[-–]\\s*${NUMBER})?)?$`)

const cell = z.string().trim().max(15).regex(CELL, 'Numbers only, e.g. 38, 38.5 or 38-40')

export const sizeChartPieceSchema = z
  .object({
    name: z.string().trim().min(1, 'Name the piece, e.g. Kameez').max(30),
    columns: z
      .array(z.string().trim().min(1, 'Name each measurement, e.g. Chest').max(20))
      .min(1, 'Add at least one measurement')
      .max(SIZE_CHART_LIMITS.columns, `At most ${SIZE_CHART_LIMITS.columns} measurements`),
    rows: z
      .array(
        z.object({
          size: z.string().trim().min(1, 'Write the size, e.g. M').max(20),
          values: z.array(cell),
        }),
      )
      .min(1, 'Add at least one size')
      .max(SIZE_CHART_LIMITS.rows, `At most ${SIZE_CHART_LIMITS.rows} sizes`),
  })
  .superRefine((piece, ctx) => {
    piece.rows.forEach((row, i) => {
      if (row.values.length !== piece.columns.length)
        ctx.addIssue({
          code: 'custom',
          path: ['rows', i, 'values'],
          message: `Size ${row.size || i + 1} needs ${piece.columns.length} values`,
        })
    })
    const seen = new Set<string>()
    piece.rows.forEach((row, i) => {
      const key = row.size.toLowerCase()
      if (seen.has(key))
        ctx.addIssue({
          code: 'custom',
          path: ['rows', i, 'size'],
          message: `Size ${row.size} is listed twice`,
        })
      seen.add(key)
    })
  })

/** What the shop shows (and what is stored in size_charts.pieces + the other columns). */
export const sizeChartSchema = z.object({
  unit: z.enum(SIZE_UNITS).default('INCH'),
  note: z.string().trim().max(300).nullable().default(null),
  pieces: z
    .array(sizeChartPieceSchema)
    .min(1, 'Add at least one piece')
    .max(SIZE_CHART_LIMITS.pieces, `At most ${SIZE_CHART_LIMITS.pieces} pieces`),
})

/** What the admin saves: the chart plus its admin-only name and on/off. */
export const sizeChartInputSchema = sizeChartSchema.extend({
  name: z.string().trim().min(1, 'Name the chart, e.g. Three-piece — regular fit').max(60),
  isActive: z.boolean().default(true),
})

export type SizeChartPiece = z.output<typeof sizeChartPieceSchema>
export type SizeChart = z.output<typeof sizeChartSchema>
export type SizeChartInput = z.output<typeof sizeChartInputSchema>

/** Every issue as "Piece 2 › Size M: Numbers only…" — for the API's error list. */
export function sizeChartProblems(error: z.ZodError): string[] {
  return error.issues.map((i) => {
    const [first, index, ...rest] = i.path
    if (first !== 'pieces' || typeof index !== 'number') return i.message
    const where = [`Piece ${index + 1}`]
    if (rest[0] === 'rows' && typeof rest[1] === 'number') where.push(`row ${rest[1] + 1}`)
    if (rest[0] === 'columns' && typeof rest[1] === 'number')
      where.push(`measurement ${rest[1] + 1}`)
    return `${where.join(' › ')}: ${i.message}`
  })
}

const CM_PER_INCH = 2.54

/**
 * One cell in the other unit: "38" inch → "96.5" cm; "38-40" → "96.5-101.6".
 * Rounded to 1 decimal (", .0" dropped) — tailors' tape measures don't go finer.
 */
export function convertCell(value: string, from: SizeUnit, to: SizeUnit): string {
  if (from === to || !value) return value
  const factor = from === 'INCH' ? CM_PER_INCH : 1 / CM_PER_INCH
  return value.replace(/\d+(?:\.\d+)?/g, (n) => String(Math.round(Number(n) * factor * 10) / 10))
}
