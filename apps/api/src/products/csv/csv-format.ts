// ============================================================================
// The product CSV format — shared by export and import, so a file exported
// from Nowoll can be edited in Excel/Google Sheets and imported back.
//
// ONE ROW PER VARIANT. Product columns repeat on every row of that product.
// A product with no variants is a single row with the variant columns empty.
// ============================================================================

export const PRODUCT_COLUMNS = [
  'product_slug', // identifies the product (required)
  'product_name',
  'category_slug',
  'status', // DRAFT or ACTIVE
  'base_price',
  'compare_at_price',
  'short_description',
  'description',
  'tags', // separated by |  e.g. "eid|festive|cotton"
  'is_featured', // true / false
  'seo_title',
  'seo_description',
] as const

export const VARIANT_COLUMNS = [
  'sku', // identifies the variant; empty = this row has no variant
  'size',
  'color',
  'color_hex',
  'variant_price', // empty = use base_price
  'variant_compare_at_price',
  'stock',
  'low_stock_threshold', // empty = use the store-wide setting
  'weight_grams',
  'variant_active', // true / false
] as const

export const CSV_COLUMNS = [...PRODUCT_COLUMNS, ...VARIANT_COLUMNS] as const
export type CsvColumn = (typeof CSV_COLUMNS)[number]

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024 // 2 MB ≈ 10,000+ rows
export const MAX_IMPORT_ROWS = 5000

/**
 * Undo the export's spreadsheet-formula protection: the exporter writes
 * "'=..." for cells starting with = + - @ so Excel won't run them as formulas
 * (CSV injection). On the way back in we remove that added quote again.
 */
export function unescapeFormula(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value
}
