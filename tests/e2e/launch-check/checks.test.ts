// The launch check against a pretend site: all good first, then each problem
// it must catch, one at a time (step 54).
import { describe, expect, it } from 'vitest'
import { type CheckResult, runChecks } from './checks.js'

const D = 'shop.test'
const SHOP = `https://${D}`
const API = `https://api.${D}`

type Page = { status?: number; body?: string; headers?: Record<string, string> }
type Site = Record<string, Page | 'down'>

const ok = (data: unknown) => JSON.stringify({ success: true, data })
const ld = (o: object) => `<script type="application/ld+json">${JSON.stringify(o)}</script>`

/** A launched shop that passes every check. */
function goodSite(): Site {
  const page = { status: 200, body: '<h1>Policy</h1><p>Real text.</p>' }
  return {
    [`${SHOP}/`]: {
      body: `<html>${ld({ '@type': 'Organization', name: 'Nowoll' })}</html>`,
      headers: {
        'strict-transport-security': 'max-age=63072000; includeSubDomains',
        'content-security-policy': "default-src 'self'; frame-ancestors 'none'",
      },
    },
    [`https://www.${D}/`]: { status: 301, headers: { location: `${SHOP}/` } },
    [`https://admin.${D}/admin/login`]: {},
    [`${API}/api/v1/health`]: {
      body: ok({ status: 'ok', database: 'up', onlinePayment: 'live' }),
    },
    [`https://staging.${D}/`]: { status: 401 },
    [`https://admin.staging.${D}/admin/login`]: { status: 401 },
    [`https://api.staging.${D}/api/v1/health`]: {},
    [`http://${D}/`]: { status: 301, headers: { location: `${SHOP}/` } },
    [`${API}/api/v1/settings/public`]: {
      body: ok({
        store_email: 'hi@shop.test',
        store_phone: '+8801712345678',
        store_address: 'Dhaka',
      }),
    },
    [`${SHOP}/privacy`]: page,
    [`${SHOP}/terms`]: page,
    [`${SHOP}/returns`]: page,
    [`${API}/api/v1/content-blocks/announcement_bar`]: {
      body: ok({ data: { text: 'Free delivery in Dhaka' } }),
    },
    [`${SHOP}/sitemap.xml`]: {
      body: `<?xml version="1.0"?><urlset><url><loc>${SHOP}</loc></url><url><loc>${SHOP}/products/navy-panjabi</loc></url></urlset>`,
    },
    [`${SHOP}/robots.txt`]: {
      body: `User-Agent: *\nAllow: /\nDisallow: /checkout\n\nSitemap: ${SHOP}/sitemap.xml\n`,
    },
    [`${SHOP}/products/navy-panjabi`]: {
      body: `${ld({ '@type': 'Product', name: 'Navy Panjabi' })}${ld({ '@type': 'BreadcrumbList' })}`,
    },
  }
}

function fakeFetch(site: Site, password?: string) {
  return (url: string, init?: RequestInit) => {
    const page = site[url]
    if (page === 'down' || page === undefined)
      return Promise.reject(
        Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }),
      )
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
    if (password && auth !== password) return Promise.resolve(new Response('', { status: 401 }))
    return Promise.resolve(
      new Response(page.body ?? '', { status: page.status ?? 200, headers: page.headers }),
    )
  }
}

async function check(site: Site, password?: string) {
  return runChecks({
    domain: D,
    fetch: fakeFetch(site, password) as typeof fetch,
    headers: password ? { Authorization: password } : {},
  })
}
const failing = (results: CheckResult[]) =>
  results.filter((r) => r.status !== 'pass').map((r) => r.item)

