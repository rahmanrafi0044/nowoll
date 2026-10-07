import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator'
import { Trim, TrimOrNull } from '../../common/validation/transforms.js'

const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
] as const
const PAYMENT_STATUSES = [
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'UNDER_REVIEW',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const
const DATE = /^\d{4}-\d{2}-\d{2}$/

// GET /orders?q=NW-10001&status=PENDING&paymentMethod=COD&from=2026-10-01&to=2026-10-07&page=2
export class AdminOrdersQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25

  /** Order number ("NW-10001" or "10001"), customer name, phone or email. */
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string

  @IsOptional()
  @IsIn(ORDER_STATUSES)
  status?: (typeof ORDER_STATUSES)[number]

  @IsOptional()
  @IsIn(['COD', 'SSLCOMMERZ'])
  paymentMethod?: 'COD' | 'SSLCOMMERZ'

  @IsOptional()
  @IsIn(PAYMENT_STATUSES)
  paymentStatus?: (typeof PAYMENT_STATUSES)[number]

  /** Placed on or after this shop day (Bangladesh time), YYYY-MM-DD. */
  @IsOptional()
  @Matches(DATE, { message: 'from must be a date like 2026-10-01' })
  from?: string

  /** Placed on or before this shop day, YYYY-MM-DD. */
  @IsOptional()
  @Matches(DATE, { message: 'to must be a date like 2026-10-07' })
  to?: string
}

// PATCH /orders/:id/status
export class OrderStatusChangeDto {
  @IsIn(ORDER_STATUSES)
  from!: (typeof ORDER_STATUSES)[number]

  @IsIn(ORDER_STATUSES)
  to!: (typeof ORDER_STATUSES)[number]

  @Trim()
  @ValidateIf((o: OrderStatusChangeDto) => o.to === 'CANCELLED' || o.note !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'Give a reason for cancelling — the customer may ask.' })
  @MaxLength(500)
  note?: string

  @Trim()
  @ValidateIf((o: OrderStatusChangeDto) => o.to === 'SHIPPED' || o.courierName !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'Enter the courier (e.g. Pathao, Steadfast) to mark it shipped.' })
  @MaxLength(60)
  courierName?: string

  @Trim()
  @ValidateIf((o: OrderStatusChangeDto) => o.to === 'SHIPPED' || o.trackingNumber !== undefined)
  @IsString()
  @IsNotEmpty({ message: 'Enter the tracking number to mark it shipped.' })
  @MaxLength(80)
  trackingNumber?: string

  @IsOptional()
  @IsBoolean()
  cashCollected?: boolean
}

// PATCH /orders/:id/tracking — fixing a typo after shipping
export class OrderTrackingDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  courierName!: string

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  trackingNumber!: string
}

// PATCH /orders/:id/notes — staff only, never shown to customers
export class OrderNotesDto {
  /** Required in the body: text, or null / "" to clear the notes. */
  @TrimOrNull()
  @ValidateIf((o: OrderNotesDto) => o.adminNotes !== null)
  @IsString()
  @MaxLength(5000)
  adminNotes!: string | null
}
