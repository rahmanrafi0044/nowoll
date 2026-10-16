import { decideAccess, getAccessLevel, HOME_PATH, LOGIN_PATH, safeNextPath } from './admin-access'

const jar = (...names: string[]) => ({ has: (n: string) => names.includes(n) })

describe('getAccessLevel', () => {
  it('is anonymous without admin cookies', () => {
    expect(getAccessLevel(jar())).toBe('anonymous')
  })

  it('the SHOP session cookies never count', () => {
    expect(getAccessLevel(jar('nw_access', 'nw_refresh'))).toBe('anonymous')
  })

  it('either admin cookie counts (the access one expires first)', () => {
    expect(getAccessLevel(jar('nw_admin_access'))).toBe('has-session')
    expect(getAccessLevel(jar('nw_admin_refresh'))).toBe('has-session')
  })

  it('staging (COOKIE_PREFIX=nws): only its own cookies count, never production’s (step 48)', () => {
    vi.stubEnv('COOKIE_PREFIX', 'nws')
    expect(getAccessLevel(jar('nw_admin_access'))).toBe('anonymous')
    expect(getAccessLevel(jar('nws_admin_refresh'))).toBe('has-session')
    vi.unstubAllEnvs()
  })
})

describe('decideAccess', () => {
  it('sends visitors without a session to login, remembering where they were going', () => {
    expect(decideAccess('/admin/orders', 'anonymous')).toEqual({
      type: 'redirect',
      to: `${LOGIN_PATH}?next=%2Fadmin%2Forders`,
    })
  })

  it('lets a session through (the API then checks role + 2FA)', () => {
    expect(decideAccess('/admin/orders', 'has-session')).toEqual({ type: 'allow' })
  })

  it('always shows the login page', () => {
    expect(decideAccess(LOGIN_PATH, 'anonymous')).toEqual({ type: 'allow' })
    expect(decideAccess(LOGIN_PATH, 'has-session')).toEqual({ type: 'allow' })
  })

  it('protects unknown paths too (deny by default)', () => {
    expect(decideAccess('/anything-else', 'anonymous').type).toBe('redirect')
  })

  it('/ and /admin go to the dashboard or login', () => {
    expect(decideAccess('/', 'has-session')).toEqual({ type: 'redirect', to: HOME_PATH })
    expect(decideAccess('/admin', 'anonymous')).toEqual({ type: 'redirect', to: LOGIN_PATH })
  })
})

describe('safeNextPath', () => {
  it('accepts internal admin paths', () => {
    expect(safeNextPath('/admin/orders?status=PENDING')).toBe('/admin/orders?status=PENDING')
  })

  it.each([
    ['missing', undefined],
    ['external URL', 'https://evil.com'],
    ['protocol-relative URL', '//evil.com/admin/'],
    ['backslash trick', '/admin/\\evil.com'],
    ['non-admin path', '/somewhere'],
  ])('falls back to the dashboard for %s', (_label, value) => {
    expect(safeNextPath(value)).toBe(HOME_PATH)
  })
})
