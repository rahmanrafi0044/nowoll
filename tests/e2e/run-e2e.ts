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
import { type ChildProcess, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'
import {
  ADMIN_PORT,
  ADMIN_URL,
  API_PORT,
  API_URL,
  E2E_DATABASE_URL,
  E2E_PHOTOS_URL,
  SHOP_PORT,
  SHOP_URL,
} from './support/env.js'
import { SHOPPER, STAFF_ACCOUNTS } from './support/fixtures.js'
import { seedE2eDatabase } from './support/seed.js'

const ROOT = path.resolve(import.meta.dirname, '../..')
const API_DIR = path.join(ROOT, 'apps/api')
const SHOP_DIR = path.join(ROOT, 'apps/storefront')
const ADMIN_DIR = path.join(ROOT, 'apps/admin')
const WORKER_DIR = path.join(ROOT, 'workers/notification-worker')
const running: ChildProcess[] = []

// The API gets a complete, explicit environment — nothing from your .env that
// matters: no real SSLCommerz credentials (online payment is "not set up"),
// dummy Supabase values (no images are uploaded in these tests).
const apiEnv = {
  NODE_ENV: 'development',
  PORT: String(API_PORT),
  DATABASE_URL: E2E_DATABASE_URL,
  ALLOWED_ORIGIN: `${SHOP_URL},${ADMIN_URL}`,
  NEXT_PUBLIC_ADMIN_URL: ADMIN_URL,
  API_PUBLIC_URL: API_URL,
  NEXT_PUBLIC_SITE_URL: SHOP_URL,
  // Photos uploaded in the tests stay in memory (apps/api/test/e2e-server.ts) and
  // get addresses on this never-existing domain — nothing reaches Supabase.
  NEXT_PUBLIC_SUPABASE_URL: E2E_PHOTOS_URL,
  SUPABASE_SERVICE_ROLE_KEY: 'e2e-not-a-real-key',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-not-a-real-anon-key',
  // Redis database 15: the browser tests' order jobs never reach a worker
  // you're running for development (which uses database 0).
  REDIS_URL: 'redis://localhost:6379/15',
  SSLCOMMERZ_STORE_ID: '',
  SSLCOMMERZ_STORE_PASSWORD: '',
  // The accounts of the pretend Supabase sign-in (step 50), same ids as seeded.
  E2E_FAKE_ACCOUNTS: JSON.stringify([...STAFF_ACCOUNTS, SHOPPER]),
}
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
const adminEnv = {
  NEXT_PUBLIC_API_URL: API_URL,
  NEXT_PUBLIC_SITE_URL: SHOP_URL,
  NEXT_PUBLIC_ADMIN_URL: ADMIN_URL,
  NEXT_PUBLIC_SUPABASE_URL: E2E_PHOTOS_URL,
  NEXT_DIST_DIR: '.next-e2e',
  NEXT_TELEMETRY_DISABLED: '1',
}
const shopEnv = {
  NEXT_PUBLIC_API_URL: API_URL,
  NEXT_PUBLIC_SITE_URL: SHOP_URL,
  NEXT_PUBLIC_SUPABASE_URL: E2E_PHOTOS_URL, // so next/image accepts the test photos' address
  NEXT_DIST_DIR: '.next-e2e',
  NEXT_TELEMETRY_DISABLED: '1',
}

function start(name: string, cmd: string, args: string[], cwd: string, env: object): ChildProcess {
  // detached: the server gets its own process GROUP, so stopAll() can stop
  // it together with everything it started (pnpm → next start → next-server).
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  const prefix = (chunk: Buffer) =>
    chunk
      .toString()
      .split('\n')
      .filter(Boolean)
      .map((line) => `  [${name}] ${line}`)
      .join('\n')
  // Server output only on failure-ish lines, to keep the test report readable.
  child.stderr?.on('data', (c: Buffer) => console.error(prefix(c)))
  if (process.env.E2E_VERBOSE) child.stdout?.on('data', (c: Buffer) => console.log(prefix(c)))
  running.push(child)
  return child
}

function run(cmd: string, args: string[], cwd: string, env: object = {}): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' })
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

async function waitFor(
  url: string,
  name: string,
  child: ChildProcess,
  seconds = 90,
): Promise<void> {
  for (let i = 0; i < seconds * 2; i++) {
    if (child.exitCode !== null)
      throw new Error(`${name} stopped while starting (exit ${child.exitCode})`)
    try {
      const res = await fetch(url)
      if (res.status < 500) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`${name} did not start within ${seconds}s (${url})`)
}

function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => server.close(() => resolve(true)))
      .listen(port)
  })
}

function stopAll() {
  for (const child of running) {
    if (child.exitCode !== null || child.pid === undefined) continue
    try {
      process.kill(-child.pid, 'SIGTERM') // minus = the whole process group
    } catch {
      // already gone
    }
  }
}
process.on('SIGINT', () => {
  stopAll()
  process.exit(130)
})

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

main()
  .then((code) => {
    stopAll()
    process.exit(code)
  })
  .catch((error: unknown) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
    stopAll()
    process.exit(1)
  })
