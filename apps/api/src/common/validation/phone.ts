import { bdPhoneSchema } from '@nowoll/validation'
import { Transform } from 'class-transformer'

/** "017 1234-5678" → "+8801712345678" using the shared rule; invalid input is left for @Matches to reject. */
export const NormalizePhone = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value
    const parsed = bdPhoneSchema.safeParse(value)
    return parsed.success ? parsed.data : value
  })
