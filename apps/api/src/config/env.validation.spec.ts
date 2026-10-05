import { NodeEnv, parseAllowedOrigins, validateEnv } from './env.validation.js'

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  ALLOWED_ORIGIN: 'http://localhost:3000',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
}
// Production also needs real https addresses (payment notifications go there).
const production = {
  ...valid,
  NODE_ENV: 'production',
  API_PUBLIC_URL: 'https://api.nowoll.com',
  NEXT_PUBLIC_SITE_URL: 'https://nowoll.com',
}

describe('validateEnv', () => {
  it('accepts a valid environment and converts PORT from string to number', () => {
    const env = validateEnv({
      ...production,
      PORT: '4000',
      SSLCOMMERZ_STORE_ID: 's',
      SSLCOMMERZ_STORE_PASSWORD: 'p',
    })
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

  it('refuses to start in production without real SSLCommerz credentials', () => {
    expect(() => validateEnv(production)).toThrow(/SSLCOMMERZ_STORE_ID/)
    expect(() =>
      validateEnv({
        ...production,
        SSLCOMMERZ_STORE_ID: 'your_store_id',
        SSLCOMMERZ_STORE_PASSWORD: 'your_store_password',
      }),
    ).toThrow(/SSLCOMMERZ_STORE_ID/)
    expect(
      validateEnv({
        ...production,
        SSLCOMMERZ_STORE_ID: 'nowoll01',
        SSLCOMMERZ_STORE_PASSWORD: 'pw',
      }).NODE_ENV,
    ).toBe('production')
  })

  it('starts in development without SSLCommerz credentials', () => {
    expect(validateEnv(valid).SSLCOMMERZ_STORE_ID).toBeUndefined()
  })

  it('defaults the public addresses to localhost in development', () => {
    expect(validateEnv(valid)).toMatchObject({
      API_PUBLIC_URL: 'http://localhost:3001',
      NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
    })
  })

  it('refuses http:// public addresses in production (payments must reach https)', () => {
    const creds = { SSLCOMMERZ_STORE_ID: 'nowoll01', SSLCOMMERZ_STORE_PASSWORD: 'pw' }
    expect(() =>
      validateEnv({ ...production, ...creds, API_PUBLIC_URL: 'http://api.nowoll.com' }),
    ).toThrow(/API_PUBLIC_URL must start with https/)
    expect(() =>
      validateEnv({ ...production, ...creds, NEXT_PUBLIC_SITE_URL: 'http://localhost:3000' }),
    ).toThrow(/NEXT_PUBLIC_SITE_URL must start with https/)
  })

  it('rejects a public address that is not a URL', () => {
    expect(() => validateEnv({ ...valid, API_PUBLIC_URL: 'api.nowoll.com' })).toThrow(
      /API_PUBLIC_URL/,
    )
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