describe('launch check (step 54)', () => {
  it('a launched shop passes everything', async () => {
    expect(failing(await check(goodSite()))).toEqual([])
  })

  const cases: [string, (s: Site) => void, string][] = [
    [
      'a missing DNS name',
      (s) => (s[`https://admin.${D}/admin/login`] = 'down'),
      'admin answers over HTTPS',
    ],
    [
      'a server error',
      (s) => (s[`${API}/api/v1/health`] = { status: 502 }),
      'api answers over HTTPS',
    ],
    [
      'http:// not redirected',
      (s) => (s[`http://${D}/`] = { status: 200 }),
      'plain http:// is sent to https://',
    ],
    [
      'no HSTS',
      (s) => ((s[`${SHOP}/`] as Page).headers!['strict-transport-security'] = ''),
      'HSTS (browsers always use HTTPS)',
    ],
    [
      'no CSP',
      (s) => ((s[`${SHOP}/`] as Page).headers!['content-security-policy'] = ''),
      'Content-Security-Policy on the shop',
    ],
    [
      'payment in sandbox',
      (s) =>
        (s[`${API}/api/v1/health`] = {
          body: ok({ status: 'ok', database: 'up', onlinePayment: 'sandbox' }),
        }),
      'online payment is LIVE (not SSLCommerz sandbox)',
    ],
    [
      'no phone number',
      (s) =>
        (s[`${API}/api/v1/settings/public`] = {
          body: ok({ store_email: 'a@b.c', store_phone: '', store_address: 'Dhaka' }),
        }),
      'contact details set (email, phone, address)',
    ],
    [
      'a policy still a draft',
      (s) => (s[`${SHOP}/terms`] = { status: 404 }),
      '/terms published with real text',
    ],
    [
      'a policy still placeholder',
      (s) =>
        (s[`${SHOP}/returns`] = { body: 'Return Policy — placeholder. Edit in Admin → Content.' }),
      '/returns published with real text',
    ],
    [
      'no announcement',
      (s) => (s[`${API}/api/v1/content-blocks/announcement_bar`] = { status: 404 }),
      'announcement bar set',
    ],
    [
      'sitemap on localhost',
      (s) =>
        (s[`${SHOP}/sitemap.xml`] = {
          body: '<urlset><url><loc>http://localhost:3000/products/x</loc></url></urlset>',
        }),
      '/sitemap.xml valid, on this domain',
    ],
    [
      'a demo product left',
      (s) =>
        (s[`${SHOP}/sitemap.xml`] = {
          body: `<urlset><url><loc>${SHOP}/products/demo-shirt</loc></url><url><loc>${SHOP}/products/navy-panjabi</loc></url></urlset>`,
        }),
      'no demo / test pages left',
    ],
    [
      'robots blocks Google',
      (s) =>
        (s[`${SHOP}/robots.txt`] = {
          body: `User-Agent: *\nDisallow: /\nSitemap: ${SHOP}/sitemap.xml`,
        }),
      'robots.txt lets Google in and names the sitemap',
    ],
    [
      'no Product data',
      (s) => (s[`${SHOP}/products/navy-panjabi`] = { body: ld({ '@type': 'BreadcrumbList' }) }),
      'structured data: Organization, Product, BreadcrumbList',
    ],
  ]
  it.each(cases)('catches %s', async (_name, breakIt, item) => {
    const site = goodSite()
    breakIt(site)
    // The broken item fails (a few cause a knock-on failure too, e.g. an API that
    // answers 502 also can't report it's healthy).
    expect(failing(await check(site))).toContain(item)
  })

  it('the trial password still on → caught, even though the check itself gets in with it', async () => {
    const results = await check(goodSite(), 'Basic dHJpYWw6cGFzcw==')
    expect(failing(results)).toEqual(['trial password OFF (SITE_PASSWORD=off)'])
  })

  it('a sitemap it cannot read never counts as "no demo pages" (no false pass)', async () => {
    const site = goodSite()
    site[`${SHOP}/sitemap.xml`] = { status: 401 }
    expect(failing(await check(site))).toContain('no demo / test pages left')
  })

  it('only reads: every request is a GET', async () => {
    const methods: string[] = []
    const f = fakeFetch(goodSite())
    await runChecks({
      domain: D,
      fetch: ((url: string, init?: RequestInit) => {
        methods.push(init?.method ?? 'GET')
        return f(url, init)
      }) as typeof fetch,
    })
    expect(new Set(methods)).toEqual(new Set(['GET']))
  })
})
