import { Transform } from 'class-transformer'
import { IsEmail, IsUUID, MaxLength } from 'class-validator'

/** POST /stock-alerts — "Notify me when it's back" for one sold-out size. */
export class CreateStockAlertDto {
  @IsUUID('all', { message: 'Choose a size' })
  variantId!: string

  // Trimmed + lowercased so "Rafi@Nowoll.com " and "rafi@nowoll.com" are one person.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Enter a valid email address' })
  @MaxLength(254)
  email!: string
}
