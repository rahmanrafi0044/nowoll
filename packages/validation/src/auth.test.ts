import { describe, expect, it } from 'vitest'
import { PASSWORD_MAX_LENGTH, passwordSchema } from './auth.js'

describe('passwordSchema', () => {
  it('accepts 8 to 72 characters', () => {
    expect(passwordSchema.safeParse('12345678').success).toBe(true)
    expect(passwordSchema.safeParse('x'.repeat(PASSWORD_MAX_LENGTH)).success).toBe(true)
  })

  it('refuses shorter or longer passwords, with a clear message', () => {
    const short = passwordSchema.safeParse('1234567')
    expect(short.success).toBe(false)
    expect(short.error?.issues[0]?.message).toBe('Use at least 8 characters')
    expect(passwordSchema.safeParse('x'.repeat(73)).success).toBe(false)
  })
})
