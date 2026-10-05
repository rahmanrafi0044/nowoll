import { DISTRICTS } from '@nowoll/validation'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import { CartItemDto } from '../../discounts/dto/validate-discount.dto.js'

export class CheckoutQuoteDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Your bag is empty.' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CartItemDto)
  items: CartItemDto[]

  // Optional until the customer has chosen it — without it, shipping isn't known yet.
  @IsOptional()
  @IsIn(DISTRICTS, { message: 'district must be one of the 64 districts of Bangladesh' })
  district?: string

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(30)
  discountCode?: string

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsEmail()
  email?: string
}
