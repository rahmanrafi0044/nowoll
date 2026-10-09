import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { Trim } from '../../common/validation/transforms.js'

export class ListDiscountsQuery {
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

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(30)
  q?: string

  /** ACTIVE | SCHEDULED | EXPIRED | USED_UP | OFF — see discountStatus(). */
  @IsOptional()
  @IsIn(['ACTIVE', 'SCHEDULED', 'EXPIRED', 'USED_UP', 'OFF'])
  status?: 'ACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'USED_UP' | 'OFF'
}
