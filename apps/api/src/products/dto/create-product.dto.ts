import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@nowoll/validation'
import { Transform, Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import { IsBdtPrice } from '../../common/validation/money.js'
import { Trim, TrimOrNull } from '../../common/validation/transforms.js'
import { CreateVariantDto } from './create-variant.dto.js'

/** " Eid , Festive ,eid" → ["eid", "festive"]: trimmed, lowercase, no blanks or duplicates. */
const normalizeTags = () =>
  Transform(({ value }: { value: unknown }) =>
    Array.isArray(value)
      ? [
          ...new Set(
            value
              .map((t) => (typeof t === 'string' ? t.trim().toLowerCase() : t))
              .filter((t) => t !== ''),
          ),
        ]
      : value,
  )

// New products always start as DRAFT. Publishing (status ACTIVE) happens via
// PATCH, once the product has at least one variant and one image.
export class CreateProductDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(150)
  name: string

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(SLUG_MAX_LENGTH)
  @Matches(SLUG_PATTERN, {
    message: 'slug may only use lowercase letters, numbers and single hyphens',
  })
  slug?: string

  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string | null

  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  shortDescription?: string | null

  @IsUUID('all', { message: 'categoryId must be a category id' })
  categoryId: string

  @IsBdtPrice()
  basePrice: number

  // The strike-through "was" price. Must be higher than the selling price.
  @IsOptional()
  @IsBdtPrice()
  compareAtPrice?: number | null

  @IsOptional()
  @normalizeTags()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(30, { each: true })
  tags?: string[]

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean

  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(70)
  seoTitle?: string | null

  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  seoDescription?: string | null

  // Create the product and its sizes/colors in one request (one transaction).
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[]
}
