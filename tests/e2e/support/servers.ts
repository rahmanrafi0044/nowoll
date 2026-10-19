// ============================================================================
// Starting and stopping the real apps — shared by the browser tests
// (run-e2e.ts) and the speed audit (run-lighthouse.ts), so both run the shop
// exactly the same way.
// ============================================================================
/* eslint-disable no-console -- command-line script: it reports by printing */
import { type ChildProcess, spawn } from 'node:child_process'
import { rmSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import { ADMIN_URL, API_PORT, API_URL, E2E_DATABASE_URL, E2E_PHOTOS_URL, SHOP_URL } from './env.js'
import { SHOPPER, STAFF_ACCOUNTS } from './fixtures.js'

export const ROOT = path.resolve(import.meta.dirname, '../../..')
export const API_DIR = path.join(ROOT, 'apps/api')
export const SHOP_DIR = path.join(ROOT, 'apps/storefront')
export const ADMIN_DIR = path.join(ROOT, 'apps/admin')
export const WORKER_DIR = path.join(ROOT, 'workers/notification-worker')

const running: ChildProcess[] = []

// The API gets a complete, explicit environment — nothing from your .env that
// matters: no real SSLCommerz credentials (online payment is "not set up"),
// dummy Supabase values (no images are uploaded in these tests).
export const apiEnv = {
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
/** Environment of the shop's production build: points at the e2e API. */
export const shopEnv = {
  NEXT_PUBLIC_API_URL: API_URL,
  NEXT_PUBLIC_SITE_URL: SHOP_URL,
  NEXT_PUBLIC_SUPABASE_URL: E2E_PHOTOS_URL, // so next/image accepts the test photos' address
  NEXT_DIST_DIR: '.next-e2e',
  NEXT_TELEMETRY_DISABLED: '1',
}

export const adminEnv = {
  NEXT_PUBLIC_API_URL: API_URL,
  NEXT_PUBLIC_SITE_URL: SHOP_URL,
  NEXT_PUBLIC_ADMIN_URL: ADMIN_URL,
  NEXT_PUBLIC_SUPABASE_URL: E2E_PHOTOS_URL,
  NEXT_DIST_DIR: '.next-e2e',
  NEXT_TELEMETRY_DISABLED: '1',
}

/**
 * Forget the shop's saved API answers (Next.js keeps them on disk in
 * .next-e2e/cache/fetch-cache, even across builds). Every run starts with a
 * fresh database, so an answer from an earlier run — e.g. "this product
 * doesn't exist" — must not be served once more (it was: a flaky
 * admin-product test). CI always starts empty; now this PC does too.
 */
export function clearShopDataCache(): void {
  rmSync(path.join(SHOP_DIR, shopEnv.NEXT_DIST_DIR, 'cache/fetch-cache'), {
    recursive: true,
    force: true,
  })
}

/** Starts a long-running server; stopAll() stops it (and everything it started). */
export function start(
  name: string,
  cmd: string,
  args: string[],
  cwd: string,
  env: object,
): ChildProcess {
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
  // Server output only on failure-ish lines, to keep the report readable.
  child.stderr?.on('data', (c: Buffer) => console.error(prefix(c)))
  if (process.env.E2E_VERBOSE) child.stdout?.on('data', (c: Buffer) => console.log(prefix(c)))
  running.push(child)
  return child
}

/** Runs a command to the end; resolves with its exit code. */
export function run(cmd: string, args: string[], cwd: string, env: object = {}): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' })
    child.on('exit', (code) => resolve(code ?? 1))
  })
}

export async function waitFor(
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

export function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => server.close(() => resolve(true)))
      .listen(port)
  })
}

export function stopAll(): void {
  for (const child of running) {
    if (child.exitCode !== null || child.pid === undefined) continue
    try {
      process.kill(-child.pid, 'SIGTERM') // minus = the whole process group
    } catch {
      // already gone
    }
  }
}

/** Runs main(), then always stops every server — even after a failure or Ctrl+C. */
export function runMain(main: () => Promise<number>): void {
  process.on('SIGINT', () => {
    stopAll()
    process.exit(130)
  })
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
}
