import { NodeEnv, parseAllowedOrigins, validateEnv } from './env.validation.js'

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  ALLOWED_ORIGIN: 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
}

describe('validateEnv', () => {
  it('accepts a valid environment and converts PORT from string to number', () => {
    const env = validateEnv({ ...valid, PORT: '4000', NODE_ENV: 'production' })
    expect(env.PORT).toBe(4000)
    expect(env.NODE_ENV).toBe(NodeEnv.Production)
  })

  it('applies defaults for PORT and NODE_ENV', () => {
    const env = validateEnv(valid)
    expect(env.PORT).toBe(3001)
    expect(env.NODE_ENV).toBe(NodeEnv.Development)
  })

  it('fails fast when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _omit, ...withoutDb } = valid
    expect(() => validateEnv(withoutDb)).toThrow(/DATABASE_URL/)
  })

  it('requires the Supabase service role key (needed for image uploads)', () => {
    const { SUPABASE_SERVICE_ROLE_KEY: _omit, ...rest } = valid
    expect(() => validateEnv(rest)).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/)
  })

  it('rejects a wildcard CORS origin', () => {
    expect(() => validateEnv({ ...valid, ALLOWED_ORIGIN: 'http://localhost:3000, *' })).toThrow(
      /wildcard/,
    )
  })
})

describe('parseAllowedOrigins', () => {
  it('splits a comma-separated list and trims spaces', () => {
    expect(parseAllowedOrigins('http://a.com, http://b.com ,')).toEqual([
      'http://a.com',
      'http://b.com',
    ])
  })
})
