// Runs ONCE before all API tests: makes sure the nowoll_test database exists
// and has every migration applied (exactly like production's `migrate deploy`).
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createPrismaClient } from '@nowoll/database'
import { TEST_DATABASE_URL } from './utils/test-db.js'

export default async function setup(): Promise<void> {
  const url = new URL(TEST_DATABASE_URL)
  const dbName = url.pathname.slice(1)
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `Refusing to run tests against "${dbName}" — the test database name must end in _test.`,
    )
  }

  // Connect to the built-in "postgres" database to create nowoll_test if needed.
  const adminUrl = new URL(TEST_DATABASE_URL)
  adminUrl.pathname = '/postgres'
  const admin = createPrismaClient(adminUrl.toString())
  try {
    const existing = await admin.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${dbName}`
    if (existing.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)
    }
  } catch (error) {
    throw new Error(
      `Cannot reach the test database at ${url.host}. Is Docker running? Try: docker compose up -d\n${String(error)}`,
    )
  } finally {
    await admin.$disconnect()
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(import.meta.dirname, '../../../packages/database'),
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: 'pipe',
  })
}
