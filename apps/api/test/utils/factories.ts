// Small helpers that put realistic rows straight into the test database,
// so each test can set up exactly the situation it needs in a line or two.
import { Prisma } from '@nowoll/database'
import { testPrisma } from './test-db.js'

let counter = 0
const next = () => ++counter

export async function makeCategory(
  fields: { name?: string; parentId?: string; isActive?: boolean } = {},
) {
  const n = next()
  const name = fields.name ?? `Category ${n}`
  return testPrisma().category.create({
    data: {
      name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${n}`,
      parentId: fields.parentId ?? null,
      isActive: fields.isActive ?? true,
    },
  })
}

interface VariantSpec {
  size: string
  color: string
  stock?: number
  price?: string
  colorHex?: string
  isActive?: boolean
}

/** A product with variants and (unless `withImage: false`) one image. ACTIVE by default. */
export async function makeProduct(fields: {
  categoryId: string
  name?: string
  basePrice?: string
  compareAtPrice?: string
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  tags?: string[]
  description?: string
  isFeatured?: boolean
  createdAt?: Date
  variants?: VariantSpec[]
  withImage?: boolean
}) {
  const n = next()
  const name = fields.name ?? `Product ${n}`
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${n}`
  const variants = fields.variants ?? [{ size: 'M', color: 'Black', stock: 5 }]

  return testPrisma().product.create({
    data: {
      name,
      slug,
      categoryId: fields.categoryId,
      basePrice: new Prisma.Decimal(fields.basePrice ?? '1000'),
      compareAtPrice: fields.compareAtPrice ? new Prisma.Decimal(fields.compareAtPrice) : null,
      status: fields.status ?? 'ACTIVE',
      tags: fields.tags ?? [],
      description: fields.description ?? null,
      isFeatured: fields.isFeatured ?? false,
      ...(fields.createdAt && { createdAt: fields.createdAt }),
      variants: {
        create: variants.map((v, i) => ({
          sku: `SKU-${n}-${i}`,
          size: v.size,
          color: v.color,
          colorHex: v.colorHex ?? null,
          stock: v.stock ?? 5,
          price: v.price ? new Prisma.Decimal(v.price) : null,
          isActive: v.isActive ?? true,
          sortOrder: i,
        })),
      },
      ...(fields.withImage !== false && {
        images: {
          create: {
            url: `https://example.supabase.co/storage/v1/object/public/product-images/${slug}.jpg`,
            storagePath: `products/${slug}.jpg`,
            altText: `${name} photo`,
          },
        },
      }),
    },
    // Ordered, so tests can rely on variants[0] being the first one listed above.
    include: { variants: { orderBy: { sortOrder: 'asc' } }, images: true },
  })
}
