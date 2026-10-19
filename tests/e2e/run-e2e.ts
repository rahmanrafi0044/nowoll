// ============================================================================
// pnpm test:e2e — runs the browser tests against the REAL apps.
//
// Why a runner script instead of Playwright's built-in `webServer`: the order
// matters and Playwright can't guarantee it.
//   1. reset + seed the nowoll_e2e database
//   2. start the API (its production build) on :3101 — with a pretend Supabase
//      sign-in (apps/api/test/e2e-server.ts) so tests can use the admin panel
//   3. start the notification worker (emails go to Mailpit)
//   4. build the storefront WHILE the API runs — the homepage and product
//      pages are pre-built from real data (SSG/ISR), into .next-e2e
//   5. start the storefront (production server) on :3100
//   6. build + start the admin panel on :3102 (also into .next-e2e)
//   7. run Playwright
//   8. stop every server — always, even after a failure or Ctrl+C
//
// Extra arguments go to Playwright:  pnpm test:e2e -- --project=phone
// E2E_SKIP_BUILD=1 reuses the last storefront build (faster while writing tests).
// ============================================================================
import {
  ADMIN_PORT,
  ADMIN_URL,
  API_PORT,
  API_URL,
  E2E_DATABASE_URL,
  SHOP_PORT,
  SHOP_URL,
} from './support/env.js'
import { seedE2eDatabase } from './support/seed.js'
import {
  ADMIN_DIR,
  API_DIR,
  SHOP_DIR,
  WORKER_DIR,
  adminEnv,
  apiEnv,
  clearShopDataCache,
  portFree,
  run,
  runMain,
  shopEnv,
  start,
  waitFor,
} from './support/servers.js'

// The notification worker sends to Mailpit over SMTP (never Resend), using
// the same Redis database (15) as the e2e API.
const workerEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: E2E_DATABASE_URL,
  REDIS_URL: 'redis://localhost:6379/15',
  NEXT_PUBLIC_SITE_URL: SHOP_URL,
  EMAIL_FROM: 'Nowoll <orders@e2e.test>',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '1025',
}
async function main(): Promise<number> {
  for (const port of [API_PORT, SHOP_PORT, ADMIN_PORT]) {
    if (!(await portFree(port)))
      throw new Error(`Port ${port} is busy — is an earlier test run still going?`)
  }

  console.log('▸ Preparing the nowoll_e2e database…')
  await seedE2eDatabase()

  console.log('▸ Starting the API (production build, pretend sign-in)…')
  // tsx/esm, not plain tsx: plain tsx also hooks require(), which loaded NestJS a
  // second time beside the built app ("Nest can't resolve … Reflector").
  const api = start('api', 'node', ['--import', 'tsx/esm', 'test/e2e-server.ts'], API_DIR, apiEnv)
  await waitFor(`${API_URL}/api/v1/health`, 'API', api)

  console.log('▸ Starting the notification worker (emails → Mailpit)…')
  start('worker', 'node', ['dist/main.js'], WORKER_DIR, workerEnv)

  if (process.env.E2E_SKIP_BUILD) {
    console.log('▸ Reusing the last storefront and admin builds (E2E_SKIP_BUILD)')
  } else {
    console.log('▸ Building the storefront against the e2e API (a few minutes)…')
    const code = await run('pnpm', ['exec', 'next', 'build'], SHOP_DIR, shopEnv)
    if (code !== 0) throw new Error('Storefront build failed')
    console.log('▸ Building the admin panel…')
    const adminCode = await run('pnpm', ['exec', 'next', 'build'], ADMIN_DIR, adminEnv)
    if (adminCode !== 0) throw new Error('Admin build failed')
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

  console.log('▸ Starting the admin panel…')
  const admin = start(
    'admin',
    'pnpm',
    ['exec', 'next', 'start', '--port', String(ADMIN_PORT)],
    ADMIN_DIR,
    adminEnv,
  )
  await waitFor(`${ADMIN_URL}/admin/login`, 'Admin', admin)

  console.log('▸ Running the browser tests…')
  // (pnpm passes its "--" separator through; Playwright would read it as "no more options")
  const args = process.argv.slice(2).filter((a, i) => !(i === 0 && a === '--'))
  return run('pnpm', ['exec', 'playwright', 'test', ...args], import.meta.dirname)
}

runMain(main)
