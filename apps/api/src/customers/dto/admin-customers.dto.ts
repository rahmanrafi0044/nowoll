import { Type } from 'class-transformer'
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { Trim } from '../../common/validation/transforms.js'

export const CUSTOMER_SORTS = ['newest', 'spent', 'orders', 'name'] as const

// GET /admin/customers?q=rafi&status=BANNED&sort=spent&page=2
export class AdminCustomersQuery {
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

  /** Name, email or phone (any format). */
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string

  @IsOptional()
  @IsIn(['ACTIVE', 'BANNED'])
  status?: 'ACTIVE' | 'BANNED'

  @IsOptional()
  @IsIn(CUSTOMER_SORTS)
  sort: (typeof CUSTOMER_SORTS)[number] = 'newest'
}

// PATCH /admin/customers/:id/ban
export class BanCustomerDto {
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Give a reason — other staff will see it (the customer won’t).' })
  @MaxLength(500)
  reason!: string
}
