import { FBC_PATTERN, FBP_PATTERN } from '@nowoll/analytics/server'
import { PaymentMethod } from '@nowoll/database/enums'
import { DISTRICTS, DIVISIONS } from '@nowoll/validation'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import { NormalizePhone } from '../../common/validation/phone.js'
import { Trim, TrimOrNull } from '../../common/validation/transforms.js'
import { CartItemDto } from '../../discounts/dto/validate-discount.dto.js'

export class OrderContactDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'fullName is required' })
  @MaxLength(100)
  fullName: string

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email: string

  @NormalizePhone()
  @IsString()
  @Matches(/^\+8801[3-9]\d{8}$/, { message: 'Enter a valid Bangladeshi mobile number' })
  phone: string
}

export class OrderAddressDto {
  @IsIn(DIVISIONS)
  division: string

  @IsIn(DISTRICTS) // must also be IN the division — checked in OrdersService
  district: string

  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  area?: string | null

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'addressLine1 is required' })
  @MaxLength(200)
  addressLine1: string

  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string | null

  @TrimOrNull()
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'postalCode must be 4 digits' })
  postalCode?: string | null
}

// POST /orders — what the checkout sends. Never prices: they're looked up again.
/**
 * Step 39b: sent ONLY when the customer allowed "Marketing" in the cookie
 * banner — Meta's own cookies, so server events can be matched to the ad.
 * Strict formats: anything else is refused (never stored, never sent on).
 */
export class OrderTrackingDto {
  @IsBoolean()
  marketing: boolean

  @IsOptional()
  @IsString()
  @Matches(FBP_PATTERN, { message: 'tracking.fbp is not a Meta _fbp cookie' })
  fbp?: string

  @IsOptional()
  @IsString()
  @Matches(FBC_PATTERN, { message: 'tracking.fbc is not a Meta _fbc cookie' })
  fbc?: string
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Your bag is empty.' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[]

  @ValidateNested()
  @Type(() => OrderContactDto)
  contact: OrderContactDto

  @ValidateNested()
  @Type(() => OrderAddressDto)
  address: OrderAddressDto

  @IsIn([PaymentMethod.COD, PaymentMethod.SSLCOMMERZ])
  paymentMethod: PaymentMethod

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(30)
  discountCode?: string

  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  customerNote?: string | null

  // The total the customer saw on the review step (decision #5): if today's
  // total differs, the order is refused instead of charging a different amount.
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: 'expectedTotal must be an amount like "1550" or "1550.50"',
  })
  expectedTotal: string

  @IsOptional()
  @ValidateNested()
  @Type(() => OrderTrackingDto)
  tracking?: OrderTrackingDto
}
