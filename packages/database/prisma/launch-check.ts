// ============================================================================
// The database half of the launch check (step 54, docs/launch-checklist.md).
// GitHub → Actions → "Database tasks" → launch-check (production): it only
// READS — SELECTs, nothing is changed — and prints counts, never customer data.
//
// Two parts, so the rules can be tested without a database:
//   gatherFacts(db)  — the read-only queries
//   judge(facts)     — pure: facts → ✅ / ❌ / ⚠️ per checklist item
// ============================================================================
import { readdirSync } from 'node:fs'
import path from 'node:path'
import type { PrismaClient } from '../src/generated/prisma/client'

export interface DbFacts {
  /** Migration folders in git that the database hasn't applied. */
  pendingMigrations: string[]
  /** Our tables without row-level security (the anon key could read them). */
  tablesWithoutRls: string[]
  tableCount: number
  /** null = no Supabase storage on this database (e.g. local Postgres). */
  bucket: { exists: boolean; public: boolean } | null
  activeProducts: number
  activeWithoutPhoto: number
  photosWithoutAlt: number
  /** Products whose address says demo / test (from the dev or test data). */
  demoProducts: number
  admins: number
}

export type Status = 'pass' | 'fail' | 'warn'
export interface DbCheck {
  item: string
  status: Status
  detail: string
}

const MIGRATIONS_DIR = path.join(__dirname, 'migrations')
const DEMO_SLUGS = ['demo-%', 'e2e-%', 'perf-%']

export async function gatherFacts(db: PrismaClient): Promise<DbFacts> {
  const inGit = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
  const applied = await db.$queryRaw<{ migration_name: string }[]>`
    SELECT migration_name FROM _prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`
  const done = new Set(applied.map((m) => m.migration_name))

  const tables = await db.$queryRaw<{ name: string; rls: boolean }[]>`
    SELECT c.relname AS name, c.relrowsecurity AS rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> '_prisma_migrations'`

  // Supabase keeps its storage buckets in the storage schema (absent locally).
  const hasStorage = await db.$queryRaw<{ ok: boolean }[]>`
    SELECT to_regclass('storage.buckets') IS NOT NULL AS ok`
  let bucket: DbFacts['bucket'] = null
  if (hasStorage[0]?.ok) {
    const rows = await db.$queryRaw<{ public: boolean }[]>`
      SELECT public FROM storage.buckets WHERE id = 'product-images'`
    bucket = { exists: rows.length > 0, public: rows[0]?.public ?? false }
  }

  const [counts] = await db.$queryRaw<
    {
      active: bigint
      without_photo: bigint
      without_alt: bigint
      demo: bigint
      admins: bigint
    }[]
  >`
    SELECT
      (SELECT count(*) FROM products WHERE status = 'ACTIVE' AND deleted_at IS NULL) AS active,
      (SELECT count(*) FROM products p WHERE p.status = 'ACTIVE' AND p.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)) AS without_photo,
      (SELECT count(*) FROM product_images i JOIN products p ON p.id = i.product_id
         WHERE p.deleted_at IS NULL AND btrim(i.alt_text) = '') AS without_alt,
      (SELECT count(*) FROM products WHERE deleted_at IS NULL
         AND slug LIKE ANY (${DEMO_SLUGS})) AS demo,
      (SELECT count(*) FROM users WHERE role = 'ADMIN' AND deleted_at IS NULL) AS admins`

  return {
    pendingMigrations: inGit.filter((m) => !done.has(m)).sort(),
    tablesWithoutRls: tables
      .filter((t) => !t.rls)
      .map((t) => t.name)
      .sort(),
    tableCount: tables.length,
    bucket,
    activeProducts: Number(counts!.active),
    activeWithoutPhoto: Number(counts!.without_photo),
    photosWithoutAlt: Number(counts!.without_alt),
    demoProducts: Number(counts!.demo),
    admins: Number(counts!.admins),
  }
}

export function judge(f: DbFacts): DbCheck[] {
  const checks: DbCheck[] = []
  const add = (item: string, ok: boolean, detail: string, softly = false) =>
    checks.push({ item, status: ok ? 'pass' : softly ? 'warn' : 'fail', detail })

  add(
    'all database changes (migrations) applied',
    f.pendingMigrations.length === 0,
    f.pendingMigrations.length
      ? `not applied: ${f.pendingMigrations.join(', ')} — Database tasks → migrate`
      : 'up to date',
  )
  add(
    'row-level security on every table',
    f.tablesWithoutRls.length === 0 && f.tableCount > 0,
    f.tablesWithoutRls.length
      ? `without RLS: ${f.tablesWithoutRls.join(', ')}`
      : `${f.tableCount} tables, all with RLS (no policies: only the API's server key gets in)`,
  )
  add(
    'photo bucket "product-images" exists and is public',
    !!f.bucket?.exists && f.bucket.public,
    !f.bucket
      ? 'no Supabase storage here (not a Supabase database?)'
      : !f.bucket.exists
        ? 'missing — docs/integrations/supabase.md (bucket setup)'
        : f.bucket.public
          ? 'ok'
          : 'exists but not public — customers would not see the photos',
  )
  add('products for sale', f.activeProducts > 0, `${f.activeProducts} active`)
  add(
    'every product for sale has a photo',
    f.activeWithoutPhoto === 0,
    f.activeWithoutPhoto ? `${f.activeWithoutPhoto} without a photo` : 'yes',
  )
  add(
    'every photo has alt text',
    f.photosWithoutAlt === 0,
    f.photosWithoutAlt ? `${f.photosWithoutAlt} photos with empty alt text` : 'yes',
  )
  add(
    'no demo / test products',
    f.demoProducts === 0,
    f.demoProducts ? `${f.demoProducts} (address starts with demo-, e2e- or perf-)` : 'none',
  )
  add('an Admin account exists', f.admins > 0, `${f.admins} Admin account(s)`)
  return checks
}
