// ============================================================================
// The launch check (step 54, docs/launch-checklist.md): the launch checklist
// items that can be proven from OUTSIDE, the way a customer, Google or an ad
// click reaches the site. Run with `pnpm launch-check -- --url https://nowoll.com`.
//
// Each check only READS (GET requests, no forms, no orders), so it is safe to
// run against production at any time. `fetch` is passed in, so the unit tests
// (checks.test.ts) can hand it a pretend site that fails one check at a time.
// ============================================================================

export type Status = 'pass' | 'fail' | 'warn'

export interface CheckResult {
  /** The launch checklist section it belongs to. */
  section: string
  item: string
  status: Status
  /** What was seen — and, when it fails, what to do. */
  detail: string
}

export interface CheckOptions {
  /** e.g. "nowoll.com" */
  domain: string
  /** Extra request headers (the trial's password, as Basic auth). */
  headers?: Record<string, string>
  fetch?: typeof fetch
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/** Words that must not be on a launched shop. */
const LEFTOVERS = /\b(lorem ipsum|placeholder|e2e|demo-)/i

export async function runChecks(opts: CheckOptions): Promise<CheckResult[]> {
  const doFetch: Fetch = opts.fetch ?? fetch
  const headers = opts.headers ?? {}
  const shop = `https://${opts.domain}`
  const api = `https://api.${opts.domain}`
  const results: CheckResult[] = []
  const add = (section: string, item: string, status: Status, detail: string) =>
    results.push({ section, item, status, detail })

  /** GET without following redirects; never throws (an error becomes `error`). */
  async function get(url: string, extra: Record<string, string> = headers) {
    try {
      const res = await doFetch(url, { headers: extra, redirect: 'manual' })
      return { res, error: null }
    } catch (e) {
      const cause = (e as { cause?: { code?: string; message?: string } }).cause
      return { res: null, error: cause?.code ?? cause?.message ?? String(e) }
    }
  }
  async function json<T>(url: string): Promise<T | null> {
    const { res } = await get(url)
    if (!res?.ok) return null
    try {
      const body = (await res.json()) as { success?: boolean; data?: T }
      return body.success ? (body.data ?? null) : null
    } catch {
      return null
    }
  }

  // ── DNS & SSL ──────────────────────────────────────────────────────────────
  const hosts: [string, string][] = [
    ['shop', `${shop}/`],
    ['www (→ shop)', `https://www.${opts.domain}/`],
    ['admin', `https://admin.${opts.domain}/admin/login`],
    ['api', `${api}/api/v1/health`],
    ['staging shop', `https://staging.${opts.domain}/`],
    ['staging admin', `https://admin.staging.${opts.domain}/admin/login`],
    ['staging api', `https://api.staging.${opts.domain}/api/v1/health`],
  ]
  for (const [name, url] of hosts) {
    const { res, error } = await get(url)
    if (error) add('DNS & SSL', `${name} answers over HTTPS`, 'fail', `${url}: ${error}`)
    else if (res!.status >= 500)
      add('DNS & SSL', `${name} answers over HTTPS`, 'fail', `${url}: HTTP ${res!.status}`)
    else add('DNS & SSL', `${name} answers over HTTPS`, 'pass', `${url}: HTTP ${res!.status}`)
  }

  {
    const { res, error } = await get(`http://${opts.domain}/`)
    const to = res?.headers.get('location') ?? ''
    const ok = !!res && [301, 302, 307, 308].includes(res.status) && to.startsWith('https://')
    add(
      'DNS & SSL',
      'plain http:// is sent to https://',
      ok ? 'pass' : 'fail',
      error ? error : `HTTP ${res!.status}${to ? ` → ${to}` : ' (no redirect)'}`,
    )
  }

  const home = await get(`${shop}/`)
  {
    const hsts = home.res?.headers.get('strict-transport-security') ?? ''
    add(
      'DNS & SSL',
      'HSTS (browsers always use HTTPS)',
      /max-age=\d{7,}/.test(hsts) ? 'pass' : 'fail',
      hsts || 'no Strict-Transport-Security header',
    )
    const noAuth = await get(`${shop}/`, {})
    add(
      'DNS & SSL',
      'trial password OFF (SITE_PASSWORD=off)',
      noAuth.res && noAuth.res.status !== 401 ? 'pass' : 'fail',
      noAuth.res?.status === 401
        ? 'the site still asks for the trial password — ads would land on a login box'
        : (noAuth.error ?? `HTTP ${noAuth.res!.status}`),
    )
  }

  // ── Security headers ───────────────────────────────────────────────────────
  {
    const csp = home.res?.headers.get('content-security-policy') ?? ''
    add(
      'Security',
      'Content-Security-Policy on the shop',
      csp.includes("frame-ancestors 'none'") ? 'pass' : 'fail',
      csp ? `${csp.slice(0, 60)}…` : 'no Content-Security-Policy header',
    )
  }

  // ── Payments ───────────────────────────────────────────────────────────────
  const health = await json<{ status: string; database: string; onlinePayment?: string }>(
    `${api}/api/v1/health`,
  )
  add(
    'Payments',
    'API healthy, database reachable',
    health?.status === 'ok' && health.database === 'up' ? 'pass' : 'fail',
    health ? `status ${health.status}, database ${health.database}` : 'no answer from /health',
  )
  add(
    'Payments',
    'online payment is LIVE (not SSLCommerz sandbox)',
    health?.onlinePayment === 'live' ? 'pass' : 'fail',
    health?.onlinePayment === 'sandbox'
      ? 'sandbox — test money only: set the live credentials + SSLCOMMERZ_IS_LIVE=true'
      : health?.onlinePayment === 'off'
        ? 'off — no SSLCommerz credentials: only cash on delivery works'
        : `unknown (${health?.onlinePayment ?? 'no answer'})`,
  )

  // ── Content ────────────────────────────────────────────────────────────────
  const settings = await json<Record<string, string | null>>(`${api}/api/v1/settings/public`)
  {
    const missing = ['store_email', 'store_phone', 'store_address'].filter((k) => !settings?.[k])
    add(
      'Content',
      'contact details set (email, phone, address)',
      settings && missing.length === 0 ? 'pass' : 'fail',
      !settings
        ? 'could not read the shop settings'
        : missing.length
          ? `empty: ${missing.join(', ')} — Admin → Settings → Store`
          : 'all three set',
    )
  }
  for (const slug of ['privacy', 'terms', 'returns']) {
    const { res } = await get(`${shop}/${slug}`)
    const text = res?.ok ? await res.text() : ''
    add(
      'Content',
      `/${slug} published with real text`,
      res?.ok && !/placeholder/i.test(text) ? 'pass' : 'fail',
      !res
        ? 'no answer'
        : !res.ok
          ? `HTTP ${res.status} — write and publish it in Admin → Content → Pages`
          : /placeholder/i.test(text)
            ? 'still the placeholder text'
            : 'published',
    )
  }
  {
    const bar = await json<{ data: { text?: string } }>(
      `${api}/api/v1/content-blocks/announcement_bar`,
    )
    add(
      'Content',
      'announcement bar set',
      bar?.data.text ? 'pass' : 'warn',
      bar?.data.text
        ? `"${bar.data.text}"`
        : 'off or empty — Admin → Content → Announcement (optional, but the checklist asks for it)',
    )
  }

  // ── SEO ────────────────────────────────────────────────────────────────────
  let productUrl: string | null = null
  {
    const { res } = await get(`${shop}/sitemap.xml`)
    const xml = res?.ok ? await res.text() : ''
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!)
    const foreign = locs.filter((u) => !u.startsWith(`${shop}/`) && u !== shop)
    const leftovers = locs.filter((u) => LEFTOVERS.test(u))
    // A real product (not a leftover demo one) for the structured-data check.
    const products = locs.filter((u) => u.includes('/products/'))
    productUrl = products.find((u) => !LEFTOVERS.test(u)) ?? products[0] ?? null
    add(
      'SEO',
      '/sitemap.xml valid, on this domain',
      xml.includes('<urlset') && locs.length > 0 && foreign.length === 0 ? 'pass' : 'fail',
      !res?.ok
        ? `HTTP ${res?.status ?? 'error'}`
        : foreign.length
          ? `${foreign.length} addresses on another domain, e.g. ${foreign[0]} — NEXT_PUBLIC_SITE_URL`
          : `${locs.length} addresses`,
    )
    add(
      'Content',
      'no demo / test pages left',
      res?.ok && leftovers.length === 0 ? 'pass' : 'fail',
      !res?.ok
        ? 'could not read the sitemap'
        : leftovers.length
          ? `e.g. ${leftovers.slice(0, 3).join(', ')}`
          : 'none in the sitemap',
    )
    add(
      'Content',
      'at least one product for sale',
      productUrl ? 'pass' : 'fail',
      productUrl ?? 'no product in the sitemap',
    )
  }
  {
    const { res } = await get(`${shop}/robots.txt`)
    const txt = res?.ok ? await res.text() : ''
    const blocksAll = /^Disallow:\s*\/\s*$/m.test(txt)
    add(
      'SEO',
      'robots.txt lets Google in and names the sitemap',
      txt.includes(`Sitemap: ${shop}/sitemap.xml`) && !blocksAll ? 'pass' : 'fail',
      blocksAll ? 'Disallow: / — Google is told to stay out' : txt ? 'ok' : 'missing',
    )
  }
  {
    const types = (html: string) =>
      [...html.matchAll(/<script type="application\/ld\+json">([^<]+)<\/script>/g)].flatMap((m) => {
        try {
          const data = JSON.parse(m[1]!) as { '@type'?: string } | { '@type'?: string }[]
          return (Array.isArray(data) ? data : [data]).map((d) => d['@type'] ?? '?')
        } catch {
          return ['(broken JSON)']
        }
      })
    const homeHtml = home.res?.ok ? await home.res.clone().text() : ''
    const product = productUrl ? await get(productUrl) : null
    const productHtml = product?.res?.ok ? await product.res.text() : ''
    const found = [...new Set([...types(homeHtml), ...types(productHtml)])]
    const needed = ['Organization', 'Product', 'BreadcrumbList']
    const missing = needed.filter((t) => !found.includes(t))
    add(
      'SEO',
      'structured data: Organization, Product, BreadcrumbList',
      missing.length === 0 && !found.includes('(broken JSON)') ? 'pass' : 'fail',
      missing.length
        ? `missing: ${missing.join(', ')}`
        : `found: ${found.join(', ')} — also run Google's Rich Results Test on a product page`,
    )
  }

  return results
}
