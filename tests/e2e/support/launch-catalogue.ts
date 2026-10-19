// ============================================================================
// A launch-sized catalogue for the speed audit (step 51, run-lighthouse.ts):
// 4 categories × 25 products, every product with its own photo, plus a hero
// photo on the homepage — so Lighthouse measures what ad visitors will get,
// not a near-empty test shop.
//
// WHY "photo-weight" images: the demo placeholders are flat colour (a few KB),
// which would make every page look faster than it will with real photos.
// These are generated at real-photo size (1200×1500, the hero 2400×1200) with
// fine grain, so they weigh like phone photos — next/image then resizes them
// exactly as it will resize the owner's uploads.
//
// The photos go to apps/storefront/public/perf/ (git-ignored, recreated each
// run) and are served by the shop itself.
// ============================================================================
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { createPrismaClient, Prisma } from '@nowoll/database'
import sharp from 'sharp'
import { E2E_DATABASE_URL } from './env.js'
import { SHOP_DIR } from './servers.js'

export const PHOTO_DIR = path.join(SHOP_DIR, 'public/perf')

const CATEGORIES = [
  { slug: 'perf-panjabi', name: 'Panjabi', colors: ['#f4efe6', '#1f3a5f', '#7a1f2b', '#2f4f3a'] },
  { slug: 'perf-shirts', name: 'Shirts', colors: ['#dfe7f2', '#ffffff', '#3b5b8c', '#c9b79c'] },
  { slug: 'perf-kurti', name: 'Kurti', colors: ['#e8a0b4', '#f2c94c', '#6c4f8c', '#2a9d8f'] },
  { slug: 'perf-tshirts', name: 'T-Shirts', colors: ['#111111', '#e5e5e5', '#b23a48', '#577590'] },
]
const PER_CATEGORY = 25
/** The category the speed audit measures (and its product -1). */
export const LAUNCH_CATEGORY = CATEGORIES[0]!.slug

/** Fine grain at the given size, made once and laid over every photo. */
async function grain(width: number, height: number): Promise<Buffer> {
  const noise = Buffer.alloc(width * height)
  for (let i = 0; i < noise.length; i++) noise[i] = 96 + Math.floor(Math.random() * 64)
  return sharp(noise, { raw: { width, height, channels: 1 } })
    .blur(0.6)
    .png()
    .toBuffer()
}

function garmentSvg(hex: string, width: number, height: number): string {
  // A garment silhouette on a soft studio background, like a product photo.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 800 1000" preserveAspectRatio="xMidYMid slice">
    <defs><radialGradient id="bg" cx="50%" cy="40%" r="75%">
      <stop offset="0%" stop-color="#f7f5f2"/><stop offset="100%" stop-color="#d9d4cc"/></radialGradient></defs>
    <rect width="800" height="1000" fill="url(#bg)"/>
    <path d="M300 180 L250 200 L130 290 L190 400 L250 360 L250 840 L550 840 L550 360 L610 400 L670 290 L550 200 L500 180 Q400 250 300 180 Z"
      fill="${hex}" stroke="rgba(0,0,0,0.15)" stroke-width="4"/>
  </svg>`
}

async function photo(file: string, hex: string, width: number, height: number, texture: Buffer) {
  await sharp(Buffer.from(garmentSvg(hex, width, height)))
    .composite([{ input: texture, blend: 'overlay' }])
    .jpeg({ quality: 85 }) // what a phone or camera gives the owner
    .toFile(path.join(PHOTO_DIR, file))
}

/** Adds the catalogue to the (already seeded) e2e database. */
export async function seedLaunchCatalogue(): Promise<void> {
  rmSync(PHOTO_DIR, { recursive: true, force: true })
  mkdirSync(PHOTO_DIR, { recursive: true })
  const productGrain = await grain(1200, 1500)
  const heroGrain = await grain(2400, 1200)

  await photo('hero.jpg', '#1f3a5f', 2400, 1200, heroGrain)

  const db = createPrismaClient(E2E_DATABASE_URL)
  try {
    await db.contentBlock.update({
      where: { key: 'homepage_hero' },
      data: {
        data: {
          heading: 'always new',
          subheading: 'Everyday clothing for Bangladesh — delivered nationwide.',
          ctaLabel: 'Shop now',
          ctaHref: '/shop',
          imageUrl: '/perf/hero.jpg',
          imageAlt: 'The new Eid collection',
        },
      },
    })

    for (const [c, cat] of CATEGORIES.entries()) {
      const category = await db.category.create({
        data: { name: cat.name, slug: cat.slug, sortOrder: c + 10 },
      })
      for (let i = 0; i < PER_CATEGORY; i++) {
        const slug = `${cat.slug}-${i + 1}`
        const hex = cat.colors[i % cat.colors.length]!
        // Two photos each (the product page shows a gallery).
        const images = []
        for (let j = 0; j < 2; j++) {
          const file = `${slug}-${j + 1}.jpg`
          await photo(file, j === 0 ? hex : '#c9b79c', 1200, 1500, productGrain)
          images.push({
            url: `/perf/${file}`,
            storagePath: `perf/${file}`,
            altText: `${cat.name} ${i + 1}`,
            sortOrder: j,
          })
        }
        await db.product.create({
          data: {
            name: `${cat.name} ${i + 1}`,
            slug,
            categoryId: category.id,
            basePrice: new Prisma.Decimal(990 + i * 50),
            status: 'ACTIVE',
            isFeatured: i < 2,
            description: `A ${cat.name.toLowerCase()} in soft, breathable cotton. Made for everyday wear.`,
            tags: [cat.name.toLowerCase()],
            images: { create: images },
            variants: {
              create: ['S', 'M', 'L', 'XL'].map((size, k) => ({
                sku: `PERF-${c}-${i}-${size}`,
                size,
                color: 'Main',
                colorHex: hex,
                stock: 20,
                sortOrder: k,
              })),
            },
          },
        })
      }
    }
  } finally {
    await db.$disconnect()
  }
}
