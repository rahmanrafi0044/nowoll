import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'
import { PAGE_CONTENT_MAX, PAGE_SLUG_MAX } from '@nowoll/validation'
import { Trim, TrimOrNull } from '../../common/validation/transforms.js'

// The SHAPE of a page request. The page RULES (reserved addresses, lengths)
// are the shared pageInputSchema, checked in the service — the admin form
// uses the same rules, so both say the same thing.
export class CreatePageDto {
  @Trim()
  @IsString()
  @MaxLength(80)
  title!: string

  @Trim()
  @IsString()
  @MaxLength(PAGE_SLUG_MAX)
  slug!: string

  @IsString()
  @MaxLength(PAGE_CONTENT_MAX)
  content!: string

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

  /** Archiving is DELETE; restoring is PATCH with DRAFT or PUBLISHED. */
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED'])
  status?: 'DRAFT' | 'PUBLISHED'
}
