import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { IsBdtPrice } from '../../common/validation/money.js'
import { Trim, TrimOrNull } from '../../common/validation/transforms.js'

export class CreateVariantDto {
  // Your own stock code, e.g. NW-OXF-M-BLU. Letters, digits, - _ . only, so it
  // survives spreadsheets, barcode labels and courier systems unchanged.
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, {
    message: 'sku may only contain letters, numbers, dots, dashes and underscores',
  })
  sku: string

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  size: string

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  color: string

  @TrimOrNull()
  @IsOptional()
  @IsHexColor()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'colorHex must look like #1E3A8A' })
  colorHex?: string | null

  // null / omitted = sells at the product's base price
  @IsOptional()
  @IsBdtPrice()
  price?: number | null

  @IsOptional()
  @IsBdtPrice()
  compareAtPrice?: number | null

  // Starting stock. After creation, stock only changes through the inventory
  // module (step 11) or orders — every change is then logged with a reason.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  stock?: number

  // null / omitted = use the store-wide low_stock_threshold setting
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  lowStockThreshold?: number | null

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000)
  weightGrams?: number | null

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number
}
