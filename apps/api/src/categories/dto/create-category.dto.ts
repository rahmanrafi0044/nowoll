import { SLUG_MAX_LENGTH, SLUG_PATTERN } from '@nowoll/validation'
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { Trim, TrimOrNull } from '../../common/validation/transforms.js'

// DTO (Data Transfer Object): describes exactly what the client may send.
// Anything not listed here is rejected by the global ValidationPipe.
export class CreateCategoryDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  @MaxLength(100)
  name: string

  // Optional: leave it out and the API generates one from the name.
  // Uses the SAME pattern as the shared Zod slugSchema, so frontend and API agree.
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
  @MaxLength(5000)
  description?: string | null

  @TrimOrNull()
  @IsOptional()
  @IsUrl(
    { protocols: ['https'], require_protocol: true },
    { message: 'imageUrl must be an https URL' },
  )
  imageUrl?: string | null

  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  imageAlt?: string | null

  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  sizeGuide?: string | null

  // null (or omitted) = top-level category
  @IsOptional()
  @IsUUID('all', { message: 'parentId must be a category id' })
  parentId?: string | null

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number

  @IsOptional()
  @IsBoolean()
  isActive?: boolean

  // Search engines show ~60 title / ~160 description characters.
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
}
