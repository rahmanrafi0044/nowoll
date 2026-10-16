import { internalHeaders, loginCookieNames, serverApiUrl } from './server-env'

afterEach(() => vi.unstubAllEnvs())

it('without server settings: the public API address, no secret, "nw" cookies', () => {
  vi.stubEnv('API_INTERNAL_URL', '')
  vi.stubEnv('INTERNAL_API_KEY', '')
  vi.stubEnv('COOKIE_PREFIX', '')
  expect(serverApiUrl()).toBe('http://localhost:3001')
  expect(internalHeaders()).toEqual({})
  expect(loginCookieNames()).toEqual({ access: 'nw_access', refresh: 'nw_refresh' })
})

it('staging: its own cookie names', () => {
  vi.stubEnv('COOKIE_PREFIX', 'nws')
  expect(loginCookieNames()).toEqual({ access: 'nws_access', refresh: 'nws_refresh' })
})
