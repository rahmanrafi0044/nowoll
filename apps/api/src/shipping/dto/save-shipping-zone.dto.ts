import { DISTRICTS } from '@nowoll/validation'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { Trim } from '../../common/validation/transforms.js'

const amount = { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false }

/**
 * POST /admin/shipping/zones (all fields except the optional ones) and
 * PATCH /admin/shipping/zones/:id (any of them — see UpdateShippingZoneDto).
 * The cross-zone rules (one default, a district in one zone) are in the service.
 */
export class CreateShippingZoneDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Write a name, e.g. "Inside Dhaka"' })
  @MaxLength(60)
  name!: string

  /** ৳0 = always free delivery in this zone. */
  @IsNumber(amount, { message: 'The fee must be an amount with at most 2 decimals' })
  @Min(0)
  @Max(10_000, { message: 'The fee can be at most ৳10,000' })
  fee!: number

  /** null = never free. */
  @IsOptional()
  @IsNumber(amount, { message: 'The free-delivery minimum must be an amount' })
  @Min(1, { message: 'The free-delivery minimum must be at least ৳1 (or empty)' })
  @Max(1_000_000)
  freeShippingThreshold?: number | null

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  estimatedDaysMin?: number | null

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  estimatedDaysMax?: number | null

  /** Official names only — a typo could send a customer to the wrong fee. */
  @IsArray()
  @ArrayMaxSize(64)
  @ArrayUnique()
  @IsIn(DISTRICTS, { each: true, message: 'Unknown district: $value' })
  districts!: string[]

  @IsBoolean()
  isActive!: boolean

  /** true = this becomes THE default zone (the previous one stops being default). */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean

  /** true = districts already in another zone are moved here (instead of a 409). */
  @IsOptional()
  @IsBoolean()
  moveDistricts?: boolean
}
