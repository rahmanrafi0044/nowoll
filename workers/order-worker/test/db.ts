import { randomUUID } from 'node:crypto'
import { createPrismaClient, Prisma } from '@nowoll/database'
import { TEST_DATABASE_URL } from './test-db-url.js'

export const db = createPrismaClient(TEST_DATABASE_URL)

export async function resetDatabase() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (tables.length)
    await db.$executeRawUnsafe(
      `TRUNCATE TABLE ${tables.map((t) => `"public"."${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    )
}

/** An order as the API would have saved it (2 shirts, ৳60 delivery, 10% off). */
export async function makeOrder(
  opts: {
    paymentMethod?: 'COD' | 'SSLCOMMERZ'
    paymentStatus?: 'PENDING' | 'PAID' | 'UNDER_REVIEW'
    signedIn?: boolean
  } = {},
) {
  const user = opts.signedIn
    ? await db.user.create({ data: { id: randomUUID(), email: `u${randomUUID()}@example.com` } })
    : null
  return db.order.create({
    data: {
      userId: user?.id ?? null,
      paymentMethod: opts.paymentMethod ?? 'COD',
      paymentStatus: opts.paymentStatus ?? 'PENDING',
      email: 'rafi@example.com',
      phone: '+8801712345678',
      customerName: 'Rafi Rahman',
      shippingAddressLine1: 'House 12, Road 5',
      shippingArea: 'Dhanmondi',
      shippingDistrict: 'Dhaka',
      shippingDivision: 'Dhaka',
      shippingZoneName: 'Inside Dhaka',
      subtotal: new Prisma.Decimal(2980),
      discountAmount: new Prisma.Decimal(298),
      discountCode: 'TEN',
      shippingFee: new Prisma.Decimal(60),
      total: new Prisma.Decimal(2742),
      items: {
        create: {
          productName: 'Oxford Shirt',
          variantLabel: 'M / Blue',
          sku: 'OXF-M',
          unitPrice: new Prisma.Decimal(1490),
          quantity: 2,
          lineTotal: new Prisma.Decimal(2980),
        },
      },
    },
  })
}
