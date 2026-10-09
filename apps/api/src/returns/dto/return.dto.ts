import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import { ReturnStatus } from '@nowoll/database/enums'
import { Trim, TrimOrNull } from '../../common/validation/transforms.js'

/** Step 25 decision #2 — a fixed list, so the admin can see patterns ("lots of wrong sizes"). */
export const RETURN_REASONS = [
  'WRONG_SIZE',
  'DAMAGED',
  'NOT_AS_DESCRIBED',
  'CHANGED_MIND',
  'OTHER',
] as const
export type ReturnReason = (typeof RETURN_REASONS)[number]

export class ReturnItemDto {
  @IsUUID()
  orderItemId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number
}

export class RequestReturnDto {
  /** "NW-10001" — what the customer sees. */
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  orderNumber!: string

  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one item to return' })
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemDto)
  items!: ReturnItemDto[]

  @IsIn(RETURN_REASONS)
  reason!: ReturnReason

  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null
}

// ---- Admin -----------------------------------------------------------------

export class AdminReturnsQuery {
  @IsOptional()
  @IsIn(Object.values(ReturnStatus))
  status?: ReturnStatus

  /** An order number: "NW-10001" or "10001". */
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  q?: string

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1
}

export class ApproveReturnDto {
  /** What the customer should do next — shown to them. */
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Tell the customer how to send the items back' })
  @MaxLength(1000)
  note!: string
}

export class RejectReturnDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'A reason is required — the customer sees it' })
  @MaxLength(300)
  reason!: string
}

export class ReceivedItemDto {
  @IsUUID()
  orderItemId!: string

  /** false = came back damaged: don't put it back on sale. */
  @IsBoolean()
  restock!: boolean
}

export class ReceiveReturnDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivedItemDto)
  items!: ReceivedItemDto[]
}

export class RefundReturnDto {
  /** BDT, e.g. "1490" or "1490.50" — never more than is left to refund. */
  @Matches(/^\d{1,9}(\.\d{1,2})?$/, { message: 'amount must be like 1490 or 1490.50' })
  amount!: string

  /** GATEWAY: back through SSLCommerz. MANUAL: you paid it back yourself (cash orders). */
  @IsIn(['GATEWAY', 'MANUAL'])
  method!: 'GATEWAY' | 'MANUAL'

  /** MANUAL: e.g. "bKash TrxID 8N7A6K…" — never an account number (CLAUDE.md §7). */
  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string | null
}

export class ResolveRefundDto {
  /** After checking the SSLCommerz panel: did the money go back? */
  @IsIn(['REFUNDED', 'FAILED'])
  outcome!: 'REFUNDED' | 'FAILED'

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  note!: string
}
