import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator'
import { SIZE_UNITS } from '@nowoll/validation'

// The SHAPE of a size chart request. The tables' RULES (numbers only, one
// value per measurement, limits) are the shared sizeChartInputSchema, checked
// in the service — the admin editor uses the very same rules.
export class SaveSizeChartDto {
  @IsString()
  @MaxLength(60)
  name!: string

  @IsOptional()
  @IsIn(SIZE_UNITS)
  unit?: (typeof SIZE_UNITS)[number]

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string | null

  @IsArray()
  @ArrayMaxSize(4)
  pieces!: unknown[]

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}
