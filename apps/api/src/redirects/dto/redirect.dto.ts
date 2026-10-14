import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator'

// The SHAPE of a redirect request; the RULES (cleaning, protected addresses,
// this-shop-only targets) are the shared redirectInputSchema, in the service.
export class SaveRedirectDto {
  @IsString()
  @MaxLength(300)
  fromPath!: string

  @IsString()
  @MaxLength(300)
  toPath!: string

  @IsOptional()
  @IsBoolean()
  permanent?: boolean

  @IsOptional()
  @IsBoolean()
  isActive?: boolean
}

export class RedirectListQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string
}
