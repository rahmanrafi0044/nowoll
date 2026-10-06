// @vitest-environment node
import { NextRequest } from 'next/server'
import { proxy } from './proxy'

const get = (path: string, cookie?: string) =>
  proxy(
    new NextRequest(new URL(path, 'http://localhost:3002'), {
      ...(cookie && { headers: { cookie } }),
    }),
  )

describe('admin proxy', () => {
  it('redirects visitors without an admin session to login', async () => {
    const res = get('/admin/dashboard')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(
      'http://localhost:3002/admin/login?next=%2Fadmin%2Fdashboard',
    )
  })

  it('a SHOP session is not an admin session', async () => {
    const res = get('/admin/dashboard', 'nw_access=a; nw_refresh=b')
    expect(res.headers.get('location')).toContain('/admin/login')
  })

  it('lets an admin session through, with a nonce-based CSP that allows only our API', async () => {
    const res = get('/admin/dashboard', 'nw_admin_refresh=x')
    expect(res.headers.get('location')).toBeNull()
    const csp = res.headers.get('content-security-policy')!
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+'/)
    expect(csp).toMatch(/connect-src 'self' http:\/\/localhost:3001(;| ws:)/)
  })

  it('uses a different nonce on every request', async () => {
    const a = get('/admin/login').headers.get('content-security-policy')
    const b = get('/admin/login').headers.get('content-security-policy')
    expect(a).not.toBe(b)
  })

  it('shows the login page to anonymous visitors', async () => {
    expect(get('/admin/login').headers.get('location')).toBeNull()
  })
})
