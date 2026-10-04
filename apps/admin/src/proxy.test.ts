// @vitest-environment node
import { NextRequest } from 'next/server'
import type { AccessTokenClaims } from './lib/admin-access'

// Replace Supabase with a fake whose getClaims() returns whatever each test sets.
let fakeClaims: AccessTokenClaims | null = null
let refreshedCookies: { name: string; value: string; options: object }[] = []

vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { setAll: (c: typeof refreshedCookies, h: Record<string, string>) => void } },
  ) => ({
    auth: {
      getClaims: async () => {
        if (refreshedCookies.length) {
          opts.cookies.setAll(refreshedCookies, { 'Cache-Control': 'private, no-store' })
        }
        return { data: fakeClaims ? { claims: fakeClaims } : null, error: null }
      },
    },
  }),
}))

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')

const { proxy } = await import('./proxy')

const get = (path: string) => proxy(new NextRequest(new URL(path, 'http://localhost:3002')))

describe('admin proxy', () => {
  beforeEach(() => {
    fakeClaims = null
    refreshedCookies = []
  })

  it('redirects anonymous visitors to login', async () => {
    const res = await get('/admin/dashboard')
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(
      'http://localhost:3002/admin/login?next=%2Fadmin%2Fdashboard',
    )
  })

  it('redirects a signed-in CUSTOMER to login with error=forbidden', async () => {
    fakeClaims = { user_role: 'CUSTOMER', aal: 'aal2' }
    const res = await get('/admin/dashboard')
    expect(res.headers.get('location')).toContain('error=forbidden')
  })

  it('redirects an ADMIN who skipped 2FA', async () => {
    fakeClaims = { user_role: 'ADMIN', aal: 'aal1' }
    const res = await get('/admin/orders')
    expect(res.headers.get('location')).toContain('error=forbidden')
  })

  it('lets an ADMIN with 2FA through, with a nonce-based CSP', async () => {
    fakeClaims = { user_role: 'ADMIN', aal: 'aal2' }
    const res = await get('/admin/dashboard')
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('content-security-policy')).toMatch(/script-src 'self' 'nonce-[^']+'/)
  })

  it('uses a different nonce on every request', async () => {
    const a = (await get('/admin/login')).headers.get('content-security-policy')
    const b = (await get('/admin/login')).headers.get('content-security-policy')
    expect(a).not.toBe(b)
  })

  it('shows the login page to anonymous visitors', async () => {
    const res = await get('/admin/login')
    expect(res.headers.get('location')).toBeNull()
  })

  it('passes refreshed session cookies and no-cache headers back to the browser', async () => {
    refreshedCookies = [{ name: 'sb-test-auth-token', value: 'new', options: { httpOnly: true } }]
    const res = await get('/admin/dashboard') // anonymous → redirect, but cookies must still be set
    expect(res.cookies.get('sb-test-auth-token')?.value).toBe('new')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})
