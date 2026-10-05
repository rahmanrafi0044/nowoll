import { IsOptional, IsString, MaxLength } from 'class-validator'
import { Trim } from '../../common/validation/transforms.js'

export class FacetsQuery {
  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  category?: string

  @Trim()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string
}
