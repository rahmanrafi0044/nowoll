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

export const user = (fields: Partial<Prisma.UserUncheckedCreateInput> = {}) =>
  db.user.create({
    data: { id: randomUUID(), email: 'rafi@example.com', fullName: 'Rafi Rahman', ...fields },
  })

/** A delivered (by default) cash order of one shirt, optionally signed in, with a paid payment. */
export async function order(fields: Partial<Prisma.OrderUncheckedCreateInput> = {}) {
  return db.order.create({
    data: {
      status: 'DELIVERED',
      paymentMethod: 'COD',
      paymentStatus: 'PAID',
      email: 'rafi@example.com',
      phone: '+8801712345678',
      customerName: 'Rafi Rahman',
      shippingAddressLine1: 'House 12',
      shippingDistrict: 'Dhaka',
      shippingDivision: 'Dhaka',
      shippingZoneName: 'Inside Dhaka',
      subtotal: new Prisma.Decimal(1490),
      total: new Prisma.Decimal(1550),
      ...fields,
      items: {
        create: {
          productName: 'Oxford Shirt',
          variantLabel: 'M / Blue',
          sku: 'OXF-M',
          unitPrice: new Prisma.Decimal(1490),
          quantity: 1,
          lineTotal: new Prisma.Decimal(1490),
        },
      },
      payments: {
        create: {
          method: (fields.paymentMethod as 'COD' | 'SSLCOMMERZ' | undefined) ?? 'COD',
          status: 'PAID',
          amount: new Prisma.Decimal(1550),
          transactionId: `NW-${randomUUID().slice(0, 8)}`,
        },
      },
    },
    include: { items: true, payments: true },
  })
}
