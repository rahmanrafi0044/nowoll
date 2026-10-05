import { DiscountType } from '@nowoll/database/enums'
import { Transform, Type } from 'class-transformer'
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { IsBdtPrice } from '../../common/validation/money.js'
import { TrimOrNull } from '../../common/validation/transforms.js'

export class CreateDiscountDto {
  // Stored upper-case: "summer10" and "SUMMER10" are the same code.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,30}$/, { message: 'code must be 3–30 letters, numbers, - or _' })
  code: string

  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string | null // admin note, e.g. "Eid 2026 campaign"

  @IsIn([DiscountType.PERCENTAGE, DiscountType.FIXED_AMOUNT])
  type: DiscountType

  // PERCENTAGE: 10 = 10% off (max 100). FIXED_AMOUNT: 200 = ৳200 off.
  @IsBdtPrice()
  value: number

  @IsOptional()
  @IsBdtPrice()
  minOrderAmount?: number | null

  // Caps a percentage discount ("20% off, up to ৳500"). Only for PERCENTAGE codes.
  @IsOptional()
  @IsBdtPrice()
  maxDiscountAmount?: number | null

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  usageLimit?: number | null // total uses across all customers; omit = unlimited

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  usageLimitPerCustomer?: number | null // e.g. 1 = once per customer (matched by email)

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startsAt?: Date | null

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expiresAt?: Date | null

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
