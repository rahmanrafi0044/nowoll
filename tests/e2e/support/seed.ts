// Prepares nowoll_e2e: creates it if needed, applies every migration (like
// production's `migrate deploy`), wipes it, then adds the standard settings
// and delivery zones (the real seed) plus the fixed catalogue in fixtures.ts.
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { createPrismaClient, Prisma } from '@nowoll/database'
import { E2E_DATABASE_URL } from './env.js'
import { BLOG_POST, CATEGORY, DISCOUNT, SHIRT, TRACKING } from './fixtures.js'

const DATABASE_PACKAGE = path.resolve(import.meta.dirname, '../../../packages/database')

export async function seedE2eDatabase(): Promise<void> {
  const url = new URL(E2E_DATABASE_URL)
  const dbName = url.pathname.slice(1)
  // SAFETY: this wipes the database — only ever a local one whose name ends in _e2e.
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !dbName.endsWith('_e2e')) {
    throw new Error(`Refusing to wipe "${url.hostname}/${dbName}": must be a local *_e2e database.`)
  }

  const adminUrl = new URL(E2E_DATABASE_URL)
  adminUrl.pathname = '/postgres'
  const admin = createPrismaClient(adminUrl.toString())
  try {
    const exists = await admin.$queryRaw<
      unknown[]
    >`SELECT 1 FROM pg_database WHERE datname = ${dbName}`
    if (exists.length === 0) await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName}"`)
  } catch (error) {
    throw new Error(
      `Cannot reach Postgres at ${url.host}. Is Docker running? (docker compose up -d)\n${String(error)}`,
    )
  } finally {
    await admin.$disconnect()
  }

  const env = { ...process.env, DATABASE_URL: E2E_DATABASE_URL }
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: DATABASE_PACKAGE,
    env,
    stdio: 'pipe',
  })

  const prisma = createPrismaClient(E2E_DATABASE_URL)
  try {
    const tables = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
    const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ')
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
  } finally {
    await prisma.$disconnect()
  }

  // The real seed: settings (VAT, payment timeout, …), delivery zones, pages, content blocks.
  execFileSync('pnpm', ['exec', 'prisma', 'db', 'seed'], {
    cwd: DATABASE_PACKAGE,
    env,
    stdio: 'pipe',
  })

  const db = createPrismaClient(E2E_DATABASE_URL)
  try {
    // Tracking IDs (step 39a), so the cookie banner and the consent rules are tested for real.
    for (const [key, value] of [
      ['ga4_measurement_id', TRACKING.ga4],
      ['meta_pixel_id', TRACKING.pixel],
      ['newsletter_checkout_optin', true], // step 42: the "email me" box at checkout
    ] as const)
      await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
    const category = await db.category.create({
      data: { id: CATEGORY.id, name: CATEGORY.name, slug: CATEGORY.slug },
    })
    await db.product.create({
      data: {
        id: SHIRT.id,
        name: SHIRT.name,
        slug: SHIRT.slug,
        categoryId: category.id,
        basePrice: new Prisma.Decimal(SHIRT.price),
        status: 'ACTIVE',
        isFeatured: true,
        description: 'A crisp everyday shirt in breathable cotton oxford.',
        variants: {
          create: Object.entries(SHIRT.sizes).map(([size, sku], i) => ({
            id: SHIRT.variantIds[size as keyof typeof SHIRT.variantIds],
            sku,
            size,
            color: SHIRT.color,
            colorHex: '#3b5b8c',
            stock: size === SHIRT.soldOutSize ? 0 : SHIRT.stock,
            sortOrder: i,
          })),
        },
      },
    })
    await db.discountCode.create({
      data: {
        code: DISCOUNT.code,
        type: 'PERCENTAGE',
        value: new Prisma.Decimal(DISCOUNT.percent),
      },
    })
    // Step 43: one live blog post, with the shirt as "Shop the look".
    await db.blogPost.create({
      data: {
        title: BLOG_POST.title,
        slug: BLOG_POST.slug,
        excerpt: 'How to wear the oxford shirt three ways.',
        content: '## Three ways\n\nWith chinos, with jeans, or under a blazer.',
        tags: ['styling'],
        status: 'PUBLISHED',
        publishedAt: new Date(Date.now() - 24 * 3600_000),
        products: { create: { productId: SHIRT.id } },
      },
    })
  } finally {
    await db.$disconnect()
  }
}
