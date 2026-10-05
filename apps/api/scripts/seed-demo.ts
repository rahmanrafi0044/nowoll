// ============================================================================
// pnpm db:seed:demo           — fills your LOCAL database with demo products
// pnpm db:seed:demo --remove  — deletes all of it again
//
// For development only: lets you see the storefront working before real
// products exist. Safety rules:
//   • refuses to run unless DATABASE_URL points at this computer (localhost)
//   • every demo slug starts with "demo-", and --remove deletes ONLY those —
//     a real category called "Men" (slug "men") is never touched
//   • photos are generated into apps/storefront/public/demo/ (git-ignored);
//     nothing is uploaded to Supabase
// ============================================================================
/* eslint-disable no-console -- command-line script */
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { createPrismaClient, Prisma } from '@nowoll/database'
import sharp from 'sharp'

const url = new URL(process.env.DATABASE_URL ?? '')
if (!['localhost', '127.0.0.1', '::1'].includes(url.hostname) || url.pathname.endsWith('_test')) {
  console.error(
    `✗ Refusing: demo data is only for your local dev database (got ${url.hostname}${url.pathname}).`,
  )
  process.exit(1)
}

const prisma = createPrismaClient(url.toString())
const IMAGE_DIR = path.resolve(import.meta.dirname, '../../storefront/public/demo')

interface DemoProduct {
  slug: string
  name: string
  category: string
  price: string
  compareAt?: string
  featured?: boolean
  description: string
  tags: string[]
  sizes: string[]
  colors: { name: string; hex: string }[]
  soldOut?: boolean
}

const CATEGORIES = [
  { slug: 'demo-men', name: 'Men', parent: null, sortOrder: 1 },
  { slug: 'demo-women', name: 'Women', parent: null, sortOrder: 2 },
  { slug: 'demo-kids', name: 'Kids', parent: null, sortOrder: 3 },
  { slug: 'demo-men-shirts', name: 'Shirts', parent: 'demo-men', sortOrder: 1 },
  { slug: 'demo-men-panjabi', name: 'Panjabi', parent: 'demo-men', sortOrder: 2 },
  { slug: 'demo-women-kurti', name: 'Kurti', parent: 'demo-women', sortOrder: 1 },
]

const PRODUCTS: DemoProduct[] = [
  {
    slug: 'demo-oxford-cotton-shirt',
    name: 'Oxford Cotton Shirt',
    category: 'demo-men-shirts',
    price: '1490',
    featured: true,
    description: 'A crisp everyday shirt in breathable cotton oxford.',
    tags: ['cotton', 'office'],
    sizes: ['S', 'M', 'L', 'XL'],
    colors: [
      { name: 'White', hex: '#F5F5F0' },
      { name: 'Sky Blue', hex: '#8EC5E8' },
    ],
  },
  {
    slug: 'demo-linen-casual-shirt',
    name: 'Linen Casual Shirt',
    category: 'demo-men-shirts',
    price: '1890',
    compareAt: '2290',
    description: 'Light linen for hot, humid days.',
    tags: ['linen', 'summer'],
    sizes: ['M', 'L', 'XL'],
    colors: [
      { name: 'Beige', hex: '#D8C8A8' },
      { name: 'Olive', hex: '#6B7A4B' },
    ],
  },
  {
    slug: 'demo-eid-silk-panjabi',
    name: 'Eid Silk Panjabi',
    category: 'demo-men-panjabi',
    price: '3490',
    featured: true,
    description: 'Soft silk-blend panjabi with a subtle sheen — made for Eid.',
    tags: ['eid', 'festive'],
    sizes: ['38', '40', '42', '44'],
    colors: [
      { name: 'Maroon', hex: '#7A1F2B' },
      { name: 'Ivory', hex: '#F2EDE0' },
    ],
  },
  {
    slug: 'demo-cotton-panjabi',
    name: 'Cotton Panjabi',
    category: 'demo-men-panjabi',
    price: '1990',
    soldOut: true,
    description: 'Comfortable cotton panjabi for Friday prayers and family visits.',
    tags: ['cotton'],
    sizes: ['40', '42'],
    colors: [{ name: 'Navy', hex: '#1F2A44' }],
  },
  {
    slug: 'demo-printed-kurti',
    name: 'Printed Kurti',
    category: 'demo-women-kurti',
    price: '1290',
    compareAt: '1590',
    featured: true,
    description: 'Everyday printed kurti in soft cotton.',
    tags: ['cotton', 'printed'],
    sizes: ['S', 'M', 'L'],
    colors: [
      { name: 'Teal', hex: '#2A7F7F' },
      { name: 'Mustard', hex: '#D4A017' },
    ],
  },
  {
    slug: 'demo-embroidered-kurti',
    name: 'Embroidered Kurti',
    category: 'demo-women-kurti',
    price: '2290',
    description: 'Hand-finished embroidery on the yoke and sleeves.',
    tags: ['embroidered', 'festive'],
    sizes: ['S', 'M', 'L', 'XL'],
    colors: [{ name: 'Rose', hex: '#C77D8C' }],
  },
  {
    slug: 'demo-kids-graphic-tee',
    name: 'Kids Graphic Tee',
    category: 'demo-kids',
    price: '590',
    featured: true,
    description: 'Soft cotton tee with a playful print.',
    tags: ['kids', 'cotton'],
    sizes: ['4-5Y', '6-7Y', '8-9Y'],
    colors: [
      { name: 'Yellow', hex: '#F2C94C' },
      { name: 'Red', hex: '#D64545' },
    ],
  },
  {
    slug: 'demo-kids-denim-shorts',
    name: 'Kids Denim Shorts',
    category: 'demo-kids',
    price: '790',
    description: 'Durable denim shorts with an adjustable waist.',
    tags: ['kids', 'denim'],
    sizes: ['4-5Y', '6-7Y', '8-9Y'],
    colors: [{ name: 'Denim', hex: '#3B5B8C' }],
  },
]

