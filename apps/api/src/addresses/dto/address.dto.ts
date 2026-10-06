import { PartialType } from '@nestjs/mapped-types'
import { DISTRICTS, DIVISIONS } from '@nowoll/validation'
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator'
import { NormalizePhone } from '../../common/validation/phone.js'
import { Trim, TrimOrNull } from '../../common/validation/transforms.js'

// The same rules as the checkout address (orders/dto/create-order.dto.ts).
export class CreateAddressDto {
  /** "Home", "Office" — optional. */
  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  label?: string | null

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'fullName is required' })
  @MaxLength(100)
  fullName!: string

  @NormalizePhone()
  @IsString()
  @Matches(/^\+8801[3-9]\d{8}$/, { message: 'Enter a valid Bangladeshi mobile number' })
  phone!: string

  @IsIn(DIVISIONS)
  division!: string

  @IsIn(DISTRICTS) // must also be IN the division — checked in AddressesService
  district!: string

  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  area?: string | null

  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'addressLine1 is required' })
  @MaxLength(200)
  addressLine1!: string

  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string | null

  @TrimOrNull()
  @IsOptional()
  @Matches(/^\d{4}$/, { message: 'postalCode must be 4 digits' })
  postalCode?: string | null

  /** Make this the address checkout starts with. */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean
}

/** PATCH: every field optional (PartialType copies the rules). */
export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
