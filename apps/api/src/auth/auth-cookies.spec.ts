// Step 48: COOKIE_PREFIX names the login cookies (staging "nws", production "nw").
afterEach(() => {
  delete process.env.COOKIE_PREFIX
  vi.resetModules()
})

it('uses "nw" by default', async () => {
  const c = await import('./auth-cookies.js')
  expect(c.CUSTOMER_COOKIES).toEqual({ access: 'nw_access', refresh: 'nw_refresh' })
  expect(c.ADMIN_COOKIES).toEqual({ access: 'nw_admin_access', refresh: 'nw_admin_refresh' })
})

it('uses COOKIE_PREFIX when set (staging)', async () => {
  process.env.COOKIE_PREFIX = 'nws'
  vi.resetModules()
  const c = await import('./auth-cookies.js')
  expect(c.CUSTOMER_COOKIES).toEqual({ access: 'nws_access', refresh: 'nws_refresh' })
  expect(c.ADMIN_COOKIES).toEqual({ access: 'nws_admin_access', refresh: 'nws_admin_refresh' })
})
