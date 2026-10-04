import { requireEnv } from './env'

describe('requireEnv', () => {
  it('returns the value when set', () => {
    expect(requireEnv('NEXT_PUBLIC_X', 'abc')).toBe('abc')
  })

  it('throws a helpful message naming the missing variable', () => {
    expect(() => requireEnv('NEXT_PUBLIC_SUPABASE_URL', undefined)).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL is not set/,
    )
    expect(() => requireEnv('NEXT_PUBLIC_SUPABASE_URL', '')).toThrow()
  })
})
