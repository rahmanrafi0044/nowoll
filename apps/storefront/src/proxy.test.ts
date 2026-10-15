import { NextRequest } from 'next/server'
import { proxy, config } from './proxy'
import * as rules from '@/lib/redirects'

vi.mock('@/lib/redirects', async (orig) => {
  const real = await orig<typeof import('@/lib/redirects')>()
  return { ...real, redirectFor: vi.fn() }
})
const redirectFor = vi.mocked(rules.redirectFor)
const req = (url: string) => new NextRequest(new URL(url, 'https://nowoll.com'))

describe('proxy (step 43c)', () => {
  it('an old address → 301 to the new one (with the query); 302 when temporary', async () => {
    redirectFor.mockResolvedValueOnce({ location: '/shop/eid?utm=fb', permanent: true })
    const res = await proxy(req('/old-sale?utm=fb'))
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe('https://nowoll.com/shop/eid?utm=fb')
    expect(redirectFor).toHaveBeenCalledWith('/old-sale', '?utm=fb')

    redirectFor.mockResolvedValueOnce({ location: '/shop', permanent: false })
    expect((await proxy(req('/promo'))).status).toBe(302)
  })

  it('no rule → the page shows as normal', async () => {
    redirectFor.mockResolvedValueOnce(null)
    const res = await proxy(req('/shop'))
    expect(res.headers.get('location')).toBeNull()
    expect(res.headers.get('x-middleware-next')).toBe('1')
  })

  it('never runs for Next.js files, the API, or files (images, sitemap.xml…)', () => {
    const matcher = new RegExp(
      `^${config.matcher[0]!.replace('/((?!', '/(?!').replace(').*)', ').*')}$`,
    )
    for (const p of ['/old-sale', '/shop/eid', '/products/x']) expect(matcher.test(p)).toBe(true)
    for (const p of [
      '/_next/static/a.js',
      '/api/v1/x',
      '/logo.png',
      '/sitemap.xml',
      '/favicon.ico',
    ])
      expect(matcher.test(p)).toBe(false)
  })
})
