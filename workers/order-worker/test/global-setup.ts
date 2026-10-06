// Creates + migrates nowoll_worker_test once before the worker's tests
// (same steps as the API's test/global-setup.ts, its own database).
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createPrismaClient } from '@nowoll/database'
import { TEST_DATABASE_URL } from './test-db-url.js'

export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL)
  const dbName = url.pathname.slice(1)
  if (!dbName.endsWith('_test'))
    throw new Error(`Refusing to use "${dbName}" for tests — the name must end in _test.`)
  const adminUrl = new URL(url)
  adminUrl.pathname = '/postgres'
  const admin = createPrismaClient(adminUrl.toString())
  try {
    const exists = await admin.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${dbName}`
    if (exists.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)
  } finally {
    await admin.$disconnect()
  }
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(import.meta.dirname, '../../../packages/database'),
    env: { ...process.env, DATABASE_URL: url.toString() },
    stdio: 'pipe',
  })
}
