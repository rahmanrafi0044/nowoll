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

// Women's wear only (Rafi, 38f). Under one "Women" parent, so the menu shows
// a drop-down with each category's photo.
const CATEGORIES = [
  {
    slug: 'perf-three-piece',
    name: 'Three-Piece',
    fabric: 'Lawn',
    colors: [
      ['Ivory', '#efe6d6'],
      ['Sage', '#9caf88'],
      ['Rust', '#a4532f'],
      ['Midnight', '#1f2a44'],
    ],
  },
  {
    slug: 'perf-kurtis',
    name: 'Kurtis',
    fabric: 'Cotton',
    colors: [
      ['Blush', '#e3b7b0'],
      ['Mustard', '#d4a63a'],
      ['Teal', '#2a6f73'],
      ['Plum', '#5b2a4a'],
    ],
  },
  {
    slug: 'perf-festive',
    name: 'Festive',
    fabric: 'Chiffon',
    colors: [
      ['Maroon', '#6e1f2b'],
      ['Emerald', '#1f5e46'],
      ['Gold', '#c9a24a'],
      ['Wine', '#4a1630'],
    ],
  },
  {
    slug: 'perf-co-ords',
    name: 'Co-ords',
    fabric: 'Linen',
    colors: [
      ['Sand', '#d8c3a5'],
      ['Olive', '#6b6f3a'],
      ['Powder Blue', '#9fb6cd'],
      ['Black', '#1c1c1c'],
    ],
  },
] as const
const NAMES = ['Mehr', 'Noor', 'Zara', 'Ayesha', 'Rima', 'Sara', 'Nila', 'Tara', 'Mira', 'Lina']
const PER_CATEGORY = 25
/** The category the speed audit measures (and its product -1). */
export const LAUNCH_CATEGORY = CATEGORIES[0].slug
const DAY = 24 * 60 * 60 * 1000

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
  // A long tunic with a dupatta over one shoulder, on a soft studio background
  // — a stand-in for a real product photo (same weight, not the same beauty).
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 800 1000" preserveAspectRatio="xMidYMid slice">
    <defs><radialGradient id="bg" cx="50%" cy="35%" r="80%">
      <stop offset="0%" stop-color="#f6f1ea"/><stop offset="100%" stop-color="#ddd3c6"/></radialGradient></defs>
    <rect width="800" height="1000" fill="url(#bg)"/>
    <path d="M330 120 Q400 160 470 120 L540 150 L640 330 L590 350 L545 260 L560 880 L240 880 L255 260 L210 350 L160 330 L260 150 Z"
      fill="${hex}" stroke="rgba(0,0,0,0.12)" stroke-width="3"/>
    <path d="M470 120 L540 150 Q470 420 560 700 L600 900 L520 900 Q430 520 470 120 Z"
      fill="${hex}" opacity="0.55" stroke="rgba(0,0,0,0.08)" stroke-width="2"/>
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
  await photo('hero-2.jpg', '#7d5f2e', 2400, 1200, heroGrain) // 38f: a second slide
  await photo('story.jpg', '#c9b79c', 1200, 1500, productGrain)

  const db = createPrismaClient(E2E_DATABASE_URL)
  try {
    // 38f: a sample WhatsApp number ("Ask on WhatsApp") and search suggestions.
    for (const [key, value] of [
      ['store_whatsapp', '+8801700000000'],
      ['search_suggestions', 'Lawn, Three-piece, Kurti, Eid'],
    ] as const)
      await db.setting.upsert({ where: { key }, create: { key, value }, update: { value } })
    // 38f: free delivery inside Dhaka from ৳3,000, so the bag shows its progress bar.
    await db.shippingZone.update({
      where: { code: 'DHAKA' },
      data: { freeShippingThreshold: new Prisma.Decimal(3000) },
    })

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
          more: [
            {
              heading: 'The Eid edit',
              subheading: 'Soft lawn and festive colour, made for long days.',
              ctaLabel: 'See the edit',
              ctaHref: `/shop/${CATEGORIES[2]!.slug}`,
              imageUrl: '/perf/hero-2.jpg',
              imageAlt: 'Models in festive three-pieces',
            },
          ],
        },
      },
    })

    // 38f: a homepage that uses the new sections (round photo links, photo
    // and text, brand story) between the product rows.
    const layout = {
      sections: [
        { id: 'hero', type: 'hero', visible: true },
        {
          id: 'occasions',
          type: 'circles',
          visible: true,
          title: 'Shop by category',
          items: CATEGORIES.map((c) => ({
            imageUrl: `/perf/${c.slug}.jpg`,
            imageAlt: c.name,
            label: c.name,
            href: `/shop/${c.slug}`,
          })),
        },
        { id: 'new-arrivals', type: 'new_arrivals', visible: true, title: null },
        {
          id: 'eid-split',
          type: 'split',
          visible: true,
          imageUrl: '/perf/tile.jpg',
          imageAlt: 'A model in a blush cotton kurti',
          heading: 'Everyday kurtis, made to last',
          text: 'Breathable cotton and lawn, cut for Dhaka summers and long workdays.',
          ctaLabel: 'Shop kurtis',
          href: `/shop/${CATEGORIES[1]!.slug}`,
          imageSide: 'left',
        },
        { id: 'featured', type: 'featured', visible: true, title: 'Loved this week' },
        {
          id: 'story',
          type: 'story',
          visible: true,
          heading: 'Always new',
          text: 'Nowoll is a small Dhaka label making clothes for every day and every occasion.\nNew pieces arrive every week.',
          imageUrl: '/perf/story.jpg',
          imageAlt: 'Fabric swatches on a cutting table',
          ctaLabel: 'Shop everything',
          href: '/shop',
        },
        { id: 'newsletter', type: 'newsletter', visible: true },
      ],
    }
    await db.contentBlock.upsert({
      where: { key: 'homepage_layout' },
      create: { key: 'homepage_layout', data: layout },
      update: { data: layout, isActive: true },
    })

    // "Women" — the menu's top item with a drop-down of the four categories.
    await photo('women.jpg', '#9caf88', 1200, 1500, productGrain)
    await photo('tile-wide.jpg', '#a4532f', 2400, 1200, heroGrain)
    await photo('tile.jpg', '#e3b7b0', 1200, 1500, productGrain)
    // 38f: a three-piece size chart, used by the Three-Piece category.
    const threePieceChart = await db.sizeChart.create({
      data: {
        name: 'Three-piece — regular fit',
        unit: 'INCH',
        note: 'Measured flat across the garment. Between sizes? Choose the larger one.',
        pieces: [
          {
            name: 'Kameez',
            columns: ['Chest', 'Length', 'Sleeve', 'Shoulder'],
            rows: [
              { size: 'S', values: ['36', '40', '22', '14'] },
              { size: 'M', values: ['38', '41', '22.5', '14.5'] },
              { size: 'L', values: ['40', '42', '23', '15'] },
              { size: 'XL', values: ['42-43', '43', '23.5', '15.5'] },
            ],
          },
          {
            name: 'Salwar',
            columns: ['Waist', 'Hip', 'Length'],
            rows: [
              { size: 'S', values: ['26-28', '38', '38'] },
              { size: 'M', values: ['28-30', '40', '39'] },
              { size: 'L', values: ['30-32', '42', '40'] },
              { size: 'XL', values: ['32-34', '44', '40'] },
            ],
          },
        ],
      },
    })
    const women = await db.category.create({
      data: {
        name: 'Women',
        slug: 'perf-women',
        sortOrder: 5,
        imageUrl: '/perf/women.jpg',
        imageAlt: 'Women',
      },
    })
    for (const [c, cat] of CATEGORIES.entries()) {
      await photo(`${cat.slug}.jpg`, cat.colors[1][1], 1200, 1500, productGrain)
      // 38f photo tiles: a wide one in the first category, a normal one in the second.
      const editorial =
        c === 0
          ? [
              {
                imageUrl: '/perf/tile-wide.jpg',
                imageAlt: 'Models in lawn three-pieces in a sunlit courtyard',
                heading: 'The Eid edit',
                text: 'Soft lawn in festive colours, made for long days.',
                href: `/shop/${cat.slug}`,
                position: 4,
                wide: true,
              },
            ]
          : c === 1
            ? [
                {
                  imageUrl: '/perf/tile.jpg',
                  imageAlt: 'A model in a blush cotton kurti',
                  heading: 'Everyday kurtis',
                  text: null,
                  href: null,
                  position: 6,
                  wide: false,
                },
              ]
            : []
      const category = await db.category.create({
        data: {
          name: cat.name,
          slug: cat.slug,
          sortOrder: c + 10,
          parentId: women.id,
          imageUrl: `/perf/${cat.slug}.jpg`,
          imageAlt: cat.name,
          editorial,
          sizeChartId: c === 0 ? threePieceChart.id : null,
        },
      })
      for (let i = 0; i < PER_CATEGORY; i++) {
        const slug = `${cat.slug}-${i + 1}`
        const [colorName, hex] = cat.colors[i % cat.colors.length]!
        const name = `${NAMES[i % NAMES.length]} ${cat.name}${i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''}`
        // Two photos each (hover / swipe on the card, a gallery on the product page).
        const images = []
        for (let j = 0; j < 2; j++) {
          const file = `${slug}-${j + 1}.jpg`
          await photo(file, j === 0 ? hex : '#c9b79c', 1200, 1500, productGrain)
          images.push({
            url: `/perf/${file}`,
            storagePath: `perf/${file}`,
            altText: `${name} in ${colorName}${j ? ', detail' : ''}`,
            sortOrder: j,
          })
        }
        const price = 1890 + i * 150
        // A realistic mix, so every badge and price style shows (38f):
        const sale = i % 7 === 3 // "-x%" with the "was" price
        const soldOut = i % 11 === 5
        const ranged = i % 5 === 2 // XL costs more → "From ৳…"
        await db.product.create({
          data: {
            name,
            slug,
            categoryId: category.id,
            basePrice: new Prisma.Decimal(price),
            compareAtPrice: sale ? new Prisma.Decimal(Math.round(price * 1.25)) : null,
            status: 'ACTIVE',
            isFeatured: i === 8 || i === 12, // older pieces, so "Featured" differs from "New arrivals"
            description: `A ${cat.fabric.toLowerCase()} ${cat.name.toLowerCase()} in ${colorName.toLowerCase()}, made for everyday elegance.`,
            tags: [cat.name.toLowerCase(), cat.fabric.toLowerCase()],
            fabric: cat.fabric,
            care: 'Gentle hand wash in cold water. Dry in shade. Iron on the reverse.',
            fitNote: 'Relaxed fit. Model wears S, height 5′5″.',
            readyToShip: i % 3 === 0,
            // The first few are new; a couple were restocked 3 days ago; the rest are older.
            createdAt: new Date(Date.now() - (i < 4 ? i : 40 + i) * DAY),
            restockedAt: i === 6 || i === 9 ? new Date(Date.now() - 3 * DAY) : null,
            images: { create: images },
            variants: {
              create: ['S', 'M', 'L', 'XL'].map((size, k) => ({
                sku: `PERF-${c}-${i}-${size}`,
                size,
                color: colorName,
                colorHex: hex,
                stock: soldOut ? 0 : 20,
                price: ranged && size === 'XL' ? new Prisma.Decimal(price + 200) : null,
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
