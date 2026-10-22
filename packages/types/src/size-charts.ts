// ============================================================================
// Size charts (38f). The rules live in @nowoll/validation (sizeChartSchema);
// these are the shapes the API sends.
// ============================================================================

/** One piece's table: measurements across the top, one row per size. */
export interface SizeChartPieceView {
  name: string
  columns: string[]
  rows: { size: string; values: string[] }[]
}

/** What the product page shows (no admin name, no on/off). */
export interface SizeChartView {
  unit: 'INCH' | 'CM'
  note: string | null
  pieces: SizeChartPieceView[]
}

/** Admin → Size charts. */
export interface AdminSizeChart extends SizeChartView {
  id: string
  name: string
  isActive: boolean
  /** How many products / categories use it (a hint before archiving). */
  productCount: number
  categoryCount: number
  updatedAt: string
}
