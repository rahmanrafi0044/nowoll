// ============================================================================
// pnpm lighthouse — the speed audit (step 51, docs/performance.md).
//
// Lighthouse is Google's page-speed test (the one in Chrome's DevTools). In
// its default MOBILE mode it pretends to be a mid-range phone on slow 4G, so
// the score is close to what an ad visitor in Bangladesh feels. Goal: ≥ 90 on
// the homepage, the shop listing, a category page and a product page.
//
// Two ways to run it:
//   pnpm lighthouse
//       Builds and starts the REAL shop + API (production builds) on this PC
//       with a launch-sized catalogue (support/launch-catalogue.ts: 100
//       products with photo-weight images), then measures it. Repeatable.
//   pnpm lighthouse -- --url https://nowoll.com [--auth user:password]
//       Measures a running site instead (e.g. the trial behind its password,
//       through Cloudflare). Nothing is started.
// Options: --category /shop/x and --product /products/y (default: the
// sitemap's first; locally a full launch category), --runs 3 (each page is measured this many times; the middle score
// is kept, because single runs wobble), --skip-build (reuse the last build).
//
// Full reports (open in a browser) land in tests/e2e/lighthouse-report/.
// ============================================================================
/* eslint-disable no-console -- command-line script: it reports by printing */
import { mkdirSync, writeFileSync } from 'node:fs'
import { type AddressInfo, createServer } from 'node:net'
import path from 'node:path'
import { chromium } from '@playwright/test'
import lighthouse from 'lighthouse'
import { API_PORT, API_URL, SHOP_PORT, SHOP_URL } from './support/env.js'
import { LAUNCH_CATEGORY, seedLaunchCatalogue } from './support/launch-catalogue.js'
import { seedE2eDatabase } from './support/seed.js'
import {
  API_DIR,
  SHOP_DIR,
  apiEnv,
  clearShopDataCache,
  portFree,
  run,
  runMain,
  shopEnv,
  start,
  waitFor,
} from './support/servers.js'

const TARGET_SCORE = 90
/** Lighthouse's PC-speed number below which scores aren't trustworthy (this PC: ~2000–2400 when quiet). */
const BUSY_PC_SPEED = 1800
const REPORT_DIR = path.join(import.meta.dirname, 'lighthouse-report')

function option(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}
const flag = (name: string) => process.argv.includes(`--${name}`)

/** The pages to measure: fixed ones + the first category and product in the sitemap. */
async function pagesOf(
  base: string,
  headers: Record<string, string>,
  pick: { category?: string; product?: string },
) {
  const res = await fetch(`${base}/sitemap.xml`, { headers })
  if (!res.ok) throw new Error(`No sitemap at ${base}/sitemap.xml (${res.status})`)
  const urls = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (m) => new URL(m[1]!).pathname,
  )
  // --category / --product pick specific pages; otherwise the sitemap's first.
  const category =
    option('category') ?? pick.category ?? urls.find((u) => /^\/shop\/[^/]+$/.test(u))
  const product = option('product') ?? pick.product ?? urls.find((u) => u.startsWith('/products/'))
  if (!category || !product) throw new Error('The sitemap lists no category or no product')
  return [
    { name: 'Homepage', path: '/' },
    { name: 'Shop (all products)', path: '/shop' },
    { name: 'Category', path: category },
    { name: 'Product', path: product },
  ]
}

interface Result {
  score: number
  lcp: number
  tbt: number
  cls: number
  fcp: number
  kb: number
  pcSpeed: number
  html: string
}

async function measure(url: string, port: number, headers: Record<string, string>) {
  const result = await lighthouse(url, {
    port,
    output: 'html',
    logLevel: 'error',
    onlyCategories: ['performance'],
    extraHeaders: headers,
  })
  if (!result) throw new Error(`Lighthouse returned nothing for ${url}`)
  const { lhr } = result
  if (lhr.runtimeError) throw new Error(`${url}: ${lhr.runtimeError.message}`)
  const audit = (id: string) => lhr.audits[id]?.numericValue ?? NaN
  return {
    score: Math.round((lhr.categories.performance?.score ?? 0) * 100),
    lcp: audit('largest-contentful-paint'),
    tbt: audit('total-blocking-time'),
    cls: audit('cumulative-layout-shift'),
    fcp: audit('first-contentful-paint'),
    kb: audit('total-byte-weight') / 1024,
    // Lighthouse's own speed test of this PC during the run. If it varies a
    // lot between pages, the PC was busy and the scores aren't comparable.
    pcSpeed: Math.round(lhr.environment.benchmarkIndex),
    html: result.report as string,
  } satisfies Result
}

