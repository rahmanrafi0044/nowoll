// ============================================================================
// The shape of every response from the Nowoll API (CLAUDE.md §8).
// The API produces these; storefront and admin consume them — sharing one
// definition means a change on one side is a type error on the other.
// ============================================================================

export interface ApiSuccess<T> {
  success: true
  data: T
  message?: string
}

export interface ApiError {
  success: false
  error: string // machine-readable code, e.g. 'NOT_FOUND', 'VALIDATION_ERROR'
  message: string // human-readable, safe to show to the user
  details?: string[] // optional list, e.g. every problem in a CSV import with its row number
}

// A DISCRIMINATED UNION: checking `res.success` tells TypeScript which of the
// two shapes you have, so `res.data` is only accessible after `if (res.success)`.
export type ApiResult<T> = ApiSuccess<T> | ApiError

/** Loose envelope used where the outcome isn't known yet (e.g. the API's error filter). */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
  details?: string[]
}

/** One page of a long list (products, orders, customers…). */
export interface Paginated<T> {
  items: T[]
  total: number // total matching rows, across all pages
  page: number // 1-based
  pageSize: number
  totalPages: number
}

export function isApiError<T>(result: ApiResult<T>): result is ApiError {
  return !result.success
}
