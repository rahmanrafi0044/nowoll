import { describe, expect, it } from 'vitest'
import { cleanPath, findRedirect, isProtectedPath, redirectInputSchema } from './redirects.js'

const parse = (v: object) => redirectInputSchema.safeParse(v)

describe('redirects (step 43c)', () => {
  it('addresses are compared cleaned', () => {
    expect(cleanPath('/Shop/Eid/')).toBe('/shop/eid')
    expect(cleanPath('/old-sale?utm=fb#top')).toBe('/old-sale')
    expect(cleanPath('//evil.com')).toBeNull()
    expect(cleanPath('https://evil.com/x')).toBeNull()
    expect(cleanPath('/a/../admin')).toBeNull()
    expect(cleanPath('/with space')).toBeNull()
    expect(cleanPath('/%E0%A6%88%E0%A6%A6')).toBe('/ঈদ') // Bangla addresses work
    expect(cleanPath('/')).toBe('/')
  })

  it('the home page and the shop’s working parts are never redirected', () => {
    for (const p of [
      '/',
      '/checkout',
      '/checkout/success',
      '/cart',
      '/account/orders',
      '/admin',
      '/api/v1/x',
      '/_next/static/a.js',
    ])
      expect(isProtectedPath(p)).toBe(true)
    expect(isProtectedPath('/checkouts-guide')).toBe(false)
    expect(parse({ fromPath: '/checkout', toPath: '/shop' }).success).toBe(false)
  })

  it('only addresses on this shop as the target; never to itself', () => {
    expect(parse({ fromPath: '/old', toPath: '/shop?sort=newest' }).data).toEqual({
      fromPath: '/old',
      toPath: '/shop?sort=newest',
      permanent: true,
      isActive: true,
    })
    for (const to of [
      'https://evil.com',
      '//evil.com',
      'javascript:alert(1)',
      '/\\evil.com',
      'shop',
    ])
      expect(parse({ fromPath: '/old', toPath: to }).success).toBe(false)
    expect(parse({ fromPath: '/Old/', toPath: '/old' }).success).toBe(false)
  })

  it('finding a redirect: cleaned match; the visitor’s ?query carried over unless the target has one', () => {
    const rules = [
      { from: '/old-sale', to: '/shop/eid', permanent: true },
      { from: '/promo', to: '/shop?sort=newest', permanent: false },
    ]
    expect(findRedirect(rules, '/Old-Sale/', '?utm=fb')).toEqual({
      location: '/shop/eid?utm=fb',
      permanent: true,
    })
    expect(findRedirect(rules, '/promo', '?utm=fb')).toEqual({
      location: '/shop?sort=newest',
      permanent: false,
    })
    expect(findRedirect(rules, '/shop/eid')).toBeNull()
    expect(findRedirect([{ from: '/checkout', to: '/x', permanent: true }], '/checkout')).toBeNull()
  })
})
