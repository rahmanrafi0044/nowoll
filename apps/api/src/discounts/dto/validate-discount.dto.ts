import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'

export class CartItemDto {
  @IsUUID('all')
  variantId: string

  @IsInt()
  @Min(1)
  @Max(100)
  quantity: number
}

// POST /discounts/validate — the cart sends WHAT is in it (variants +
// quantities), never prices: the API looks the prices up itself.
export class ValidateDiscountDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @MaxLength(30)
  code: string

  @IsArray()
  @ArrayMinSize(1, { message: 'Your bag is empty.' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[]

  // Optional: if known, the once-per-customer limit is checked too (decision #4).
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsEmail()
  email?: string
}
