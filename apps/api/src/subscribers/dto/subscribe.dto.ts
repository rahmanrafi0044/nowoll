import { Transform } from 'class-transformer'
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator'

export const SUBSCRIBE_SOURCES = ['homepage', 'footer', 'checkout'] as const

export class SubscribeDto {
  // Trimmed + lowercased so "Rafi@Nowoll.com " and "rafi@nowoll.com" are one subscriber.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email: string

  @IsOptional()
  @IsIn(SUBSCRIBE_SOURCES)
  source?: (typeof SUBSCRIBE_SOURCES)[number]
}

/** The secret token from a newsletter email link (64 hex characters). */
export class SubscriberTokenDto {
  @IsString()
  @Matches(/^[0-9a-f]{64}$/, { message: 'This link is not valid' })
  token!: string
}
