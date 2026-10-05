// Run with: pnpm db:seed   (also runs automatically after `prisma migrate reset`)
//
// Every write is an UPSERT with `update: {}` — "insert if missing, otherwise
// leave it alone". That makes the seed idempotent: safe to run any number of
// times, and it never overwrites values Rafi has changed in the admin panel.
import { config } from 'dotenv'
import path from 'node:path'
import { createPrismaClient } from '../src/client'
import {
  defaultContentBlocks,
  defaultPages,
  defaultSettings,
  defaultShippingZones,
} from './seed-data'

config({ path: path.resolve(__dirname, '../../../.env') })

const prisma = createPrismaClient()

async function main() {
  for (const s of defaultSettings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, value: s.value, description: s.description },
    })
  }

  for (const z of defaultShippingZones) {
    await prisma.shippingZone.upsert({ where: { code: z.code }, update: {}, create: z })
  }

  for (const p of defaultPages) {
    await prisma.page.upsert({
      where: { slug: p.slug },
      update: {},
      create: {
        ...p,
        content: `${p.title} — placeholder. Edit in Admin → Content.`,
        status: 'DRAFT',
      },
    })
  }

  for (const block of defaultContentBlocks) {
    await prisma.contentBlock.upsert({ where: { key: block.key }, update: {}, create: block })
  }

  console.log(
    `Seeded ${defaultSettings.length} settings, ${defaultShippingZones.length} shipping zones, ` +
      `${defaultPages.length} pages, ${defaultContentBlocks.length} content blocks.`,
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
