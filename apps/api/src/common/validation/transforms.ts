import { Transform } from 'class-transformer'

// class-transformer decorators that CLEAN input before class-validator checks it.
// (They run because ValidationPipe has `transform: true`.)

/** "  Shirts  " → "Shirts" */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))

/**
 * "  Shirts  " → "Shirts", and "" or "   " → null.
 * For optional text fields: an admin clearing a field in a form sends "",
 * which should erase the stored value rather than save an empty string.
 */
export const TrimOrNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  })

/** Query strings and form fields are text: "true" → true, "false" → false. */
export const ToBoolean = () =>
  Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
