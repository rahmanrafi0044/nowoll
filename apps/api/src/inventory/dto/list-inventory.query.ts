import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { Trim } from '../../common/validation/transforms.js'

export class ListInventoryQuery {
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
  pageSize: number = 50

  /** Matches SKU or product name. */
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string

  /** Category slug (exact category, not subcategories). */
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string

  @IsOptional()
  @IsIn(['out'])
  stock?: 'out'

  @IsOptional()
  @IsIn(['stock_asc', 'stock_desc', 'name'])
  sort: 'stock_asc' | 'stock_desc' | 'name' = 'stock_asc' // most urgent first
}

export class PageQuery {
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
  pageSize: number = 50
}
