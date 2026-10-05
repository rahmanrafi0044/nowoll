// ============================================================================
// pnpm test:e2e — runs the browser tests against the REAL apps.
//
// Why a runner script instead of Playwright's built-in `webServer`: the order
// matters and Playwright can't guarantee it.
//   1. reset + seed the nowoll_e2e database
//   2. start the API (its production build) on :3101
//   3. build the storefront WHILE the API runs — the homepage and product
//      pages are pre-built from real data (SSG/ISR), into .next-e2e
//   4. start the storefront (production server) on :3100
//   5. run Playwright
//   6. stop both servers — always, even after a failure or Ctrl+C
//
// Extra arguments go to Playwright:  pnpm test:e2e -- --project=phone
// E2E_SKIP_BUILD=1 reuses the last storefront build (faster while writing tests).
// ============================================================================
import { type ChildProcess, spawn } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'
import { API_PORT, API_URL, E2E_DATABASE_URL, SHOP_PORT, SHOP_URL } from './support/env.js'
import { seedE2eDatabase } from './support/seed.js'

const ROOT = path.resolve(import.meta.dirname, '../..')
const API_DIR = path.join(ROOT, 'apps/api')
const SHOP_DIR = path.join(ROOT, 'apps/storefront')
const running: ChildProcess[] = []

// The API gets a complete, explicit environment — nothing from your .env that
// matters: no real SSLCommerz credentials (online payment is "not set up"),
// dummy Supabase values (no images are uploaded in these tests).
const apiEnv = {
  NODE_ENV: 'development',
  PORT: String(API_PORT),
  DATABASE_URL: E2E_DATABASE_URL,
  ALLOWED_ORIGIN: SHOP_URL,
  API_PUBLIC_URL: API_URL,
  NEXT_PUBLIC_SITE_URL: SHOP_URL,
  NEXT_PUBLIC_SUPABASE_URL: 'https://e2e-project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'e2e-not-a-real-key',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'e2e-not-a-real-anon-key',
  SSLCOMMERZ_STORE_ID: '',
  SSLCOMMERZ_STORE_PASSWORD: '',
}
const shopEnv = {
  NEXT_PUBLIC_API_URL: API_URL,
  NEXT_PUBLIC_SITE_URL: SHOP_URL,
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
  for (const port of [API_PORT, SHOP_PORT]) {
    if (!(await portFree(port)))
      throw new Error(`Port ${port} is busy — is an earlier test run still going?`)
  }

  console.log('▸ Preparing the nowoll_e2e database…')
  await seedE2eDatabase()

  console.log('▸ Starting the API (production build)…')
  const api = start('api', 'node', ['dist/main.js'], API_DIR, apiEnv)
  await waitFor(`${API_URL}/api/v1/health`, 'API', api)

  if (process.env.E2E_SKIP_BUILD) {
    console.log('▸ Reusing the last storefront build (E2E_SKIP_BUILD)')
  } else {
    console.log('▸ Building the storefront against the e2e API (a few minutes)…')
    const code = await run('pnpm', ['exec', 'next', 'build'], SHOP_DIR, shopEnv)
    if (code !== 0) throw new Error('Storefront build failed')
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
