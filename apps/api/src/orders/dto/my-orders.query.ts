import { Type } from 'class-transformer'
import { IsInt, IsOptional, Max, Min } from 'class-validator'

// GET /orders/my?page=2
export class MyOrdersQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 10
}