/** A simple garment silhouette in the given color — no text, so no fonts needed. */
function placeholderImage(hex: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">
    <rect width="800" height="1000" fill="#F3F1EE"/>
    <path d="M300 180 L250 200 L130 290 L190 400 L250 360 L250 840 L550 840 L550 360 L610 400 L670 290 L550 200 L500 180 Q400 250 300 180 Z"
      fill="${hex}" stroke="rgba(0,0,0,0.12)" stroke-width="4"/>
  </svg>`
  return sharp(Buffer.from(svg)).webp({ quality: 80 }).toBuffer()
}

async function remove(): Promise<void> {
  const products = await prisma.product.findMany({
    where: { slug: { startsWith: 'demo-' } },
    select: { id: true },
  })
  const productIds = products.map((p) => p.id)
  await prisma.$transaction([
    prisma.inventoryLog.deleteMany({ where: { variant: { productId: { in: productIds } } } }),
    prisma.productImage.deleteMany({ where: { productId: { in: productIds } } }),
    prisma.productVariant.deleteMany({ where: { productId: { in: productIds } } }),
    prisma.product.deleteMany({ where: { id: { in: productIds } } }),
    // children before parents
    prisma.category.deleteMany({
      where: { slug: { startsWith: 'demo-' }, parentId: { not: null } },
    }),
    prisma.category.deleteMany({ where: { slug: { startsWith: 'demo-' } } }),
  ])
  rmSync(IMAGE_DIR, { recursive: true, force: true })
  console.log(`✓ removed ${productIds.length} demo products, their categories and photos`)
}

async function seed(): Promise<void> {
  await remove() // start clean, so running it twice gives the same result

  const categoryIds = new Map<string, string>()
  for (const c of CATEGORIES) {
    const created = await prisma.category.create({
      data: {
        slug: c.slug,
        name: c.name,
        sortOrder: c.sortOrder,
        parentId: c.parent ? categoryIds.get(c.parent)! : null,
      },
    })
    categoryIds.set(c.slug, created.id)
  }

  mkdirSync(IMAGE_DIR, { recursive: true })
  const now = Date.now()
  for (const [i, p] of PRODUCTS.entries()) {
    const images: { url: string; storagePath: string; altText: string; sortOrder: number }[] = []
    for (const [j, color] of p.colors.entries()) {
      const file = `${p.slug}-${j + 1}.webp`
      await sharp(await placeholderImage(color.hex)).toFile(path.join(IMAGE_DIR, file))
      images.push({
        url: `/demo/${file}`,
        storagePath: `demo/${file}`,
        altText: `${p.name} in ${color.name}`,
        sortOrder: j,
      })
    }

    let n = 0
    const variants = p.colors.flatMap((color) =>
      p.sizes.map((size) => ({
        sku: `DEMO-${i + 1}-${size}-${color.name}`.toUpperCase().replace(/[^A-Z0-9-]/g, ''),
        size,
        color: color.name,
        colorHex: color.hex,
        stock: p.soldOut ? 0 : (n * 7 + i * 3) % 15, // a mix of 0, low and plenty
        sortOrder: n++,
      })),
    )

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          slug: p.slug,
          name: p.name,
          description: p.description,
          shortDescription: p.description,
          categoryId: categoryIds.get(p.category)!,
          basePrice: new Prisma.Decimal(p.price),
          compareAtPrice: p.compareAt ? new Prisma.Decimal(p.compareAt) : null,
          status: 'ACTIVE',
          isFeatured: p.featured ?? false,
          tags: p.tags,
          createdAt: new Date(now - (PRODUCTS.length - i) * 86_400_000), // one per day → visible "newest" order
          variants: { create: variants },
          images: { create: images },
        },
        include: { variants: true },
      })
      const stocked = product.variants.filter((v) => v.stock > 0)
      await tx.inventoryLog.createMany({
        data: stocked.map((v) => ({
          variantId: v.id,
          change: v.stock,
          stockAfter: v.stock,
          reason: 'INITIAL_STOCK',
          note: 'Demo data',
        })),
      })
    })
  }
  console.log(
    `✓ created ${CATEGORIES.length} categories and ${PRODUCTS.length} products with photos`,
  )
  console.log(
    '  Open http://localhost:3000 — remove everything later with: pnpm db:seed:demo --remove',
  )
}

const run = process.argv.includes('--remove') ? remove : seed
run()
  .catch((error: unknown) => {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
