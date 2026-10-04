import { decideAccess, getAccessLevel, HOME_PATH, LOGIN_PATH, safeNextPath } from './admin-access'

describe('getAccessLevel', () => {
  it('is anonymous with no session', () => {
    expect(getAccessLevel(null)).toBe('anonymous')
  })

  it('is authorized only for ADMIN/STAFF who completed 2FA', () => {
    expect(getAccessLevel({ user_role: 'ADMIN', aal: 'aal2' })).toBe('authorized')
    expect(getAccessLevel({ user_role: 'STAFF', aal: 'aal2' })).toBe('authorized')
  })

  it('denies staff who have NOT completed 2FA', () => {
    expect(getAccessLevel({ user_role: 'ADMIN', aal: 'aal1' })).toBe('unauthorized')
  })

  it('denies signed-in customers, even with 2FA', () => {
    expect(getAccessLevel({ user_role: 'CUSTOMER', aal: 'aal2' })).toBe('unauthorized')
  })

  it('denies tokens with no role claim (the default until the Phase 4 hook exists)', () => {
    expect(getAccessLevel({ aal: 'aal2' })).toBe('unauthorized')
    expect(getAccessLevel({})).toBe('unauthorized')
  })

  it('is case-sensitive about roles', () => {
    expect(getAccessLevel({ user_role: 'admin', aal: 'aal2' })).toBe('unauthorized')
  })
})

describe('decideAccess', () => {
  it('sends anonymous visitors to login, remembering where they were going', () => {
    expect(decideAccess('/admin/orders', 'anonymous')).toEqual({
      type: 'redirect',
      to: `${LOGIN_PATH}?next=%2Fadmin%2Forders`,
    })
  })

  it('flags signed-in users without access as forbidden', () => {
    expect(decideAccess('/admin/dashboard', 'unauthorized')).toEqual({
      type: 'redirect',
      to: `${LOGIN_PATH}?next=%2Fadmin%2Fdashboard&error=forbidden`,
    })
  })

  it('lets authorized staff through', () => {
    expect(decideAccess('/admin/orders/123', 'authorized')).toEqual({ type: 'allow' })
  })

  it('always shows the login page to people who are not fully authorized (no redirect loop)', () => {
    expect(decideAccess(LOGIN_PATH, 'anonymous')).toEqual({ type: 'allow' })
    expect(decideAccess(LOGIN_PATH, 'unauthorized')).toEqual({ type: 'allow' })
  })

  it('skips the login page for authorized staff', () => {
    expect(decideAccess(LOGIN_PATH, 'authorized')).toEqual({ type: 'redirect', to: HOME_PATH })
  })

  it('redirects / and /admin to the right starting page', () => {
    expect(decideAccess('/', 'authorized')).toEqual({ type: 'redirect', to: HOME_PATH })
    expect(decideAccess('/admin', 'anonymous')).toEqual({ type: 'redirect', to: LOGIN_PATH })
  })

  it('protects unknown paths too (deny by default)', () => {
    expect(decideAccess('/anything-else', 'anonymous').type).toBe('redirect')
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
