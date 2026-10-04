import { applyDecorators } from '@nestjs/common'
import { IsNumber, IsPositive, Max } from 'class-validator'

// Decimal(12, 2) in the database → at most 9,999,999,999.99
const MAX_BDT = 9_999_999_999.99

/**
 * A BDT price: a positive number with at most 2 decimal places (poisha).
 * Sent as a JSON number (1499 or 1499.5); stored as an exact Decimal.
 */
export const IsBdtPrice = () =>
  applyDecorators(
    IsNumber(
      { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
      { message: '$property must be an amount with at most 2 decimal places' },
    ),
    IsPositive(),
    Max(MAX_BDT),
  )
