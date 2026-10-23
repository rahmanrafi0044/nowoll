// ============================================================================
// pnpm design-preview — the real shop + admin on this PC with the stand-in
// women's catalogue (support/launch-catalogue.ts), to LOOK at a design change
// (38f) before it goes anywhere. Production builds, like the browser tests.
// The root command (`pnpm design-preview`) builds the API first, as `pnpm
// test:e2e` does — the API server runs its compiled copy (apps/api/dist).
//
//   shop   http://localhost:3100      admin  http://localhost:3102/admin/login
//   (admin sign-in: the browser tests' pretend accounts — support/fixtures.ts)
//
// Options: --skip-build (reuse the last ADMIN build — the shop is always rebuilt,
// see below). Stop with Ctrl+C: everything
// it started stops with it. The e2e database is wiped and re-filled each run.
// ============================================================================
/* eslint-disable no-console -- command-line script: it reports by printing */
import { ADMIN_PORT, ADMIN_URL, API_PORT, API_URL, SHOP_PORT, SHOP_URL } from './support/env.js'
import { seedLaunchCatalogue } from './support/launch-catalogue.js'
import { seedE2eDatabase } from './support/seed.js'
import {
  ADMIN_DIR,
  API_DIR,
  SHOP_DIR,
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

const skipBuild = process.argv.includes('--skip-build')

async function main(): Promise<number> {
  for (const port of [API_PORT, SHOP_PORT, ADMIN_PORT])
    if (!(await portFree(port)))
      throw new Error(`Port ${port} is busy — are the browser tests or a preview running?`)

  console.log('▸ Preparing the database + the stand-in women’s catalogue…')
  await seedE2eDatabase()
  await seedLaunchCatalogue()

  console.log('▸ Starting the API…')
  const api = start('api', 'node', ['--import', 'tsx/esm', 'test/e2e-server.ts'], API_DIR, apiEnv)
  await waitFor(`${API_URL}/api/v1/health`, 'API', api)

  // The shop is ALWAYS rebuilt: the database was just refilled, so every size
  // has a NEW id — and the shop's saved (pre-built) product pages hold the old
  // ones. Reusing them gave "No longer available" in the bag and a "Notify me"
  // that couldn't find the size. (The admin draws its pages in the browser
  // from fresh data, so its build can be reused.)
  console.log('▸ Building the shop (a few minutes)…')
  if ((await run('pnpm', ['exec', 'next', 'build'], SHOP_DIR, shopEnv)) !== 0)
    throw new Error('Storefront build failed')
  if (!skipBuild) {
    console.log('▸ Building the admin panel…')
    if ((await run('pnpm', ['exec', 'next', 'build'], ADMIN_DIR, adminEnv)) !== 0)
      throw new Error('Admin build failed')
  }
  clearShopDataCache()
  const shop = start(
    'shop',
    'pnpm',
    ['exec', 'next', 'start', '--port', String(SHOP_PORT)],
    SHOP_DIR,
    shopEnv,
  )
  const admin = start(
    'admin',
    'pnpm',
    ['exec', 'next', 'start', '--port', String(ADMIN_PORT)],
    ADMIN_DIR,
    adminEnv,
  )
  await waitFor(SHOP_URL, 'Storefront', shop)
  await waitFor(`${ADMIN_URL}/admin/login`, 'Admin', admin)

  console.log(
    `\n✓ Shop:  ${SHOP_URL}\n✓ Admin: ${ADMIN_URL}/admin/login\n` +
      `  Ctrl+C to stop (or from another terminal: kill -INT ${process.pid}).`,
  )
  // Keep running until Ctrl+C (runMain stops every server then).
  await new Promise(() => {})
  return 0
}

runMain(main)
