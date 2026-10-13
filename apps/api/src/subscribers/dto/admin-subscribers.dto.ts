import { SubscriberStatus } from '@nowoll/database/enums'
import { Type } from 'class-transformer'
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'

/** GET /admin/subscribers?status=SUBSCRIBED&q=rafi&page=1 */
export class AdminSubscribersQuery {
  @IsOptional()
  @IsIn(Object.values(SubscriberStatus))
  status?: SubscriberStatus

  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string

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
