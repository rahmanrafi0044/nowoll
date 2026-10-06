import { BULK_PRODUCT_ACTIONS, type BulkProductAction } from '@nowoll/types'
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { ToBoolean, Trim } from '../../common/validation/transforms.js'

export const ADMIN_PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED', 'all'] as const
export const ADMIN_PRODUCT_SORTS = ['updated', 'newest', 'name', 'price_asc', 'price_desc'] as const

// GET /admin/products?q=shirt&status=DRAFT&categoryId=…&lowStock=true&sort=name&page=2
export class AdminProductsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25

  /** Matches the product name, its slug, or any variant's SKU. */
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string

  /** Omitted = drafts and live products (archived ones only when asked for). */
  @IsOptional()
  @IsIn(ADMIN_PRODUCT_STATUSES)
  status?: (typeof ADMIN_PRODUCT_STATUSES)[number]

  @IsOptional()
  @IsUUID('all')
  categoryId?: string

  /** Only products with at least one variant at or below its low-stock limit. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  lowStock?: boolean

  @IsOptional()
  @IsIn(ADMIN_PRODUCT_SORTS)
  sort: (typeof ADMIN_PRODUCT_SORTS)[number] = 'updated'
}

/** POST /admin/products/bulk — one action on up to 100 products. */
export class BulkProductsDto {
  @IsIn(BULK_PRODUCT_ACTIONS, {
    message: `action must be one of: ${BULK_PRODUCT_ACTIONS.join(', ')}`,
  })
  action!: BulkProductAction

  @IsArray()
  @ArrayMinSize(1, { message: 'Choose at least one product' })
  @ArrayMaxSize(100, { message: 'At most 100 products at a time' })
  @ArrayUnique()
  @IsUUID('all', { each: true })
  ids!: string[]
}