/** A free port for Chrome's debugging connection. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
      .once('error', reject)
      .listen(0, () => {
        const { port } = server.address() as AddressInfo
        server.close(() => resolve(port))
      })
  })
}

async function startLocalShop(): Promise<string> {
  for (const port of [API_PORT, SHOP_PORT])
    if (!(await portFree(port)))
      throw new Error(`Port ${port} is busy — are the browser tests running?`)

  console.log('▸ Preparing the database + a launch-sized catalogue (100 products, photos)…')
  await seedE2eDatabase()
  await seedLaunchCatalogue()

  console.log('▸ Starting the API (production build)…')
  const api = start('api', 'node', ['--import', 'tsx/esm', 'test/e2e-server.ts'], API_DIR, apiEnv)
  await waitFor(`${API_URL}/api/v1/health`, 'API', api)

  if (!flag('skip-build')) {
    console.log('▸ Building the storefront (a few minutes)…')
    if ((await run('pnpm', ['exec', 'next', 'build'], SHOP_DIR, shopEnv)) !== 0)
      throw new Error('Storefront build failed')
  }
  clearShopDataCache()
  console.log('▸ Starting the storefront…')
  const shop = start(
    'shop',
    'pnpm',
    ['exec', 'next', 'start', '--port', String(SHOP_PORT)],
    SHOP_DIR,
    shopEnv,
  )
  await waitFor(SHOP_URL, 'Storefront', shop)
  return SHOP_URL
}

async function main(): Promise<number> {
  const local = !option('url')
  const base = (option('url') ?? (await startLocalShop())).replace(/\/$/, '')
  // Locally, measure a full category of the launch catalogue (25 products),
  // not the browser tests' one-product category.
  const pick = local
    ? { category: `/shop/${LAUNCH_CATEGORY}`, product: `/products/${LAUNCH_CATEGORY}-1` }
    : {}
  const auth = option('auth')
  const headers: Record<string, string> = auth
    ? { Authorization: `Basic ${Buffer.from(auth).toString('base64')}` }
    : {}
  const runs = Number(option('runs') ?? 3)
  const pages = await pagesOf(base, headers, pick)

  // Chrome is started by Playwright (already installed for the browser tests),
  // with its debugging port open for Lighthouse to drive. (Google's own
  // chrome-launcher assumes WSL means Windows Chrome and makes "C:\Users\…"
  // folders here — Playwright keeps its temporary profile in Linux's /tmp.)
  // channel 'chromium' = the full Chrome in new headless mode, which Lighthouse needs.
  const port = await freePort()
  const chrome = await chromium.launch({
    channel: 'chromium',
    args: [`--remote-debugging-port=${port}`],
  })
  mkdirSync(REPORT_DIR, { recursive: true })
  const rows: (Omit<Result, 'html'> & { name: string; path: string })[] = []
  try {
    // Warm-up: one unmeasured visit per page, in a real browser. The first
    // visit after a deploy builds the page and resizes its photos (the server
    // works hard for a moment); every later visitor gets them ready. Measure
    // what most visitors get — and keep that resizing from slowing this PC
    // while Chrome is being timed.
    for (const page of pages) {
      process.stdout.write(`▸ Warming up ${page.path}…\r`)
      await measure(base + page.path, port, headers)
    }
    for (const page of pages) {
      const results: Result[] = []
      for (let i = 0; i < runs; i++) {
        process.stdout.write(`▸ ${page.name} (${page.path}) — run ${i + 1}/${runs}\r`)
        results.push(await measure(base + page.path, port, headers))
      }
      results.sort((a, b) => a.score - b.score)
      const middle = results[Math.floor(results.length / 2)]!
      const file = `${page.name.replace(/\W+/g, '-').toLowerCase()}.html`
      writeFileSync(path.join(REPORT_DIR, file), middle.html)
      rows.push({ name: page.name, path: page.path, ...middle })
    }
  } finally {
    await chrome.close()
  }

  console.log(`\nLighthouse, mobile (${base}, middle of ${runs} runs):\n`)
  console.table(
    rows.map((r) => ({
      Page: r.name,
      Score: r.score,
      'Main content (LCP)': `${(r.lcp / 1000).toFixed(1)} s`,
      'First paint (FCP)': `${(r.fcp / 1000).toFixed(1)} s`,
      'Frozen (TBT)': `${Math.round(r.tbt)} ms`,
      'Layout shift (CLS)': r.cls.toFixed(3),
      Download: `${Math.round(r.kb)} KB`,
      'PC speed': r.pcSpeed,
    })),
  )
  console.log(`Full reports: ${REPORT_DIR}/`)
  // A busy PC (other programs, low memory → swapping) makes the "frozen" time
  // and the score jump by 20+ points. Lighthouse's PC-speed number shows it.
  const slowest = Math.min(...rows.map((r) => r.pcSpeed))
  if (slowest < BUSY_PC_SPEED)
    console.log(
      `⚠ The PC was busy (speed ${slowest} < ${BUSY_PC_SPEED}): these scores are not reliable.\n` +
        '  Close other programs (and the trial site: infrastructure/preview/preview.sh down), then run again.',
    )
  const below = rows.filter((r) => r.score < TARGET_SCORE)
  if (below.length) {
    console.log(`✗ Below ${TARGET_SCORE}: ${below.map((r) => r.name).join(', ')}`)
    return 1
  }
  console.log(`✓ Every page scores ${TARGET_SCORE} or more`)
  return 0
}

runMain(main)
