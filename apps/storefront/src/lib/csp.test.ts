import { buildCsp } from './csp'

const directives = (csp: string) =>
  Object.fromEntries(csp.split('; ').map((d) => [d.split(' ')[0], d.split(' ').slice(1)]))

const csp = directives(
  buildCsp({
    apiUrl: 'https://api.nowoll.com',
    supabaseUrl: 'https://abc.supabase.co',
    dev: false,
  }),
)

it('locks the dangerous things down', () => {
  expect(csp['default-src']).toEqual(["'self'"])
  expect(csp['frame-ancestors']).toEqual(["'none'"])
  expect(csp['object-src']).toEqual(["'none'"])
  expect(csp['base-uri']).toEqual(["'self'"])
  expect(csp['form-action']).toEqual(["'self'"])
})

it('scripts only from the shop, Google tag and Meta Pixel — never any site, no eval in production', () => {
  expect(csp['script-src']).toEqual([
    "'self'",
    "'unsafe-inline'",
    'https://www.googletagmanager.com',
    'https://connect.facebook.net',
  ])
  expect(csp['script-src']).not.toContain("'unsafe-eval'")
  expect(csp['script-src']).not.toContain('*')
})

it('data goes only to the API, Supabase and the two trackers (from the build settings)', () => {
  expect(csp['connect-src']).toEqual(
    expect.arrayContaining(['https://api.nowoll.com', 'https://abc.supabase.co']),
  )
  expect(csp['connect-src']).not.toContain('*')
})

it('the dev server may eval; a bad or missing address is simply left out', () => {
  const dev = directives(buildCsp({ apiUrl: 'not a url', dev: true }))
  expect(dev['script-src']).toContain("'unsafe-eval'")
  expect(dev['connect-src'].join(' ')).not.toMatch(/not a url|undefined|null/)
})
