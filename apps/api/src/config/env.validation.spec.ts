import { NodeEnv, parseAllowedOrigins, validateEnv } from './env.validation.js'

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  ALLOWED_ORIGIN: 'http://localhost:3000',
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
    expect(() => validateEnv({ ALLOWED_ORIGIN: 'http://localhost:3000' })).toThrow(/DATABASE_URL/)
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
