import { Type } from 'class-transformer'
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { ReviewStatus } from '@nowoll/database/enums'
import { Trim, TrimOrNull } from '../../common/validation/transforms.js'

// Step 24 decision #3. Plain text only: it's shown as text, never as HTML.
export class SubmitReviewDto {
  @IsUUID()
  productId!: string

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5) // (the database has the same CHECK constraint)
  rating!: number

  @TrimOrNull()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  title?: string | null

  @Trim()
  @IsString()
  @MinLength(10, { message: 'Please write at least 10 characters' })
  @MaxLength(2000)
  body!: string
}

export class ProductReviewsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  pageSize: number = 5
}

/** Admin: GET /reviews?status=PENDING&page=1 */
export class AdminReviewsQuery {
  @IsOptional()
  @IsIn(Object.values(ReviewStatus))
  status: ReviewStatus = ReviewStatus.PENDING

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1
}

export class RejectReviewDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'A reason is required — the customer sees it' })
  @MaxLength(300)
  reason!: string
}
