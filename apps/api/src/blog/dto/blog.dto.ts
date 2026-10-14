import { BLOG_CONTENT_MAX, BLOG_PAGE_SIZE } from '@nowoll/validation'
import { Type } from 'class-transformer'
import {
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'

// The SHAPE of a blog request. The RULES (lengths, tags, photos, a cover's
// description) are the shared blogInputSchema, checked in the service — the
// admin form uses the same rules, so both say the same thing.
export class SaveBlogPostDto {
  @IsString()
  @MaxLength(200)
  title!: string

  @IsString()
  @MaxLength(100)
  slug!: string

  @IsOptional()
  @IsString()
  @MaxLength(400)
  excerpt?: string | null

  @IsString()
  @MaxLength(BLOG_CONTENT_MAX)
  content!: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverImageUrl?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(300)
  coverImageAlt?: string | null

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[]

  @IsOptional()
  @IsString()
  @MaxLength(100)
  seoTitle?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(200)
  seoDescription?: string | null

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[]

  /** Archiving is DELETE; restoring an archived post is PATCH with DRAFT or PUBLISHED. */
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED'])
  status?: 'DRAFT' | 'PUBLISHED'

  /** When it goes (or went) live; a future date = scheduled. Empty when publishing = now. */
  @IsOptional()
  @IsISO8601()
  publishedAt?: string | null
}

export class BlogListQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  page: number = 1

  @IsOptional()
  @IsString()
  @MaxLength(30)
  tag?: string
}

export class AdminBlogListQuery {
  @IsOptional()
  @IsIn(['DRAFT', 'PUBLISHED', 'ARCHIVED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'
}

export const PAGE_SIZE = BLOG_PAGE_SIZE
