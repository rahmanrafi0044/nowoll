import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, Matches, Max, Min } from 'class-validator'
import { MAX_PERIOD_DAYS } from '../period.js'

const DATE = /^\d{4}-\d{2}-\d{2}$/
const DATE_MESSAGE = 'Use a date like 2026-09-30'

/**
 * Which days (step 40): `?days=30` (the last 30 shop days, today included) or
 * `?from=2026-09-01&to=2026-09-30` (Bangladesh calendar days, both included).
 * The service checks the pair (both or neither, from ≤ to, at most a year).
 */
export class PeriodQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PERIOD_DAYS)
  days: number = 30

  @IsOptional()
  @Matches(DATE, { message: `from: ${DATE_MESSAGE}` })
  from?: string

  @IsOptional()
  @Matches(DATE, { message: `to: ${DATE_MESSAGE}` })
  to?: string
}

/** GET /analytics/revenue — the dashboard asks for 7 days; the analytics page any period. */
export class RevenueQuery extends PeriodQuery {
  override days: number = 7

  /** Points on the chart: one per day, week (7-day blocks) or calendar month. Default: by length. */
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  groupBy?: 'day' | 'week' | 'month'
}

/** GET /analytics/top-products?days=30&limit=5 */
export class TopProductsQuery extends PeriodQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 5
}

/** GET /analytics/top-categories — each category, or rolled up to the top level ("Men"). */
export class TopCategoriesQuery extends PeriodQuery {
  @IsOptional()
  @IsIn(['category', 'top'])
  level: 'category' | 'top' = 'category'

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10
}

/** GET /analytics/customers — plus the biggest spenders. */
export class CustomersQuery extends PeriodQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10
}
