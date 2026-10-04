// ============================================================================
// A SEPARATE database just for tests: nowoll_test (same Docker Postgres).
// Tests wipe tables between runs, so they must NEVER point at nowoll_dev,
// where your seeded settings and manual test data live.
// ============================================================================
import { createPrismaClient } from '@nowoll/database'

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://nowoll:nowoll_local_password@localhost:5432/nowoll_test'

let client: ReturnType<typeof createPrismaClient> | undefined

/** One shared Prisma client for test files to set up and inspect data. */
export function testPrisma() {
  client ??= createPrismaClient(TEST_DATABASE_URL)
  return client
}

/** Empties every table (keeps the schema and migration history). Call in beforeEach. */
export async function resetDatabase(): Promise<void> {
  const prisma = testPrisma()
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (tables.length === 0) return
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ')
  // CASCADE follows foreign keys; RESTART IDENTITY resets counters like order_number.
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
}
