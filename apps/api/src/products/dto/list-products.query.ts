import { Type } from 'class-transformer'
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator'
import { ToBoolean, Trim } from '../../common/validation/transforms.js'

export const PRODUCT_SORTS = ['relevance', 'newest', 'price_asc', 'price_desc'] as const
export type ProductSort = (typeof PRODUCT_SORTS)[number]

// GET /products?category=men&q=shirt&size=M&minPrice=500&sort=price_asc&page=2
export class ListProductsQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  pageSize: number = 24 // divisible by 2, 3 and 4 → full rows on every grid layout

  /** Category slug — includes its subcategories. */
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string

  /** Search words, e.g. "cotton shirt". Supports "quotes" and -exclusions. */
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  size?: string

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  inStock?: boolean

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  featured?: boolean

  /** Defaults to "relevance" when searching, otherwise "newest". */
  @IsOptional()
  @IsIn(PRODUCT_SORTS)
  sort?: ProductSort
}
